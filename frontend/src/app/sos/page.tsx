"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, Delete, MapPin, Phone, Shield, Siren, UsersRound, Video } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";
import { useSafety } from "@/components/safety/SafetyProvider";
import { locationLink, policeDraft } from "@/lib/safety-storage";

const pendingCallStatuses = new Set(["submitting", "submitted", "queued", "initiated", "ringing", "in-progress"]);
const callLabels: Record<string, string> = {
  submitting: "Requesting call…",
  submitted: "Accepted by voice provider",
  queued: "Call queued",
  initiated: "Dialing your contact",
  ringing: "Contact’s phone ringing",
  "in-progress": "Call connected",
  completed: "Call ended",
  busy: "Contact’s line busy",
  "no-answer": "Contact did not answer",
  canceled: "Call canceled",
  failed: "Call failed",
  unconfigured: "Voice provider not configured",
  rejected: "Call rejected by provider",
  "geo-blocked": "Enable India in Twilio Voice Geographic Permissions",
  "caller-unverified": "Verify the outgoing caller ID in Twilio",
  "trial-restricted": "Twilio trial rejected the call parameters",
  cooldown: "Recent demo call · wait 60 seconds",
  unconfirmed: "Call status unconfirmed",
};

function Waveform() {
  return <div className="waveform" aria-hidden="true">{[5, 6, 12, 17, 24, 31, 42, 34, 27, 17, 13, 8, 4].map((height, i) => <i key={i} style={{ height }} />)}</div>;
}

export default function SOSPage() {
  const safety = useSafety();
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [deliveries, setDeliveries] = useState<{ contact: string; status: string }[]>([]);
  const { user } = useAccount();
  const incident = safety.incident;
  const demo = Boolean(user?.demo);
  const incidentId = incident?.id;
  const initialCallStatus = incident?.callStatus;
  const [providerCall, setProviderCall] = useState<{ id: string; status: string }>();
  const callStatus = providerCall?.id === incidentId ? providerCall?.status : initialCallStatus;
  const callText = callLabels[callStatus ?? ""] ?? (safety.syncStatus ? "Waiting for incident sync" : "Requesting call…");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!demo || !incidentId || !initialCallStatus || !pendingCallStatuses.has(initialCallStatus)) return;
    const id = incidentId;
    let stopped = false;
    let timer: number;
    const until = Date.now() + 90_000;
    async function refreshCall() {
      try {
        const { status: providerStatus } = await jugnuRequest<{ status: string }>(`incidents/demo-call/${id}`);
        if (stopped) return;
        setProviderCall({ id, status: providerStatus });
        if (!pendingCallStatuses.has(providerStatus)) return;
      } catch {
        if (stopped) return;
      }
      if (Date.now() < until) timer = window.setTimeout(refreshCall, 2500);
    }
    timer = window.setTimeout(refreshCall, 1500);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [demo, incidentId, initialCallStatus]);

  useEffect(() => {
    setDeliveries([]);
    setSmsOpen(false);
    setIncludeLocation(false);
  }, [incident?.id]);

  async function clear(event: FormEvent, silenceOnly: boolean) {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true);
    try { await (silenceOnly ? safety.silence(code) : safety.markSafe(code)); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Could not verify passcode."); return; }
    finally { setVerifying(false); }
    setCode("");
    setStatus("");
    setEntering(false);
  }

  async function share() {
    if (!incident?.location) return;
    const url = locationLink(incident.location);
    try {
      if (navigator.share) await navigator.share({ title: "Jugnu SOS location", text: "I may need help. My last known location:", url });
      else { await navigator.clipboard.writeText(url); setStatus("Location link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("Could not share the location link.");
    }
  }

  return <div className="sos-screen screen-stack">
    <PageHeading title={
      incident?.state === "pending" ? "Possible distress detected" :
      incident?.state === "active" ? "SOS active" :

      incident?.state === "resolved" ? incident.review === "benign" ? "Demo alert cancelled" : "Marked safe" : "Emergency SOS"
    } back="/"/>
    {!incident && <>
      <div className="jugnu-panel content-panel screen-stack"><Siren size={35} className="text-primary" /><p>{demo ? "Start the alarm and call your saved demo contact." : "Start an incident and open your emergency options."}</p></div>
      <button className="jugnu-button danger fill-button" onClick={() => safety.alert("manual")}>Start SOS</button>
      {!demo && <a className="jugnu-button secondary fill-button" href="tel:112"><Phone size={20} />Call 112 (India)</a>}

    </>}
    {incident?.state === "pending" && <>
      <Waveform />
      <div className="countdown"><strong>{String(safety.seconds).padStart(2, "0")}</strong><span>seconds to SOS</span></div>
      <div className="jugnu-panel content-panel detail-list">
        <div><Bell className="text-primary" />{safety.alarm ? "Alarm sounding" : "Alarm silent"}</div>
        <div><Video className="text-primary" />{safety.camera}</div>
        {demo && <div role="status"><Phone className="text-primary" />Saved contact call · {callText}</div>}
        {demo && <div><Shield className="text-primary" />{incident.summary || "Checking the scene during the countdown"}</div>}
      </div>
      <button className="jugnu-button danger fill-button" onClick={safety.escalate}>Get help now</button>
    </>}
    {incident?.state === "active" && <>
      <section className="jugnu-panel content-panel detail-list">
        <div><Phone size={21} className="text-primary" /><strong className="flex-1">{demo ? "Saved contact call" : "Helpline call"}</strong><span className="jugnu-status" role="status">{demo ? callText : "Ready to dial"}</span></div>
        <div><Bell size={21} className="text-primary" /><strong className="flex-1">Buzzer</strong><span className="jugnu-status">{safety.alarm ? "Sounding" : "Silent"}</span></div>
        <div><MapPin size={21} className="text-primary" /><strong className="flex-1">Location</strong><span className="jugnu-status">{incident.location ? "Ready to share" : "Unavailable"}</span></div>
        <div><UsersRound size={21} className="text-primary" /><strong className="flex-1">Trusted contacts</strong><span className="jugnu-status">{deliveries.some(item => item.status === "submitted") ? "SMS submitted" : "Ready to share"}</span></div>
        <div><Video size={21} className="text-primary" /><strong className="flex-1">Evidence</strong><span className="jugnu-status">{safety.camera}</span></div>
      </section>
      {demo && <section className="jugnu-panel content-panel screen-stack">
        <h2 className="section-title">Police called · simulation</h2>
        <p className="small-text">112 · India emergency services</p>
        <p>{policeDraft(incident)}</p>
      </section>}
      <div className="button-row">{!demo && <a className="jugnu-button danger" href="tel:112"><Phone size={19} />Call 112 (India)</a>}
        {incident.location ? <button className="jugnu-button secondary" onClick={share}>Share location</button> : <button className="jugnu-button secondary" disabled={locating} onClick={async () => {
          setStatus("");
          setLocating(true);
          if (!(await safety.attachLocation())) setStatus("Location could not be attached.");
          setLocating(false);
        }}>{locating ? "Getting location…" : "Attach location"}</button>}
        <Link className="jugnu-button secondary" href="/emergency-contacts">Trusted contacts</Link></div>
      <Link href="/incidents" className="jugnu-button secondary fill-button">View incident</Link>
      {user && !demo && <button className="jugnu-button secondary fill-button" onClick={() => setSmsOpen(!smsOpen)} aria-expanded={smsOpen}>Notify trusted contacts by SMS</button>}
      {user && !demo && smsOpen && <form className="jugnu-panel content-panel screen-stack" onSubmit={async event => {
        event.preventDefault(); setSending(true); setStatus("");
        try {
          const { results } = await jugnuRequest<{ results: typeof deliveries }>("incidents/notify", "POST",
            { id: incident.id, confirmed: true, share_location: includeLocation });
          setDeliveries(results);
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not send SMS."); }
        finally { setSending(false); }
      }}>
        <label className="consent-row"><input type="checkbox" required />My emergency contacts agreed to receive SMS alerts.</label>
        {incident.location && <label className="consent-row"><input type="checkbox" checked={includeLocation} onChange={event => setIncludeLocation(event.target.checked)} />Include my last known location</label>}
        <button className="jugnu-button" disabled={sending || deliveries.length > 0}>{sending ? "Contacting SMS provider…" : "Send SOS text"}</button>
        {deliveries.map((item, index) => <p key={index} className="small-text">{item.contact} · {item.status === "submitted" ? "Accepted by SMS provider" : item.status === "rejected" ? "Rejected by SMS provider" : "Submission unconfirmed"}</p>)}
      </form>}
    </>}

    {incident?.state === "resolved" && incident.review === "benign" && <p className="small-text">{incident.summary}</p>}
    {incident?.state === "resolved" && demo && callStatus && <p role="status" className="small-text">Saved contact call · {callText}</p>}
    {incident?.state === "resolved" && <div className="button-row"><Link href={safety.session ? "/journey" : "/"} className="jugnu-button"><Shield size={19} />{safety.session ? "Return to journey" : "Back to home"}</Link><button className="jugnu-button danger" onClick={() => safety.alert("manual")}>Start SOS</button></div>}
    {["pending", "active"].includes(incident?.state || "") && (
      entering || incident?.state === "active" ? <form className="jugnu-panel content-panel screen-stack" onSubmit={event => clear(event, false)}>
        <h2 className="section-title">{safety.hasPin ? "Enter passcode" : "End the alert"}</h2>
        {safety.hasPin && <>
          <input aria-label="SOS passcode" className="keypad-code" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
          <div className="keypad">{["1","2","3","4","5","6","7","8","9","","0","delete"].map(value => value ? <button key={value} aria-label={value === "delete" ? "Delete digit" : value} type="button" onClick={() => setCode(value === "delete" ? code.slice(0, -1) : (code + value).slice(0, 4))}>{value === "delete" ? <Delete className="mx-auto" size={20} /> : value}</button> : <span key="spacer" />)}</div>
        </>}
        <div className="button-row">{safety.alarm && <button type="button" disabled={verifying} className="jugnu-button secondary" onClick={event => clear(event, true)}>Silence alarm</button>}<button className="jugnu-button" type="submit" disabled={verifying}>I’m safe</button></div>
      </form> : <button className="jugnu-button secondary fill-button" onClick={() => setEntering(true)}>{safety.hasPin ? "Enter passcode" : "Cancel alert"}</button>
    )}
    {safety.alarm && <p className="small-text">Keep Jugnu open. Enter the SOS passcode to silence the alarm.</p>}
    {safety.syncStatus && <p className="small-text" role="status">{safety.syncStatus}</p>}
    {status && <p className="small-text" role="status">{status}</p>}
  </div>;
}
