"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History, LogOut, Settings, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActionRow, PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount, type AccountUser } from "@/contexts/AccountContext";
import { useSafety } from "@/components/safety/SafetyProvider";

export default function ProfilePage() {
  const { user, loading, setUser } = useAccount();
  const safety = useSafety();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) { setName(user.name); setPhone(user.phone); } }, [user]);
  return <div className="narrow-screen screen-stack">
    <PageHeading title="Your profile" />
    {loading ? <p role="status">Loading account…</p> : !user ? <Link className="jugnu-button" href="/login">Sign in or create an account</Link> : <>
      <form className="screen-stack" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setStatus("");
        try {
          const result = await jugnuRequest<{user: AccountUser}>("account/me", "PATCH", { name, phone });
          setUser(result.user); setStatus("Profile saved.");
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save your profile."); }
        finally { setBusy(false); }
      }}>
        <label>Name<input className="jugnu-input mt-1" autoComplete="name" required value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
        <label>Email<input className="jugnu-input mt-1" type="email" value={user.email} readOnly /></label>
        <label>Phone number<input className="jugnu-input mt-1" type="tel" autoComplete="tel" required value={phone} maxLength={28} onChange={e => setPhone(e.target.value)} /></label>
        <button className="jugnu-button" disabled={busy}>Save changes</button>
      </form>
      <ActionRow href="/emergency-contacts" icon={UsersRound} title="Emergency contacts" />
      <ActionRow href="/settings" icon={Settings} title="Safety settings" />
      <ActionRow href="/incidents" icon={History} title="Evidence and incidents" />
      <button className="jugnu-button secondary" disabled={busy || Boolean(safety.session) || ["pending","active"].includes(safety.incident?.state || "")} onClick={async () => {
        setBusy(true);
        try { await jugnuRequest("account/logout", "POST", {}); setUser(null); router.push("/login"); }
        catch { setStatus("Could not sign out. Try again."); }
        finally { setBusy(false); }
      }}><LogOut size={18} />Sign out</button>
    </>}
    {status && <p role="status" className="small-text">{status}</p>}
  </div>;
}
