"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Hospital, Mic, Navigation, Phone } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";

type Recognition = NonNullable<Window["SpeechRecognition"]>;

export default function VoiceHelp() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [action, setAction] = useState<"places" | "routes" | "sos">();
  const recognition = useRef<InstanceType<Recognition>>();
  useEffect(() => () => { recognition.current?.abort(); }, []);

  async function run(command: string) {
    const phrase = command.trim();
    if (!phrase) return;
    setAction(undefined);
    if (/\b(hospital|police|nearby)\b/i.test(phrase)) { setAction("places"); setStatus(""); return; }
    if (/\b(sos|emergency|helpline)\b/i.test(phrase)) { setAction("sos"); setStatus(""); return; }
    setStatus("Looking up your request…");
    try {
      const response = await fetch("/api/jugnu/voice/process", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: phrase }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.command_type === "emergency") setAction("sos");
      if (result.command_type === "navigation") setAction("routes");
      setStatus(result.response_message || "");
    } catch {
      if (/route|direction/i.test(phrase)) { setAction("routes"); setStatus(""); }
      else setStatus("Voice help is unavailable. You can still open routes or nearby help.");
    }
  }

  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setStatus("Speech recognition is unavailable here. Type your request below."); return; }
    if (recognition.current) { recognition.current.abort(); recognition.current = undefined; setStatus(""); return; }
    const instance = new Speech();
    recognition.current = instance;
    instance.lang = "en-IN";
    instance.onresult = event => {
      const text = event.results[0][0].transcript;
      setQuery(text);
      void run(text);
    };
    instance.onend = () => { recognition.current = undefined; setStatus(previous => previous === "Listening…" ? "" : previous); };
    instance.onerror = () => { setStatus("Could not hear you. You can type your request below."); };
    setStatus("Listening…");
    try { instance.start(); } catch { recognition.current = undefined; setStatus("Microphone is unavailable."); }
  }

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Voice help" back="/" />
    <button className="voice-orb" onClick={listen} type="button" aria-label={status === "Listening…" ? "Stop listening" : "Tap to speak"}><Mic size={47} strokeWidth={2.4} /></button>
    <p className="text-center text-xl font-semibold">Tap to speak</p>
    <form className="screen-stack" onSubmit={event => { event.preventDefault(); void run(query); }}>
      <input className="jugnu-input" aria-label="Type a voice help request" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} placeholder="Find a hospital near me" />
      <button className="jugnu-button" type="submit" disabled={!query.trim()}>Find help</button>
    </form>
    {status && <p className="small-text" role="status">{status}</p>}
    {action === "places" && <Link className="jugnu-button secondary" href="/nearby"><Hospital />Nearby help</Link>}
    {action === "routes" && <Link className="jugnu-button secondary" href="/safe-route"><Navigation />Plan a route</Link>}
    {action === "sos" && <Link className="jugnu-button danger" href="/sos"><Phone />Emergency SOS</Link>}
  </div>;
}
