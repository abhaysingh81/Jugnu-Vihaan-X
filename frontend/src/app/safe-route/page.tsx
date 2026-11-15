"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Compass, Crosshair, List, Map, MapPin, Mic, Play, Shield } from "lucide-react";
import LocationSearch from "@/components/LocationSearch";
import { getWalkingRoutes, WalkingRouteMap } from "@/components/SafeRouteMap";
import { PageHeading } from "@/components/JugnuUI";
import { useMaps } from "@/contexts/MapsContext";
import { campus, demoDestinations, routeScoreBand, scoreRoute, type RouteEndpoint, type RouteOption } from "@/lib/demo-routes";

type Advisory = { recommendations?: string[] };
type Preset = typeof demoDestinations[number];

export default function SafeRoutePage() {
  const { isLoaded, loadError } = useMaps();
  const [from, setFrom] = useState<RouteEndpoint>(campus.address);
  const [to, setTo] = useState<RouteEndpoint>(demoDestinations[0].address);
  const [preset, setPreset] = useState<Preset | undefined>(demoDestinations[0]);
  const [options, setOptions] = useState<RouteOption[]>([]);
  const [selected, setSelected] = useState<number>();
  const [tab, setTab] = useState("Directions");
  const [period, setPeriod] = useState("now");
  const [weather, setWeather] = useState<{ condition: string; precip_mm: number }>();
  const [advisory, setAdvisory] = useState<Advisory>();
  const [advisoryStatus, setAdvisoryStatus] = useState("");
  const [routeStatus, setRouteStatus] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const analysis = useRef<AbortController>();
  const center = typeof from === "string" ? campus.center : from;
  const centerLat = center.lat;
  const centerLng = center.lng;
  const live = isLoaded && !loadError;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const nightNow = hour < 6 || hour >= 18;
  const night = period === "night" || (period === "now" && nightNow);
  const wet = Boolean(weather && (weather.precip_mm > 0 || /rain|drizzle|thunder|fog/i.test(weather.condition)));
  const shortest = Math.min(...options.map(route => route.meters));
  const scores = options.map(route => scoreRoute(route, shortest, night, wet));
  const scoredOptions = options.map((option, index) => ({ ...option, score: scores[index].score }));
  const preferred = scores.reduce((best, value, index) => value.score > (scores[best]?.score ?? -1) ? index : best, 0);
  const active = selected ?? preferred;
  const route = scoredOptions[active];
  const destination = preset?.name || (typeof to === "string" ? to : to.address) || "Your journey";

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setOptions([]);
    setSelected(undefined);
    setRouteStatus("Finding walking routes…");
    getWalkingRoutes(from, to, preset?.via).then(result => {
      if (cancelled) return;
      setOptions(result);
      setRouteStatus(result.length ? "" : "Google Maps returned no walking route.");
    }).catch(() => { if (!cancelled) setRouteStatus("Walking routes are temporarily unavailable."); });
    return () => { cancelled = true; };
  }, [live, from, to, preset]);

  useEffect(() => {
    const controller = new AbortController();
    setWeather(undefined);
    fetch(`/api/weather?lat=${centerLat}&lng=${centerLng}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setWeather(data?.current); })
      .catch(() => {});
    return () => controller.abort();
  }, [centerLat, centerLng]);

  useEffect(() => {
    analysis.current?.abort();
    setAdvisory(undefined);
    setAdvisoryStatus("");
    return () => analysis.current?.abort();
  }, [options, active, night, wet]);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setLocationStatus("Location is unavailable."); return; }
    setLocationStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setFrom({ lat: coords.latitude, lng: coords.longitude, address: "Current location" });
      setLocationStatus("");
    }, () => setLocationStatus("Location unavailable. Search for your starting point."), { timeout: 10000 });
  }

  async function loadAdvisory() {
    if (!route) return;
    const controller = new AbortController();
    analysis.current?.abort();
    analysis.current = controller;
    setAdvisoryStatus("Checking route…");
    try {
      const response = await fetch("/api/jugnu/safety/analyze-route", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          start_location: "Walking origin", end_location: "Walking destination", distance: route.distance, duration: route.duration,
          time_of_day: night ? "night" : "day", weather: weather?.condition, steps: route.steps,
          route_comparison: {
            selected: active + 1, suggested: preferred + 1,
            scores: options.map((option, index) => ({ route: index + 1, distance: option.distance, duration: option.duration, ...scores[index] })),
          },
        }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!result.data?.analysis) throw new Error();
      setAdvisory(result.data.analysis);
      setAdvisoryStatus("");
    } catch {
      if (!controller.signal.aborted) setAdvisoryStatus("AI route advice is currently unavailable.");
    }
  }

  return <>
    <PageHeading title="Plan a route" back="/"><Link className="icon-button text-primary" href="/voice-help" aria-label="Voice help"><Mic /></Link></PageHeading>
    <div className="route-fields">
      <div className="route-field"><Crosshair size={22} />{live ? <><LocationSearch key={typeof from === "string" ? from : from.address} placeholder="Starting location" initialValue={typeof from === "string" ? campus.name : from.address} onLocationSelect={setFrom} /><button className="icon-button" type="button" onClick={useCurrentLocation} aria-label="Use current location"><Compass size={19} /></button></> : <span>{campus.name}</span>}</div>
      <div className="route-field"><MapPin size={22} />{live ? <LocationSearch key={preset?.address ?? "custom"} placeholder="Where are you going?" initialValue={destination} onLocationSelect={point => { setPreset(undefined); setTo(point); }} /> : <span>{destination}</span>}</div>
    </div>
    {locationStatus && <p role="status" className="small-text">{locationStatus}</p>}
    <div className="demo-destinations" aria-label="Preset demo destinations">
      <span className="small-text">DTU demo destinations</span>
      {demoDestinations.map(destination => <button key={destination.name} type="button"
        aria-pressed={preset === destination} onClick={() => { setFrom(campus.address); setTo(destination.address); setPreset(destination); }}>
        <MapPin size={15} />{destination.name}
      </button>)}
    </div>
    <div className="route-layout">
      <div className="route-live-map"><div className="absolute inset-0"><WalkingRouteMap center={center} options={scoredOptions} selected={active} /></div></div>
      <section className="jugnu-panel route-summary">
        <div className="route-metric"><div><h2>{route ? `${route.duration} walk` : "Walking route"}</h2>{route && <p>{route.distance}</p>}</div></div>
        {routeStatus && <p role="status" className="small-text">{routeStatus}</p>}
        {route && <>
          <div className="route-options" aria-label="Walking route options">
            {options.map((option, index) => {
              const { score } = scores[index];
              return <button type="button" key={option.label} aria-pressed={active === index} onClick={() => setSelected(index)}>
                <span><strong>{option.label}</strong><small>{option.duration} · {option.distance}{index === preferred ? " · Suggested" : ""}</small></span>
                <span aria-label={`Advisory score ${score} out of 100`} className={`route-score ${routeScoreBand(score)}`}>{score}<small>/100</small></span>
              </button>;
            })}
          </div>
          <label className="route-period small-text">Conditions
            <select className="jugnu-input" value={period} onChange={event => { setPeriod(event.target.value); setSelected(undefined); }}>
              <option value="now">Now ({nightNow ? "night" : "daytime"} in Delhi)</option>
              <option value="day">Daytime</option><option value="night">Nighttime</option>
            </select>
          </label>
        </>}
        <div className="segmented" aria-label="Route view">
          {[{ name: "Map", icon: Map }, { name: "Directions", icon: List }, { name: "Safety", icon: Shield }].map(({ name, icon: Icon }) => <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}><Icon size={17} />{name}</button>)}
        </div>
        <div className="detail-list route-instructions">
          {tab === "Directions" && (route ? route.steps.map((step, index) => <div key={index}><MapPin size={17} className="text-primary" /><span>{step.instructions}{step.distance && <small className="small-text block">{step.distance}</small>}</span></div>) : <p>Choose an origin and destination to see directions.</p>)}
          {tab === "Map" && <p>{route ? "The thicker line is your selected route. Routes above 70 are green, 50–70 are yellow, and below 50 are red." : "Choose a destination to show a walking route."}</p>}
          {tab === "Safety" && <>
            <p>Scores compare walking time, extra distance, mapped obstacles, time of day and available weather. Street lighting, crowds and current incidents are unverified.</p>
            <p>{weather ? `Current weather near start: ${weather.condition}` : "Live weather unavailable for scoring."}</p>
            {advisory?.recommendations?.map((value, index) => <p key={index}>{value}</p>)}
            {route && !advisory && <button type="button" className="jugnu-button secondary my-2" onClick={loadAdvisory} disabled={advisoryStatus === "Checking route…"}>Explain recommendation with AI</button>}
            {advisoryStatus && <p role="status">{advisoryStatus}</p>}
          </>}
        </div>
        <Link href={`/journey?destination=${encodeURIComponent(destination)}${route ? "&planned=1" : ""}`} className="jugnu-button fill-button" onClick={() => {
          if (route) {
            try { sessionStorage.setItem("jugnu.planned-route", JSON.stringify({ destination, route })); } catch {}
          }
        }}><Play size={19} fill="currentColor" />Start monitoring</Link>
      </section>
    </div>
  </>;
}
