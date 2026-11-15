import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Location } from "@/types/index";
import { useMaps } from "@/contexts/MapsContext";

interface LocationSearchProps {
  onLocationSelect: (location: Omit<Location, "timestamp">) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
  showFindRouteButton?: boolean;
  showCurrentLocationButton?: boolean;
}

const LocationSearch = ({
  onLocationSelect,
  loading = false,
  disabled = false,
  placeholder,
  initialValue,
  showFindRouteButton = false,
  showCurrentLocationButton = false,
}: LocationSearchProps) => {
  const { isLoaded, geocoder } = useMaps();
  const [searchQuery, setSearchQuery] = useState(initialValue || "");
  const [predictions, setPredictions] = useState<
    google.maps.places.PlacePrediction[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    setPredictions([]);
    if (!isLoaded || !showSuggestions || searchQuery.trim().length < 3) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
        session.current ??= new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: searchQuery.trim(),
          sessionToken: session.current,
        });
        if (!cancelled) {
          setPredictions(suggestions.flatMap(({ placePrediction }) =>
            placePrediction ? [placePrediction] : [],
          ));
        }
      } catch {
        if (!cancelled) setSearchError("Address suggestions are unavailable. Try submitting the full address.");
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoaded, searchQuery, showSuggestions]);

  const handleSearch = async (prediction?: google.maps.places.PlacePrediction) => {
    if (!isLoaded || !searchQuery.trim()) return;
    setShowSuggestions(false);
    setSearchError("");
    try {
      let position: google.maps.LatLng | null | undefined;
      let address: string | null | undefined;
      if (prediction) {
        const place = prediction.toPlace();
        session.current = null;
        await place.fetchFields({ fields: ["formattedAddress", "location"] });
        position = place.location;
        address = place.formattedAddress;
      } else if (geocoder) {
        const { results } = await geocoder.geocode({ address: searchQuery });
        position = results[0]?.geometry.location;
        address = results[0]?.formatted_address;
      }
      if (!position) throw new Error("Address not found");
      setSearchQuery(address || searchQuery);
      onLocationSelect({ lat: position.lat(), lng: position.lng(), address: address || searchQuery });
    } catch {
      setSearchError("Could not find that address.");
    }
  };

  const getCurrentLocation = () => {
    if (!geocoder) return;
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await new Promise<google.maps.GeocoderResult>(
            (resolve, reject) => {
              geocoder?.geocode(
                {
                  location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  },
                },
                (results, status) => {
                  if (
                    status === google.maps.GeocoderStatus.OK &&
                    results?.[0]
                  ) {
                    resolve(results[0]);
                  } else {
                    reject(new Error("Location not found"));
                  }
                },
              );
            },
          );

          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            address: result.formatted_address,
          };

          onLocationSelect(location);
          setSearchQuery(result.formatted_address);
        } catch (error) {
          console.error("Error getting current location:", error);
        } finally {
          setGettingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setGettingLocation(false);
      },
    );
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder={placeholder}
            aria-label={placeholder}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchError("");
              setShowSuggestions(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSearch();
            }}
            disabled={disabled || loading}
          />
        </div>
        {showCurrentLocationButton && (
          <Button
            variant="outline"
            size="icon"
            onClick={getCurrentLocation}
            disabled={disabled || loading || gettingLocation}
            title="Use current location"
          >
            <Navigation
              className={`h-4 w-4 ${gettingLocation ? "animate-pulse" : ""}`}
            />
          </Button>
        )}
        {showFindRouteButton && (
          <Button
            onClick={() => handleSearch()}
            disabled={disabled || loading || !searchQuery}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Find Route"
            )}
          </Button>
        )}
      </div>

      {searchError && <p role="status" className="text-sm text-muted-foreground">{searchError}</p>}

      {/* Location suggestions dropdown */}
      {showSuggestions && predictions.length > 0 && (
        <Card className="absolute z-50 w-full mt-1 max-h-60 overflow-auto">
          <div className="p-2">
            {predictions.map((prediction) => (
              <button
                type="button"
                key={prediction.placeId}
                className="block w-full rounded p-2 text-left hover:bg-accent"
                onClick={() => handleSearch(prediction)}
              >
                <div className="font-medium">
                  {prediction.mainText?.toString() || prediction.text.toString()}
                </div>
                <div className="text-sm text-gray-500">
                  {prediction.secondaryText?.toString()}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default LocationSearch;
