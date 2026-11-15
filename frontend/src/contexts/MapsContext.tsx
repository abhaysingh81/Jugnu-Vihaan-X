"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useLoadScript } from "@react-google-maps/api";

const libraries: ("places" | "geometry" | "drawing")[] = ["places", "geometry"];

interface MapsContextType {
  isLoaded: boolean;
  loadError: Error | undefined;
  geocoder: google.maps.Geocoder | null;
}

const MapsContext = createContext<MapsContextType | undefined>(undefined);

export function MapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <MapsContext.Provider
        value={{
          isLoaded: false,
          loadError: undefined,
          geocoder: null,
        }}
      >
        {children}
      </MapsContext.Provider>
    );
  }

  return <GoogleMapsProvider apiKey={apiKey}>{children}</GoogleMapsProvider>;
}

function GoogleMapsProvider({
  apiKey,
  children,
}: {
  apiKey: string;
  children: React.ReactNode;
}) {
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  });

  useEffect(() => {
    if (isLoaded) setGeocoder(new google.maps.Geocoder());
  }, [isLoaded]);

  return (
    <MapsContext.Provider
      value={{
        isLoaded,
        loadError,
        geocoder,
      }}
    >
      {children}
    </MapsContext.Provider>
  );
}

export function useMaps() {
  const context = useContext(MapsContext);
  if (context === undefined) {
    throw new Error("useMaps must be used within a MapsProvider");
  }
  return context;
}
