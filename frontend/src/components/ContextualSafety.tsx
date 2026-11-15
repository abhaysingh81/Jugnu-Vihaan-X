// frontend/components/ContextualSafety.tsx

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface SafetyContext {
  safety_score: number;
  risk_level: string;
  primary_concerns: string[];
  recommendations: string[];
  safe_spots: string[];
  safe_spaces: string[];
}

interface ContextualSafetyProps {
  location: Location;
}

export function ContextualSafety({ location }: ContextualSafetyProps) {
  const [context, setContext] = useState<SafetyContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchContextData = async () => {

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/safety/analyze-area`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({
            location: {
              lat: location.lat,
              lng: location.lng,
              address: location.address || "",
            },
          }),
        });

        if (!response.ok) throw new Error("Area analysis is unavailable.");
        const { data } = await response.json();
        if (!data || typeof data.area_safety_score !== "number") {
          throw new Error("Area analysis is unavailable.");
        }
        setContext({
          safety_score: data.area_safety_score,
          risk_level: data.risk_level || "unknown",
          primary_concerns: data.immediate_risks || [],
          recommendations: data.recommended_actions || [],
          safe_spots: [],
          safe_spaces: data.safe_spaces || [],
        });
      } catch {
        setContext(null);
        setError("Area analysis is unavailable.");
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchContextData, 500);
    return () => clearTimeout(timeoutId);
  }, [location]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 animate-pulse" />
            <p>Analyzing area safety...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <button
            onClick={() => window.location.reload()}
            className="ml-2 underline"
          >
            Retry
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!context) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <h3 className="font-semibold">
                Area Safety Score: {context.safety_score}
              </h3>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm ${
                context.risk_level === "low"
                  ? "bg-green-100 text-green-800"
                  : context.risk_level === "medium"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
              }`}
            >
              {context.risk_level.charAt(0).toUpperCase() +
                context.risk_level.slice(1)}{" "}
              Risk
            </div>
          </div>

          {context.primary_concerns.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Potential Risks:</h4>
              <ul className="list-disc pl-5 space-y-1">
                {context.primary_concerns.map((risk, index) => (
                  <li key={index} className="text-sm">
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {context.recommendations.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Safety Recommendations:</h4>
              <ul className="list-disc pl-5 space-y-1">
                {context.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
