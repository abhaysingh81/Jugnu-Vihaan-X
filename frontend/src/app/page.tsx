"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CloudMoon, History, MapPin, Mic, Pause, Play, UsersRound } from "lucide-react";
import { ActionRow } from "@/components/JugnuUI";
import { useAccount } from "@/contexts/AccountContext";
import type { WeatherData } from "@/types";

export default function HomePage() {
  const { user } = useAccount();
  const [weather, setWeather] = useState<WeatherData["current"]>();
  const [motion, setMotion] = useState(true);
  useEffect(() => {
    const request = new AbortController();
    fetch("/api/weather?lat=28.63&lng=77.22", { signal: request.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => setWeather(data?.current))
      .catch(() => {});
    return () => request.abort();
  }, []);

  return <div className="home-layout live-home">
    <section className={`wave-hero ${motion ? "" : "motion-paused"}`} aria-labelledby="hero-heading">
      <div className="wave-art">
        <Image src="/jugnu/safety-wave.webp" alt="" fill priority sizes="(max-width: 760px) 100vw, 84vw" />
        <div className="wave-lights" />
      </div>
      <div className="wave-copy">
        <h1 id="hero-heading">Your safety<br /><em>companion</em></h1>
        <p>Plan your route, stay connected and get help when you need it.</p>
        <div className="wave-actions">
          <Link className="jugnu-button" href="/safe-route"><MapPin size={20} />Plan a route<ArrowRight size={19} /></Link>
          <Link className="jugnu-button secondary" href={user ? "/journey" : "/login"}>{user ? "Start a safety session" : "Sign in"}</Link>
        </div>
      </div>
      <button className="icon-button wave-toggle" aria-label={motion ? "Pause animation" : "Play animation"} onClick={() => setMotion(!motion)}>{motion ? <Pause size={17} /> : <Play size={17} />}</button>
    </section>
    <section className="home-tools live-tools" aria-label="Safety tools">
      <div className="jugnu-panel weather-row"><CloudMoon size={26} /><strong>{weather ? `${Math.round(weather.temp_c)}°C` : "Weather"}</strong><span><b>Delhi</b><small>{weather?.condition ?? "Conditions unavailable"}</small></span></div>
      <ActionRow href="/nearby" icon={UsersRound} title="Nearby help" />
      <ActionRow href="/voice-help" icon={Mic} title="Voice help" />
      <ActionRow href="/incidents" icon={History} title="Recent activity" />
    </section>
  </div>;
}
