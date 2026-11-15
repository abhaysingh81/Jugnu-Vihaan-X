import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import type { GeoLocation } from "@/types/index";
import { aiService } from "@/lib/ai.service";
import type { EmergencyResources } from "@/lib/ai.service";
import { Shield, Phone, MapPin, Info } from "lucide-react";

interface SafePlacesSearchProps {
  currentLocation: GeoLocation;
}

interface EmergencyResource {
  id: string;
  name: string;
  address: string;
  distance: string;
  type: string;
  safetyScore?: number;
  phone?: string;
  emergency?: boolean;
  hours?: string;
}

export function SafePlacesSearch({
  currentLocation,
}: SafePlacesSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [resources, setResources] = useState<EmergencyResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResources([]);
    aiService.getNearbyEmergencyResources(currentLocation, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result._error) setError("Live nearby places are unavailable.");
        else setResources(processEmergencyResources(result));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Live nearby places are unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currentLocation]);

  const searchTerms = searchQuery.toLowerCase().trim().split(/\s+/);
  const filteredResources = resources.filter((resource) =>
    searchTerms.every((term) =>
      `${resource.name} ${resource.address} ${resource.type}`.toLowerCase().includes(term),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 my-6">
        <Input
          type="text"
          placeholder="Search safe places..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {loading ? (
        <p role="status">Finding nearby places…</p>
      ) : error || !filteredResources.length ? (
        <p role="status" className="text-sm text-muted-foreground">{error || "No matching locations found."}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map(resource => (
              <div
                key={resource.id}
                className="p-4 rounded-lg border border-slate-200 bg-white hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-lg text-slate-900">{resource.name}</h3>
                    <p className="text-sm text-slate-500">{resource.address}</p>
                  </div>
                  {getResourceIcon(resource.type)}
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-slate-600">Distance: {resource.distance}</p>
                  {resource.safetyScore && (
                    <p className="text-sm text-slate-600">Safety Score: {resource.safetyScore}%</p>
                  )}
                  {resource.phone && (
                    <p className="text-sm text-slate-600">Phone: {resource.phone}</p>
                  )}
                  {resource.hours && (
                    <p className="text-sm text-slate-600">Hours: {resource.hours}</p>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function getResourceIcon(type: string) {
  const iconClasses = "w-6 h-6";
  switch (type) {
    case 'police':
      return <Shield className={`${iconClasses} text-blue-600`} />;
    case 'hospital':
      return <Phone className={`${iconClasses} text-red-600`} />;
    case 'safe_place':
      return <MapPin className={`${iconClasses} text-green-600`} />;
    default:
      return <Info className={`${iconClasses} text-slate-600`} />;
  }
}

function processEmergencyResources(resources: EmergencyResources): EmergencyResource[] {
  return [
    ...(resources.police?.map(p => ({
      id: `police-${p.name}`,
      name: p.name,
      address: p.address,
      distance: p.distance,
      type: 'police',
      phone: p.phone
    })) ?? []),
    ...(resources.hospitals?.map(h => ({
      id: `hospital-${h.name}`,
      name: h.name,
      address: h.address,
      distance: h.distance,
      type: 'hospital',
      emergency: h.emergency,
      phone: h.phone
    })) ?? []),
    ...(resources.safe_places?.map(s => ({
      id: `safe_place-${s.name}`,
      name: s.name,
      address: s.address,
      distance: s.distance,
      type: 'safe_place',
      hours: s.hours
    })) ?? [])
  ];
}
