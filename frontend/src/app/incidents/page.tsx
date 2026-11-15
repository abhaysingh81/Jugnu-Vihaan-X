"use client";

import Link from "next/link";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Camera, History, Lock, MapPin, Sparkles, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";
import { useSafety } from "@/components/safety/SafetyProvider";
import { deleteEvidence, locationLink, policeDraft, readEvidence } from "@/lib/safety-storage";

export default function IncidentsPage() {
  const { user, loading } = useAccount();
  const safety = useSafety();
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("Timeline");
  const [clip, setClip] = useState("");
  const [frame, setFrame] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const item = safety.incidents.find(incident => incident.id === selected) ?? safety.incidents[0];
  const id = item?.id;
  const hasVideo = item?.video;

  useEffect(() => {
    let url = "";
    let cancelled = false;
    setClip(""); setFrame(""); setSummary(""); setConsent(false);
    if (id && hasVideo) readEvidence(id).then(blob => {
      if (blob && !cancelled) { url = URL.createObjectURL(blob); setClip(url); }
    }).catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [id, hasVideo]);

  function selectFrame(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (!video.videoWidth || Number.isNaN(video.duration)) return;
    const width = Math.min(480, video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.min(480, Math.round(video.videoHeight * width / video.videoWidth));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrame(canvas.toDataURL("image/jpeg", 0.61));
  }

  async function runSummary() {
    if (!item || !user || busy) return;
    setStatus(""); setSummary(""); setBusy(true);
    try {
      const result = await jugnuRequest<{summary: string; prune_receipt: boolean}>("incidents/assessment", "POST", { id: item.id, frame: consent && frame ? frame : undefined });
      setSummary(result.summary);
      setStatus(result.prune_receipt ? "Prune receipt received." : "");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Summary is unavailable."); }
    finally { setBusy(false); }
  }

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Incident details" back="/" />
    {loading ? <p>Loading account…</p> : !user ? <Link className="jugnu-button" href="/login">Sign in to view your incidents</Link> :
      !item && <section className="jugnu-panel content-panel screen-stack"><History className="text-primary" /><p>No incidents recorded yet.</p><Link className="jugnu-button" href="/journey">Start a safety session</Link></section>}
    {user && item && <>
      {safety.incidents.length > 1 && <label>Incident<select className="jugnu-input mt-2" disabled={busy} value={item.id} onChange={event => { setSelected(event.target.value); setStatus(""); }}>
        {safety.incidents.map(entry => <option value={entry.id} key={entry.id}>{new Date(entry.created).toLocaleString()} · {entry.trigger} · {entry.state}</option>)}
      </select></label>}
      <p className="small-text">JG-{item.id.slice(0, 6).toUpperCase()} · {new Date(item.created).toLocaleString()}</p>
      <div className="segmented" aria-label="Incident view">{["Timeline", "Evidence", "AI assessment"].map(name => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</div>
      {tab === "Timeline" && <section className="jugnu-panel content-panel"><h2 className="section-title capitalize">{item.state}</h2><div className="detail-list"><p><History size={20} />{item.trigger === "audio" ? "Sound-triggered alert" : "Manual SOS"}</p><p><MapPin size={20} />{item.location ? <a className="underline" href={locationLink(item.location)}>Open saved location</a> : "No location saved"}</p><p><Camera size={20} />{item.video ? "Recording saved on this device" : "No recording on this device"}</p></div></section>}
      {tab === "Evidence" && <section className="jugnu-panel content-panel screen-stack">
        <h2 className="section-title flex gap-2"><Lock className="text-primary" />Evidence vault</h2>
        {clip ? <>
          <video src={clip} controls playsInline className="w-full rounded-xl" />
          <div className="button-row"><a className="jugnu-button" href={clip} download={`jugnu-${item.id.slice(0, 6)}`}>Save recording</a><button className="jugnu-button secondary" onClick={async () => {
            try { await deleteEvidence(item.id); safety.forgetVideo(item.id); setStatus("Recording deleted."); }
            catch { setStatus("Could not delete the recording."); }
          }}><Trash2 size={18} />Delete recording</button></div>
        </> : <p>No playable recording on this device.</p>}
      </section>}
      {tab === "AI assessment" && <section className="jugnu-panel content-panel screen-stack">
        <h2 className="section-title flex gap-2"><Sparkles className="text-primary" />Scene assessment</h2>
        <p className="small-text">Review the incident and optionally share a frame from this recording for an assessment.</p>
        {item.summary && <p>{item.summary}</p>}
        {item.demo && item.trigger === "audio" && item.review !== "benign" && <div className="detail-list">
          <h3 className="section-title">Police call draft · simulation</h3>
          <p>{policeDraft(item)}</p>
        </div>}
        {clip && <>
          <label className="consent-row"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setFrame(""); }} />Share one frame with the AI provider for this assessment</label>
          {consent && <><video src={clip} controls muted playsInline onLoadedData={selectFrame} onSeeked={selectFrame} className="w-full rounded-xl" /><p className="small-text">Move the video to the frame you want to send.</p></>}
        </>}
        <button className="jugnu-button" type="button" onClick={runSummary} disabled={busy || (consent && !frame)}>{busy ? "Requesting assessment…" : "Request assessment"}</button>
        {summary && <p role="status">{summary}</p>}
      </section>}
      {safety.syncStatus && <p role="status" className="small-text">{safety.syncStatus}</p>}
      {status && <p role="status" className="small-text">{status}</p>}
    </>}
  </div>;
}
