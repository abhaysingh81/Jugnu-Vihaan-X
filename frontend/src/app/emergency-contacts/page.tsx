"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";

type Contact = { id: number; name: string; phone: string; email: string | null; relationship: string | null };
const empty: Contact = { id: 0, name: "", phone: "", email: "", relationship: "" };

export default function ContactsPage() {
  const { user, loading } = useAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<Contact>();
  const [remove, setRemove] = useState<Contact>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const id = user?.id;
  useEffect(() => {
    let current = true;
    setContacts([]);
    if (id) jugnuRequest<{contacts: Contact[]}>("account/contacts").then(result => {
      if (current) setContacts(result.contacts);
    }).catch(error => { if (current) setStatus(error.message); });
    return () => { current = false; };
  }, [id]);

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Emergency contacts" back="/profile" />
    {loading ? <p role="status">Loading account…</p> : !user ? <Link className="jugnu-button" href="/login">Sign in to manage contacts</Link> : <>
      <p className="small-text">Save the people you want to reach when you need help.</p>
      {contacts.map(item => <div key={item.id} className="jugnu-panel action-row">
        <Phone size={20} className="text-primary" /><span><strong>{item.name}</strong><a href={`tel:${item.phone}`} className="small-text underline">{item.phone}</a>{item.relationship && <small>{item.relationship}</small>}</span>
        <button className="icon-button" aria-label={`Edit ${item.name}`} onClick={() => { setRemove(undefined); setForm(item); }}><Pencil size={19} /></button>
        <button className="icon-button" aria-label={`Delete ${item.name}`} onClick={() => { setForm(undefined); setRemove(item); }}><Trash2 size={19} /></button>
      </div>)}
      {!contacts.length && <p>No contacts saved yet.</p>}
      <button className="jugnu-button" onClick={() => { setRemove(undefined); setForm(empty); }}><Plus size={20} />Add contact</button>
      {form && <form className="jugnu-panel content-panel screen-stack" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setStatus("");
        try {
          const path = form.id ? `account/contacts/${form.id}` : "account/contacts";
          const {contact} = await jugnuRequest<{contact: Contact}>(path, form.id ? "PATCH" : "POST", form);
          setContacts(values => form.id ? values.map(value => value.id === form.id ? contact : value) : [...values, contact]);
          setForm(undefined);
        } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save this contact."); }
        finally { setBusy(false); }
      }}>
        <h2 className="section-title">{form.id ? "Edit contact" : "New contact"}</h2>
        <label>Name<input className="jugnu-input mt-1" value={form.name} required maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Phone number<input className="jugnu-input mt-1" type="tel" value={form.phone} placeholder="+91…" required maxLength={28} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Email (optional)<input className="jugnu-input mt-1" type="email" value={form.email || ""} maxLength={120} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Relationship<input className="jugnu-input mt-1" value={form.relationship || ""} maxLength={50} onChange={e => setForm({ ...form, relationship: e.target.value })} /></label>
        <div className="button-row"><button className="jugnu-button" disabled={busy}>Save contact</button><button className="jugnu-button secondary" type="button" onClick={() => setForm(undefined)}>Cancel</button></div>
      </form>}
      {remove && <section className="jugnu-panel content-panel screen-stack"><p>Delete {remove.name}?</p><div className="button-row"><button className="jugnu-button danger" disabled={busy} onClick={async () => {
        setBusy(true); setStatus("");
        try { await jugnuRequest(`account/contacts/${remove.id}`, "DELETE"); setContacts(values => values.filter(value => value.id !== remove.id)); setRemove(undefined); }
        catch (error) { setStatus(error instanceof Error ? error.message : "Could not delete this contact."); }
        finally { setBusy(false); }
      }}>Delete contact</button><button className="jugnu-button secondary" onClick={() => setRemove(undefined)}>Cancel</button></div></section>}
    </>}
    {status && <p role="status" className="small-text">{status}</p>}
  </div>;
}
