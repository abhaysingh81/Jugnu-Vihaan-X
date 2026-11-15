"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, Mic, Navigation, Play, Share2, Square, Volume2, VolumeX } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { WalkingRouteMap } from "@/components/SafeRouteMap";
import { useSafety } from "@/components/safety/SafetyProvider";
import { useAccount } from "@/contexts/AccountContext";
import { locationLink } from "@/lib/safety-storage";
import { campus, type RouteOption } from "@/lib/demo-routes";

export default function Journey() {
  return <Suspense fallback={<PageHeading title="Safety session" />}><JourneyScreen /></Suspense>;
}

function JourneyScreen() {
  const search = useSearchParams();
  const safety = useSafety();
  const { user, loading } = useAccount();
  const destination = (search.get("destination") || "Your journey").slice(0, 100);
  const [audible, setAudible] = useState(true);
  const [camera, setCamera] = useState(false);
  const [location, setLocation] = useState(false);
  const [status, setStatus] = useState("");
  const [foreground, setForeground] = useState(true);
  const [route, setRoute] = useState<RouteOption>();
  const plannedRoute = search.get("planned") === "1";
  const defaultLocation = safety.session?.route?.path[0] || safety.location || campus.center;

  useEffect(() => {
    if (user?.demo) { setCamera(true); setLocation(true); }
  }, [user?.demo]);

  useEffect(() => {
    setRoute(undefined);
    if (!plannedRoute) return;
    try {
      const planned = JSON.parse(sessionStorage.getItem("jugnu.planned-route") || "null");
      if (planned?.destination === destination && planned.route?.path?.length) setRoute(planned.route);
    } catch {}
  }, [destination, plannedRoute]);

  useEffect(() => {
    const update = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  async function share() {
    if (!safety.location) return;
    const url = locationLink(safety.location);
    try {
      if (navigator.share) await navigator.share({ title: "My location", url });
      else { await navigator.clipboard.writeText(url); setStatus("Location link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("Could not share the location link.");
    }
  }

  if (!user) return <div className="narrow-screen screen-stack"><PageHeading title="Arm a safety session" back="/" />{loading ? <p>Loading account…</p> : <Link className="jugnu-button" href="/login">Sign in to start monitoring</Link>}</div>;

  if (safety.session) return <div className="journey-active screen-stack">
    <PageHeading title="Journey in progress" back="/safe-route"><span className="jugnu-status good">Active</span></PageHeading>
    <div className="journey-map">
      <WalkingRouteMap center={defaultLocation} options={safety.session.route ? [safety.session.route] : []} position={safety.location} />
    </div>
    <section className="jugnu-panel content-panel screen-stack">
      <strong>{safety.session.destination}</strong>
      {safety.session.route && <p className="small-text">Planned walk · {safety.session.route.duration} · {safety.session.route.distance}</p>}
      <div className="flex items-center gap-3"><Mic className="text-primary" /><strong role="status">{safety.listening}</strong></div>
      <p className="small-text">{foreground ? "Keep Jugnu open with the screen awake." : "Monitoring may pause while Jugnu is in the background."}</p>
      <p className="small-text">{safety.location ? "Location ready to share." : "No location fix shared."}</p>
      {safety.session.camera && <p className="small-text"><Camera size={15} className="inline mr-1" />{safety.camera}</p>}
    </section>
    {status && <p role="status" className="small-text">{status}</p>}
    <div className="journey-controls">
      <div className="button-row"><button className="jugnu-button secondary" disabled={!safety.location} onClick={share}><Share2 size={19} />Share location</button><Link className="jugnu-button danger" href="/sos">SOS</Link></div>
      <button className="jugnu-button secondary fill-button" onClick={safety.endSession} disabled={safety.incident?.state === "pending" || safety.incident?.state === "active"}><Square size={18} />End session</button>
    </div>
  </div>;

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Arm a safety session" back="/safe-route" />
    <div className="jugnu-panel content-panel flex gap-3 items-center"><Navigation className="text-primary" /><span><small className="small-text block">{route ? `${route.duration} walk · ${route.distance}` : "Destination"}</small><strong>{destination}</strong></span></div>
    <section className="jugnu-panel content-panel">
      <div className="consent-row"><Mic size={21} /><div><strong>Distress sound detection</strong><p className="small-text">Keep Jugnu open while your device listens for possible screams.</p></div></div>
      <label className="consent-row"><input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} /><Camera size={21} /><span><strong>Record camera evidence</strong><small className="small-text block">{user.demo ? "Save a short clip on alert and share up to two frames for AI assessment." : "Save a short clip on this device when an alert starts."}</small></span></label>
      <label className="consent-row"><input type="checkbox" checked={location} onChange={e => setLocation(e.target.checked)} /><Navigation size={21} /><span><strong>Include current location</strong><small className="small-text block">Attach a location fix so you can share it if needed.</small></span></label>
    </section>
    <h2 className="section-title">Alert mode</h2>
    <div className="quick-links" aria-label="Alert mode">
      <button className={`jugnu-button ${audible ? "" : "secondary"}`} aria-pressed={audible} onClick={() => setAudible(true)}><Volume2 size={21} />Audible alarm</button>
      <button className={`jugnu-button ${audible ? "secondary" : ""}`} aria-pressed={!audible} onClick={() => setAudible(false)}><VolumeX size={21} />Silent alert</button>
    </div>
    {user.demo && <p className="small-text">Demo mode calls only the preset contact when Voice is configured. Police handoff is a preview.</p>}
    <button className="jugnu-button fill-button" onClick={() => safety.startSession({ destination, route, audible, camera, location })}><Play size={19} fill="currentColor" />Start session</button>
  </div>;
}
