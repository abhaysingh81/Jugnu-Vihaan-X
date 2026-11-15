"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { jugnuRequest, useAccount } from "@/contexts/AccountContext";

type Report = { id: number; issue: string; area: string; created: string };

const samplePosts = [
  {
    id: "streetlamp", author: "Aditi Rao", avatar: "aditi", category: "Broken streetlight",
    area: "Badli Main Road · near the dairy",
    body: "The streetlamp by the dairy was out when I walked back from DTU. That stretch gets dark fast. If you’re heading this way after dusk, take the better-lit route.",
    photo: { width: 739, height: 415, alt: "An unlit two-arm streetlamp against the night sky" },
  },
  {
    id: "dogs", author: "Kabir Sethi", avatar: "kabir", category: "Dogs on the road",
    area: "Bawana Road · near DTU Main Gate",
    body: "Saw several dogs in the road near the campus turn. If you’re walking back this evening, give them space and take another route if they’re blocking the path.",
    photo: { width: 806, height: 380, alt: "Several dogs standing in a road at night" },
  },
  {
    id: "side-lane", author: "Meera Joshi", avatar: "meera", category: "Poor lighting",
    area: "Shahbad Daulatpur · side lane near DTU",
    body: "I tried the side lane off Bawana Road after dark. Only a few doorways were lit, and the path was hard to see. I’d stick to the main road at night.",
    photo: { width: 1200, height: 669, alt: "A dark lane with a few lit doorways" },
  },
];

export default function CommunityPage() {
  const { user } = useAccount();
  const [reports, setReports] = useState<Report[]>([]);
  const [reporting, setReporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    jugnuRequest<{reports: Report[]}>("account/reports").then(result => { if (active) setReports(result.reports); })
      .catch(error => { if (active) setStatus(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <div className="narrow-screen screen-stack">
    <PageHeading title="Community" />
    <h2 className="section-title">Recent safety reports</h2>
    <p className="small-text">Reports come from Jugnu users. Share the area and issue without including personal details.</p>
    {loading && <p>Loading safety reports…</p>}
    {!loading && !reports.length && !status && <p>No safety reports have been posted yet.</p>}
    {reports.map(item => <section className="jugnu-panel action-row" key={item.id}>
      <MapPin size={20} className="text-primary shrink-0" /><span><strong>{item.issue}</strong><small>{item.area} · {new Date(item.created).toLocaleString()}</small></span>
    </section>)}
    <section className="community-demo-feed" aria-labelledby="dtu-demo-heading">
      <div>
        <h2 id="dtu-demo-heading" className="section-title">DTU demo posts</h2>
        <p className="small-text mt-1">Fictional profiles and sample reports for the demo.</p>
      </div>
      {samplePosts.map(post => (
        <article className="jugnu-panel community-post" key={post.id} aria-labelledby={`post-${post.id}`}>
          <header className="community-post-header">
            <Image src={`/jugnu/community/${post.avatar}.webp`} alt="" width={44} height={44} className="community-post-avatar" />
            <div>
              <p className="community-post-author">{post.author}</p>
              <p className="community-post-location small-text"><MapPin size={14} aria-hidden="true" />{post.area}</p>
            </div>
          </header>
          <div className="community-post-copy">
            <h3 id={`post-${post.id}`}>{post.category}</h3>
            <p>{post.body}</p>
          </div>
          <Image
            src={`/jugnu/community/${post.id}.webp`}
            alt={post.photo.alt}
            width={post.photo.width}
            height={post.photo.height}
            sizes="(max-width: 720px) calc(100vw - 38px), 660px"
            className="community-post-photo"
          />
        </article>
      ))}
    </section>
    {user ? <button className="jugnu-button" onClick={() => setReporting(!reporting)} aria-expanded={reporting}><Plus size={20} />{reporting ? "Close report form" : "Report an issue"}</button> : <Link href="/login" className="jugnu-button">Sign in to post a report</Link>}
    {reporting && user && <form className="jugnu-panel content-panel screen-stack" onSubmit={async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      setStatus(""); setBusy(true);
      try {
        const result = await jugnuRequest<{reports: Report[]}>("account/reports", "POST", fields);
        setReports(result.reports); setReporting(false); setStatus("Report posted.");
      } catch (error) { setStatus(error instanceof Error ? error.message : "Could not post the report."); }
      finally { setBusy(false); }
    }}>
      <label>Issue<input className="jugnu-input mt-1" name="issue" required maxLength={120} /></label>
      <label>Area<input className="jugnu-input mt-1" name="area" required maxLength={100} /></label>
      <button className="jugnu-button" type="submit" disabled={busy}>Post report</button>
    </form>}
    {status && <p role="status" className="small-text">{status}</p>}
  </div>;
}
