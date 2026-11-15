"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Shield, UsersRound } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount, type AccountUser } from "@/contexts/AccountContext";

export default function LoginPage() {
  const router = useRouter();
  const account = useAccount();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [contact, setContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(form);
    const contactData = contact ? { name: fields.contactName, phone: fields.contactPhone, relationship: fields.relationship } : undefined;
    setError("");
    setBusy(true);
    try {
      const { user } = await jugnuRequest<{user: AccountUser}>(`account/${mode}`, "POST", {
        email: fields.email, password: fields.password, name: fields.name, phone: fields.phone, pin: fields.pin,
        contact: creating ? contactData : undefined,
      });
      account.setUser(user);
      router.replace(creating && !contact ? "/emergency-contacts" : "/profile");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not continue."); }
    finally { setBusy(false); }
  }

  return <div className="auth-layout">
    <div className="auth-art" aria-hidden="true"><Shield size={34} /><p>Your safety.<br />Your circle.</p></div>
    <section className="auth-form jugnu-panel">
      <PageHeading title={creating ? "Create your account" : "Welcome to Jugnu"} />
      {account.user ? <Link className="jugnu-button" href="/profile">Go to your profile <ArrowRight size={18} /></Link> : <>
        <div className="segmented mb-4" aria-label="Account action">
          <button type="button" aria-pressed={!creating} disabled={busy} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
          <button type="button" aria-pressed={creating} disabled={busy} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
        </div>
        <form key={mode} className="screen-stack" onSubmit={submit}>
          {creating && <label>Full name<input className="jugnu-input mt-1" name="name" autoComplete="name" maxLength={120} required /></label>}
          <label>Email<input className="jugnu-input mt-1" type="email" name="email" autoComplete="email" maxLength={120} required /></label>
          {creating && <label>Phone number<input className="jugnu-input mt-1" type="tel" name="phone" autoComplete="tel" placeholder="+91…" maxLength={28} required /></label>}
          <label>Password<input className="jugnu-input mt-1" type="password" name="password" autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 12 : 1} maxLength={128} required />{creating && <small className="small-text">Use at least 12 characters.</small>}</label>
          {creating && <>
            <label><span className="flex items-center gap-2"><KeyRound size={17} />SOS passcode</span><input className="jugnu-input mt-1" type="password" inputMode="numeric" name="pin" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required /><small className="small-text">Use four digits to silence the alarm or mark yourself safe.</small></label>
            <button type="button" className="jugnu-button secondary" onClick={() => setContact(!contact)} aria-expanded={contact}><UsersRound size={18} />{contact ? "Remove contact from signup" : "Add a trusted contact"}</button>
            {contact && <div className="screen-stack">
              <label>Contact name<input className="jugnu-input mt-1" name="contactName" maxLength={120} required /></label>
              <label>Contact phone number<input className="jugnu-input mt-1" name="contactPhone" type="tel" maxLength={28} placeholder="+91…" required /></label>
              <label>Relationship<input className="jugnu-input mt-1" name="relationship" maxLength={50} /></label>
            </div>}
          </>}
          <button className="jugnu-button" type="submit" disabled={busy || account.loading}>{busy ? "Working…" : creating ? "Create account" : "Sign in"}<ArrowRight size={20} /></button>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </form>
      </>}
    </section>
  </div>;
}
