"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, Lock, Mic, Phone, UsersRound } from "lucide-react";
import { ActionRow, PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";
import { useSafety } from "@/components/safety/SafetyProvider";

export default function SettingsPage() {
  const { user } = useAccount();
  const safety = useSafety();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const locked = Boolean(safety.session) || ["pending", "active"].includes(safety.incident?.state || "");

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Safety settings" back="/profile" />
    <ActionRow href="/emergency-contacts" icon={UsersRound} title="Trusted contacts" />
    <ActionRow href="/sos" icon={Phone} title="Helplines and SOS" />
    <section className="jugnu-panel content-panel">
      <h2 className="section-title">Safety preferences</h2>
      <div className="detail-list"><div><Mic size={20} />Sound detection runs while a safety session is open.</div><div><Camera size={20} />Choose whether to record evidence when you start a session.</div></div>
      <Link className="jugnu-button secondary fill-button" href="/journey">Set up a safety session</Link>
    </section>
    {user ? <form className="jugnu-panel content-panel screen-stack" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      setBusy(true); setStatus("");
      try {
        await jugnuRequest("account/pin", "PATCH", { password: fields.get("password"), pin: fields.get("pin") });
        setStatus("SOS passcode updated."); form.reset();
      } catch (error) { setStatus(error instanceof Error ? error.message : "Could not update passcode."); }
      finally { setBusy(false); }
    }}>
      <h2 className="section-title flex items-center gap-2"><Lock size={21} className="text-primary" />Change your SOS passcode</h2>
      <label>Current account password<input className="jugnu-input mt-1" type="password" name="password" required autoComplete="current-password" maxLength={128} /></label>
      <label>New four-digit passcode<input className="jugnu-input mt-1" type="password" name="pin" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" /></label>
      <button className="jugnu-button" disabled={busy || locked}>Save passcode</button>
      {locked && <p className="small-text">End your safety session to change the passcode.</p>}
      {status && <p role="status" className="small-text">{status}</p>}
    </form> : <Link href="/login" className="jugnu-button">Sign in to manage your passcode</Link>}
  </div>;
}
