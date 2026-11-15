"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { monitorDistress } from "@/lib/distress-audio";
import { saveEvidence, type Coordinates, type Incident } from "@/lib/safety-storage";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";
import type { RouteOption } from "@/lib/demo-routes";

type Session = { destination: string; route?: RouteOption; audible: boolean; camera: boolean; location: boolean };
type Resources = { controller: AbortController; context?: AudioContext; mic?: MediaStream; watch?: number };
type Capture = { stream?: MediaStream; recorder?: MediaRecorder; timeout?: ReturnType<typeof setTimeout>; cancelled: boolean };
type CameraStatus = "Off" | "Camera ready" | "Waiting for camera" | "Recording" | "Saved on this device" | "Camera unavailable" | "Evidence could not be saved";
type Safety = {
  session: Session | null; listening: string; camera: CameraStatus; location: Coordinates | undefined;
  incident: Incident | null; incidents: Incident[]; seconds: number; alarm: boolean; hasPin: boolean;
  startSession: (session: Session) => Promise<void>; endSession: () => void; alert: (trigger: Incident["trigger"]) => void;
  escalate: () => void; markSafe: (code: string) => Promise<void>; silence: (code: string) => Promise<void>;
  forgetVideo: (id: string) => void; attachLocation: () => Promise<boolean>; syncStatus: string;
};
const SafetyContext = createContext<Safety | null>(null);
const delay = 8000;
const videoConstraints = { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } };
const alarmFile = "/jugnu/alarm.mp3";
export function AccountSafety({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  return <SafetyProvider key={user?.id ?? "guest"} userId={user?.id} hasPin={Boolean(user?.has_pin)} demo={Boolean(user?.demo)}>{children}</SafetyProvider>;
}

function SafetyProvider({ children, userId, hasPin, demo }: { children: ReactNode; userId?: number; hasPin: boolean; demo: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [listening, setListening] = useState("Off");
  const [location, setLocation] = useState<Coordinates>();
  const [camera, setCamera] = useState<CameraStatus>("Off");
  const [incident, setIncident] = useState<Incident | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [seconds, setSeconds] = useState(8);
  const [alarm, setAlarm] = useState(false);
  const [unlockedIncident, setUnlockedIncident] = useState<string>();
  const [syncStatus, setSyncStatus] = useState("");
  const storageKey = `jugnu.incidents.v2.${userId ?? "guest"}`;
  const queue = useRef(Promise.resolve());
  const resources = useRef<Resources>();
  const current = useRef<Incident | null>(null);
  const journal = useRef<Incident[]>([]);
  const position = useRef<Coordinates>();
  const siren = useRef<{ source: AudioScheduledSourceNode; timer?: ReturnType<typeof setInterval>; context: AudioContext; owned: boolean }>();
  const alarmBuffer = useRef<AudioBuffer>();
  const capture = useRef<Capture>();
  const deadline = useRef(0);
  const audioCooldown = useRef(0);
  const attemptedCalls = useRef(new Set<string>());
  const alertLocked = Boolean(incident && incident.id !== unlockedIncident && (incident.state === "pending" || incident.state === "active"));

  useEffect(() => {
    try {
      journal.current = (JSON.parse(localStorage.getItem(storageKey) || "[]") as Incident[])
        .map(item => item.state === "pending" ? { ...item, state: "interrupted", version: (item.version ?? 0) + 1 } : item);
      setIncidents(journal.current);
    } catch {}
    let mounted = true;
    if (userId) {
      if (journal.current.length) pushUpdates(journal.current, () => mounted);
      jugnuRequest<{incidents: Incident[]}>("incidents").then(result => {
        if (!mounted) return;
        const existing = new Set(journal.current.map(item => item.id));
        journal.current = [...journal.current, ...result.incidents.filter(item => !existing.has(item.id))]
          .sort((a, b) => b.created - a.created);
        setIncidents(journal.current);
      }).catch(() => {});
    }
    return () => {
      mounted = false;
      const active = resources.current;
      active?.controller.abort();
      active?.mic?.getTracks().forEach(track => track.stop());
      if (active?.watch !== undefined) navigator.geolocation.clearWatch(active.watch);
      if (active?.context) void active.context.close().catch(() => {});
      if (siren.current) {
        clearInterval(siren.current.timer);
        siren.current.source.stop();
        if (siren.current.owned) void siren.current.context.close().catch(() => {});
      }
      if (capture.current) {
        clearTimeout(capture.current.timeout);
        capture.current.cancelled = true;
        capture.current.stream?.getTracks().forEach(track => track.stop());
      }
    };
    // The account boundary remounts this provider on sign-in and sign-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!alertLocked) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [alertLocked]);

  useEffect(() => {
    if (!session && !alertLocked) return;
    let active = true;
    let lock: WakeLockSentinel | undefined;
    let requesting = false;
    async function keepScreenOn() {
      if (!navigator.wakeLock || document.hidden || requesting || (lock && !lock.released)) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (active) lock = next;
        else await next.release();
      } catch {
        // The OS can deny or release a wake lock, for example during battery saver.
      } finally { requesting = false; }
    }
    void keepScreenOn();
    document.addEventListener("visibilitychange", keepScreenOn);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", keepScreenOn);
      void lock?.release().catch(() => {});
    };
  }, [session, alertLocked]);

  function pushUpdates(items: Incident[], isCurrent = () => true) {
    if (!userId) return;
    queue.current = queue.current.then(async () => {
      if (!isCurrent()) return;
      try {
        for (const item of items) {
          await jugnuRequest("incidents", "POST", { ...item, owner: userId });
          const callEligible = item.state === "active" || (item.state === "pending" && item.trigger === "audio");
          const latest = current.current;
          if (demo && callEligible && latest?.id === item.id
              && (latest.state === "active" || latest.state === "pending") && !attemptedCalls.current.has(item.id)) {
            attemptedCalls.current.add(item.id);
            void requestDemoCall(item.id);
          }
        }
        if (isCurrent()) setSyncStatus("");
      } catch {
        if (isCurrent()) setSyncStatus("Incident saved on this device. Account sync is unavailable.");
      }
    });
  }

  async function requestDemoCall(id: string) {
    let callStatus: string;
    try {
      const result = await jugnuRequest<{ status: string }>("incidents/demo-call", "POST", { id });
      callStatus = result.status;
    } catch {
      callStatus = "unconfirmed";
    }
    const entry = journal.current.find(candidate => candidate.id === id);
    if (entry) record({ ...entry, callStatus });
  }

  function record(item: Incident) {
    item = { ...item, version: (item.version ?? 0) + 1 };
    journal.current = [item, ...journal.current.filter(entry => entry.id !== item.id)];
    setIncidents(journal.current);
    try { localStorage.setItem(storageKey, JSON.stringify(journal.current)); } catch {}
    pushUpdates([item]);
    if (!current.current || current.current.id === item.id) {
      current.current = item;
      setIncident(item);
    }
  }

  function stopAlarm() {
    const player = siren.current;
    if (player) {
      clearInterval(player.timer);
      player.source.stop();
      if (player.owned) void player.context.close().catch(() => {});
    }
    siren.current = undefined;
    setAlarm(false);
  }

  function startAlarm(context?: AudioContext) {
    stopAlarm();
    try {
      const audio = context ?? new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 660;
      gain.gain.value = 0.35;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      const timer = setInterval(() => oscillator.frequency.setTargetAtTime(oscillator.frequency.value > 750 ? 620 : 910, audio.currentTime, 0.07), 350);
      const player = { source: oscillator, timer, context: audio, owned: !context };
      siren.current = player;
      void audio.resume().then(() => {
        if (siren.current?.context === audio) setAlarm(audio.state === "running");
      }).catch(() => {});
      void (async () => {
        let buffer = alarmBuffer.current;
        if (!buffer) {
          const response = await fetch(alarmFile);
          if (!response.ok) return;
          buffer = await audio.decodeAudioData(await response.arrayBuffer());
          alarmBuffer.current = buffer;
        }
        if (siren.current !== player || audio.state === "closed") return;
        const recording = audio.createBufferSource();
        recording.buffer = buffer;
        recording.loop = true;
        recording.connect(audio.destination);
        recording.start();
        clearInterval(timer);
        oscillator.stop();
        siren.current = { source: recording, context: audio, owned: !context };
      })().catch(() => {});
    } catch {}
  }

  function stopCapture() {
    const active = capture.current;
    if (!active) return;
    active.cancelled = true;
    clearTimeout(active.timeout);
    if (active.recorder?.state === "recording") {
      active.recorder.stop();
    } else {
      active.stream?.getTracks().forEach(track => track.stop());
    }
    capture.current = undefined;
  }

  async function startCapture(id: string) {
    stopCapture();
    const take: Capture = { cancelled: false };
    capture.current = take;
    setCamera("Waiting for camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      if (take.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      take.stream = stream;
      const mimeType = ["video/webm;codecs=vp8", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000 });
      take.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        try {
          if (!chunks.length) throw new Error();
          await saveEvidence(id, new Blob(chunks, { type: recorder.mimeType }));
          const entry = journal.current.find(candidate => candidate.id === id);
          if (entry) record({ ...entry, video: true });
          if (current.current?.id === id) setCamera("Saved on this device");
        } catch { if (current.current?.id === id) setCamera("Evidence could not be saved"); }
        finally { stream.getTracks().forEach(track => track.stop()); }
      };
      recorder.onerror = () => {
        stopCapture();
        if (current.current?.id === id) setCamera("Evidence could not be saved");
      };
      recorder.start(1000);
      setCamera("Recording");
      if (demo && current.current?.trigger === "audio") void assessScene(id, stream, take);
      take.timeout = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 25000);
    } catch {
      take.stream?.getTracks().forEach(track => track.stop());
      if (!take.cancelled) setCamera("Camera unavailable");
    }
  }

  async function assessScene(id: string, stream: MediaStream, take: Capture) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const canvas = document.createElement("canvas");
    canvas.width = 336;
    canvas.height = 252;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    function frame() {
      if (!context || video.readyState < 2 || take.cancelled) return undefined;
      const height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      if (!height || !Number.isFinite(height)) return undefined;
      canvas.height = height;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        if (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2] >= 36) visible++;
      }
      if (visible < pixels.length / 16 * 0.18) return undefined;
      return canvas.toDataURL("image/jpeg", 0.57);
    }
    try {
      await video.play();
      const first = frame();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const second = frame();
      if (take.cancelled) return;
      const entry = journal.current.find(candidate => candidate.id === id);
      if (!entry || entry.state === "resolved") return;
      if (!first || !second || first === second) {
        record({ ...entry, review: "uncertain", summary: "The camera view was dark, still, or unclear. A check-in is needed." });
        return;
      }
      await queue.current;
      const result = await jugnuRequest<{ summary: string; benign: boolean }>("incidents/assessment", "POST", { id, frame: first, followup: second });
      const latest = journal.current.find(candidate => candidate.id === id);
      if (!latest || latest.state === "resolved") return;
      if (result.benign && current.current?.id === id && latest.state === "pending" && Date.now() < deadline.current) {
        audioCooldown.current = Date.now() + delay;
        record({ ...latest, state: "resolved", review: "benign", summary: result.summary });
        stopCapture();
        stopAlarm();
      } else record({ ...latest, review: "uncertain", summary: result.summary });
    } catch {
      const latest = journal.current.find(candidate => candidate.id === id);
      if (latest && latest.state !== "resolved") record({ ...latest, review: "uncertain", summary: "Scene assessment unavailable. A check-in is needed." });
    } finally {
      video.pause();
      video.srcObject = null;
    }
  }

  function trigger(kind: Incident["trigger"], options = session) {
    if (current.current?.state === "pending" || current.current?.state === "active") return;
    if (kind === "audio" && Date.now() < audioCooldown.current) return;
    const item: Incident = {
      id: crypto.randomUUID(), created: Date.now(), trigger: kind,
      state: kind === "manual" ? "active" : "pending",
      location: position.current,
      demo,
    };
    current.current = item;
    record(item);
    if (item.state === "pending") { deadline.current = Date.now() + delay; setSeconds(8); }
    if (options?.audible ?? true) startAlarm(resources.current?.context);
    if (options?.camera && navigator.mediaDevices) void startCapture(item.id);
    else setCamera("Off");
    router.push("/sos");
  }

  useEffect(() => {
    if (incident?.state !== "pending") return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining && current.current?.state === "pending") record({ ...current.current, state: "active" });
    }, 150);
    return () => clearInterval(timer);
    // The timer reads the current incident via its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.state]);

  function endSession() {
    if (current.current?.state === "pending" || current.current?.state === "active") return;
    const active = resources.current;
    resources.current = undefined;
    active?.controller.abort();
    active?.mic?.getTracks().forEach(track => track.stop());
    if (active?.watch !== undefined) navigator.geolocation.clearWatch(active.watch);
    stopAlarm();
    if (active?.context) void active.context.close().catch(() => {});
    stopCapture();
    position.current = undefined;
    setLocation(undefined);
    setListening("Off");
    setCamera("Off");
    setSession(null);
  }

  async function startSession(options: Session) {
    if (resources.current) return;
    const active: Resources = { controller: new AbortController() };
    resources.current = active;
    const signal = active.controller.signal;
    setSession(options);
    if (options.location && navigator.geolocation) {
      active.watch = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
        if (resources.current !== active) return;
        const point = { lat: coords.latitude, lng: coords.longitude, timestamp };
        position.current = point;
        setLocation(point);
        if (current.current && ["pending", "active"].includes(current.current.state) &&
          ["manual", "audio"].includes(current.current.trigger) && !current.current.location) {
          record({ ...current.current, location: point });
        }
      }, () => {}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    }
    setListening("Starting microphone and sound model…");
    try {
      active.context = new AudioContext();
      if (options.audible && !alarmBuffer.current) {
        const audio = active.context;
        void fetch(alarmFile, { signal }).then(async response => {
          if (response.ok && !signal.aborted) alarmBuffer.current = await audio.decodeAudioData(await response.arrayBuffer());
        }).catch(() => {});
      }
      await active.context.resume();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
      if (signal.aborted) { mic.getTracks().forEach(track => track.stop()); return; }
      active.mic = mic;
      if (options.camera) {
        setCamera("Waiting for camera");
        void navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints }).then(stream => {
          stream.getTracks().forEach(track => track.stop());
          if (!signal.aborted && !capture.current) setCamera("Camera ready");
        }).catch(() => {
          if (!signal.aborted && !capture.current) setCamera("Camera unavailable");
        });
      }
      const failed = () => {
        if (signal.aborted) return;
        active.controller.abort();
        active.mic?.getTracks().forEach(track => track.stop());
        setListening("Microphone or sound model unavailable");
      };
      mic.getAudioTracks().forEach(track => track.addEventListener("ended", failed, { once: true }));
      await monitorDistress(mic, active.context, () => trigger("audio", options), failed, signal);
      if (!signal.aborted) setListening("Listening for possible screams");
    } catch {
      if (!signal.aborted) {
        active.mic?.getTracks().forEach(track => track.stop());
        setListening("Microphone or sound model unavailable");
      }
    }
  }

  async function verifyPin(code: string) {
    if (hasPin) await jugnuRequest("account/pin", "POST", { pin: code });
  }
  return <SafetyContext.Provider value={{
    session, listening, camera, location, incident, incidents, seconds, alarm, hasPin, startSession, endSession, syncStatus,
    alert: kind => trigger(kind),
    escalate: () => { if (current.current?.state === "pending") record({ ...current.current, state: "active" }); },
    markSafe: async code => {
      const id = current.current?.id;
      await verifyPin(code);
      if (!current.current || current.current.id !== id) return;
      audioCooldown.current = Date.now() + delay;
      record({ ...current.current, state: "resolved" });
      stopCapture();
      stopAlarm();
    },
    silence: async code => {
      const id = current.current?.id;
      await verifyPin(code);
      if (!current.current || current.current.id !== id) return;
      setUnlockedIncident(id);
      stopAlarm();
    },
    forgetVideo: id => {
      const entry = journal.current.find(candidate => candidate.id === id);
      if (entry) record({ ...entry, video: false });
    },
    attachLocation: () => new Promise(resolve => {
      const item = current.current;
      if (!item || !navigator.geolocation || item.state !== "active" ||
          (item.trigger !== "manual" && item.trigger !== "audio")) { resolve(false); return; }
      navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
        const latest = current.current;
        if (latest?.id !== item.id || latest.state !== "active") { resolve(false); return; }
        record({ ...latest, location: { lat: coords.latitude, lng: coords.longitude, timestamp } });
        resolve(true);
      }, () => resolve(false), { timeout: 10000, maximumAge: 15000, enableHighAccuracy: true });
    }),
  }}>{children}</SafetyContext.Provider>;
}

export function useSafety() {
  const safety = useContext(SafetyContext);
  if (!safety) throw new Error("Safety provider is missing.");
  return safety;
}
