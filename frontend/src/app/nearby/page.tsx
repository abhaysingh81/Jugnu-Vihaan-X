"use client";

import { useState } from "react";
import { Crosshair, Hospital, Navigation, Search, Shield } from "lucide-react";
import { PageHeading } from "@/components/JugnuUI";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useMaps } from "@/contexts/MapsContext";
import { jugnuRequest } from "@/contexts/AccountContext";

type Point = { lat: number; lng: number };
type Result = Point & { name: string; address: string; distance: string };
type Place = Result & { kind: "Police" | "Hospitals" };
const mapSize = { width: "100%", height: "100%" };

export default function NearbyPage() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [center, setCenter] = useState<Point>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const { geocoder, isLoaded } = useMaps();

  async function find(atLocation: boolean) {
    setBusy(true); setStatus(""); setPlaces([]); setCenter(undefined);
    try {
      let point: Point;
      if (atLocation) {
        if (!navigator.geolocation) throw new Error("Location unavailable in your browser.");
        const { coords } = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }));
        point = { lat: coords.latitude, lng: coords.longitude };
      } else {
        if (!geocoder || !search.trim()) throw new Error("Enter an area or use your current location.");
        const { results } = await geocoder.geocode({ address: search.trim() });
        const value = results[0]?.geometry.location;
        if (!value) throw new Error("Area not found.");
        point = { lat: value.lat(), lng: value.lng() };
      }
      const data = await jugnuRequest<{police: Result[]; hospitals: Result[]}>("safety/emergency-resources", "POST", { location: point });
      setPlaces([...data.police.map((item): Place => ({...item,kind:"Police"})), ...data.hospitals.map((item): Place => ({...item,kind:"Hospitals"}))]);
      setCenter(point);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Location permission is unavailable."); }
    finally { setBusy(false); }
  }

  const displayed = places.filter(place => filter === "All" || place.kind === filter);
  return <>
    <PageHeading title="Nearby help" back="/" />
    <form className="route-fields" onSubmit={event => { event.preventDefault(); void find(false); }}>
      <div className="route-field"><Search size={21} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search for a place or area" aria-label="Search nearby places" disabled={!geocoder} /><button disabled={!geocoder || busy || !search.trim()} className="icon-button disabled:opacity-40" aria-label="Search area" type="submit"><Search size={18} /></button></div>
      <button type="button" className="jugnu-button secondary" onClick={() => find(true)} disabled={busy}><Crosshair size={20} />Use my location</button>
    </form>
    <div className="segmented max-w-sm mb-3" aria-label="Filter nearby help">{["All","Police","Hospitals"].map(name => <button key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>
    <p role="status" className="small-text mb-3">{busy ? "Finding live results…" : status || (center ? (!displayed.length ? "No matching places nearby." : "") : "Use your location or search an area to find nearby services.")}</p>
    <div className={center && isLoaded ? "route-layout" : "screen-stack"}>
      {center && isLoaded && <div className="route-live-map"><div className="absolute inset-0"><GoogleMap center={center} zoom={13} mapContainerStyle={mapSize} options={{ streetViewControl: false, mapTypeControl: false }}><Marker position={center} title="Search location" />{displayed.map(place => <Marker key={place.name + place.address} position={place} title={place.name} />)}</GoogleMap></div></div>}
      <div className="screen-stack">
        {displayed.map(place => <section className="jugnu-panel content-panel screen-stack" key={place.name + place.address}>
          <div className="flex items-start gap-3">{place.kind === "Police" ? <Shield className="text-blue-400 shrink-0" /> : <Hospital className="text-red-400 shrink-0" />}<div><strong>{place.name}</strong><p className="small-text">{place.address} {place.distance}</p></div></div>
          <a className="jugnu-button" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name + ", " + place.address)}`} target="_blank" rel="noreferrer"><Navigation size={18} />Directions</a>
        </section>)}
        {(status || !center) && <a className="jugnu-button secondary w-fit" href="https://www.google.com/maps/search/police+station+or+hospital/" target="_blank" rel="noreferrer">Find help in Google Maps</a>}
      </div>
    </div>
  </>;
}
