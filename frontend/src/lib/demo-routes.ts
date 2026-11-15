export type RoutePoint = { lat: number; lng: number; address?: string };
export type RouteEndpoint = RoutePoint | string;

export const campus = {
  name: "DTU Main Gate",
  address: "Delhi Technological University Main Gate, Bawana Road, Delhi",
  center: { lat: 28.7497, lng: 77.1178 },
};

export const demoDestinations = [
  {
    name: "Samaypur Badli Metro",
    address: "Samaypur Badli Metro Station, Delhi",
    via: [
      { name: "Sector 17", location: "Rohini Sector 17 DDA Market, Delhi" },
      { name: "Badli Railway Station", location: "Badli Railway Station, Delhi" },
    ],
  },
  {
    name: "Rithala Metro",
    address: "Rithala Metro Station, Delhi",
    via: [
      { name: "Sector 16", location: "District Park Sector 16 Rohini, Delhi" },
      { name: "Rohini Sector 11", location: "Rohini Sector 11 DDA Market, Delhi" },
    ],
  },
  {
    name: "Japanese Park",
    address: "Swarn Jayanti Park, Sector 10, Rohini, Delhi",
    via: [
      { name: "Sector 16", location: "District Park Sector 16 Rohini, Delhi" },
      { name: "Sector 13 Market", location: "DDA Market Sector 13 Rohini, Delhi" },
    ],
  },
];

export type RouteOption = {
  label: string;
  distance: string;
  duration: string;
  meters: number;
  minutes: number;
  steps: { instructions: string; distance: string; duration: string }[];
  path: google.maps.LatLngLiteral[];
  score?: number;
};

export function routeScoreBand(score: number) {
  return score > 70 ? "high" : score < 50 ? "low" : "medium";
}

export function scoreRoute(route: RouteOption, shortest: number, night: boolean, wet: boolean) {
  const detour = Math.max(0, route.meters / Math.max(1, shortest) - 1);
  const steps = route.steps.filter(step => /\b(stairs|stairway|underpass|unpaved|footbridge)\b/i.test(step.instructions)).length;
  const distancePenalty = Math.min(34, Math.round(detour * 24));
  const timePenalty = Math.min(34, Math.round(route.minutes * (night ? 0.54 : 0.30)));
  const terrainPenalty = Math.min(18, steps * (night || wet ? 6 : 3));
  const weatherPenalty = wet ? Math.min(16, Math.round(route.minutes * 0.28)) : 0;
  const score = Math.max(0, 96 - distancePenalty - timePenalty - terrainPenalty - weatherPenalty);
  return { score, distancePenalty, timePenalty, terrainPenalty, weatherPenalty };
}
