// src/components/SafeRouteMap.tsx

"use client";

import React from "react";
import { GoogleMap, Marker, Polyline } from "@react-google-maps/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useMaps } from "@/contexts/MapsContext";
import { routeScoreBand, type RouteEndpoint, type RouteOption, type RoutePoint } from "@/lib/demo-routes";

interface Location {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distance: string;
  duration: string;
  steps: { instructions: string; distance: string; duration: string }[];
}

interface SafeRouteMapProps {
  initialLocation: Location;
  fromLocation: string;
  toLocation: string;
  onRouteCalculated: (route: RouteInfo) => void;
}

const routeFields = ["path", "localizedValues", "legs", "distanceMeters", "durationMillis"];
type Waypoint = { name: string; location: string };

export async function getWalkingRoutes(origin: RouteEndpoint, destination: RouteEndpoint, via: Waypoint[] = []) {
  const { Route } = await google.maps.importLibrary("routes") as google.maps.RoutesLibrary;
  const request = { origin, destination, travelMode: "WALKING" as const, fields: routeFields };
  const { routes } = await Route.computeRoutes({ ...request, computeAlternativeRoutes: true });
  const options: RouteOption[] = [];
  function add(route: google.maps.routes.Route, label: string) {
    if (!route.path?.length || !route.distanceMeters || !route.durationMillis) return;
    const path = route.path.map(point => ({ lat: point.lat, lng: point.lng }));
    const center = path[Math.floor(path.length / 2)];
    if (options.some(option =>
      Math.abs(option.meters - route.distanceMeters!) < 120 &&
      option.path.some(point => Math.hypot(point.lat - center.lat, point.lng - center.lng) < 0.0007)
    )) return;
    options.push({
      path, label, distance: route.localizedValues?.distance || "",
      duration: route.localizedValues?.duration || "",
      meters: route.distanceMeters, minutes: route.durationMillis / 60000,
      steps: route.legs?.flatMap(leg => leg.steps.map(step => ({
        instructions: step.instructions || "", distance: step.localizedValues?.distance || "",
        duration: step.localizedValues?.staticDuration || "",
      }))) || [],
    });
  }
  for (const route of routes ?? []) add(route, options.length ? `Alternate ${options.length}` : "Direct route");
  if (options.length < 3 && via.length) {
    const detours = await Promise.allSettled(via.map(async waypoint => ({
      label: `Via ${waypoint.name}`,
      routes: (await Route.computeRoutes({ ...request, intermediates: [{ location: waypoint.location }] })).routes,
    })));
    for (const result of detours) {
      if (options.length >= 3) break;
      if (result.status === "fulfilled" && result.value.routes?.[0]) add(result.value.routes[0], result.value.label);
    }
  }
  return options.slice(0, 3);
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194, // San Francisco coordinates
};

const mapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242624" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#dedacd" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#222421" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#4b504e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1b292d" }] },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

const routeMapOptions: google.maps.MapOptions = {
  styles: mapStyles, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
  zoomControl: true, clickableIcons: false, gestureHandling: "cooperative",
};

const routeStroke = { high: "#75db91", medium: "#ffcf36", low: "#ff6a68" };

export function WalkingRouteMap({ center, options, selected = 0, position }: {
  center: RoutePoint; options: RouteOption[]; selected?: number; position?: RoutePoint;
}) {
  const { isLoaded, loadError } = useMaps();
  const [map, setMap] = React.useState<google.maps.Map | null>(null);
  const route = options[selected];
  const path = route?.path;
  React.useEffect(() => {
    if (!map || !path?.length) return;
    const bounds = new google.maps.LatLngBounds();
    path.forEach(point => bounds.extend(point));
    map.fitBounds(bounds, 36);
  }, [map, path]);
  if (loadError) return <p className="p-5">Google Maps is unavailable.</p>;
  if (!isLoaded) return <p className="p-5" role="status">Loading map…</p>;
  return <GoogleMap mapContainerStyle={mapContainerStyle} zoom={14} center={path?.[0] || center}
    onLoad={setMap} options={routeMapOptions}>
    {options.map((option, index) => <Polyline key={option.label} path={option.path} options={{
      strokeColor: option.score === undefined ? "#ffcf36" : routeStroke[routeScoreBand(option.score)],
      strokeWeight: index === selected ? 6 : 4,
      strokeOpacity: index === selected ? 1 : 0.68, zIndex: index === selected ? 2 : 1,
    }} />)}
    <Marker position={position || path?.[0] || center} title={position ? "Current location" : "Starting point"} />
    {path && <Marker position={path[path.length - 1]} title="Destination" />}
  </GoogleMap>;
}

export function SafeRouteMap({
  initialLocation,
  fromLocation,
  toLocation,
  onRouteCalculated,
}: SafeRouteMapProps) {
  const { isLoaded, loadError } = useMaps();
  const [map, setMap] = React.useState<google.maps.Map | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const onRoute = React.useRef(onRouteCalculated);

  React.useEffect(() => {
    onRoute.current = onRouteCalculated;
  }, [onRouteCalculated]);

  React.useEffect(() => {
    if (!map || !fromLocation || !toLocation) return;

    const toCoordinates = (value: string) => {
      const [lat, lng] = value.split(",").map(Number);
      return { lat, lng };
    };
    const origin = toCoordinates(fromLocation);
    const destination = toCoordinates(toLocation);
    let cancelled = false;
    let lines: google.maps.Polyline[] = [];

    async function drawRoute() {
      setError(null);
      try {
        const { Route } = await google.maps.importLibrary("routes") as google.maps.RoutesLibrary;
        const { routes } = await Route.computeRoutes({
          origin,
          destination,
          travelMode: "WALKING",
          fields: ["path", "localizedValues", "legs"],
        });
        if (cancelled) return;
        const route = routes?.[0];
        if (!route?.path?.length) {
          setError("No walking route was found.");
          return;
        }
        lines = route.createPolylines();
        lines.forEach((line) => {
          line.setOptions({ strokeColor: "#ffcf36", strokeOpacity: 1, strokeWeight: 6 });
          line.setMap(map);
        });
        const bounds = new google.maps.LatLngBounds();
        route.path.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
        map?.fitBounds(bounds, 32);
        onRoute.current({
          distance: route.localizedValues?.distance || "",
          duration: route.localizedValues?.duration || "",
          steps: route.legs?.flatMap((leg) => leg.steps.map((step) => ({
            instructions: step.instructions || "",
            distance: step.localizedValues?.distance || "",
            duration: step.localizedValues?.staticDuration || "",
          }))) || [],
        });
      } catch {
        if (!cancelled) setError("Walking directions are unavailable. Check the Routes API configuration.");
      }
    }

    void drawRoute();
    return () => {
      cancelled = true;
      lines.forEach((line) => line.setMap(null));
    };
  }, [map, fromLocation, toLocation]);

  if (!isLoaded && !loadError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load Google Maps</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full h-full relative">
      {error && (
        <Alert variant="destructive" className="absolute top-0 z-10 w-full">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        zoom={14}
        center={initialLocation || defaultCenter}
        onLoad={setMap}
        options={{
          styles: mapStyles,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
          scrollwheel: true,
          disableDoubleClickZoom: true,
        }}
      >
        {!toLocation && <Marker position={initialLocation} />}
      </GoogleMap>
    </div>
  );
}
