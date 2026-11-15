import { NextResponse } from "next/server";
import type { WeatherData } from "@/types/index";

function weatherCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return ["", "Mainly clear", "Partly cloudy", "Overcast"][code];
  if (code === 45 || code === 48) return "Fog";
  if (code < 60) return "Drizzle";
  if (code < 70 || (code >= 80 && code <= 82)) return "Rain";
  if (code < 90) return "Snow";
  return "Thunderstorms";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat?.trim() || !lng?.trim() || !(Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180)) {
    return NextResponse.json(
      { error: "Missing latitude or longitude" },
      { status: 400 },
    );
  }

  const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

  if (!WEATHER_API_KEY) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: Number(lat).toFixed(2),
        longitude: Number(lng).toFixed(2),
        current: "temperature_2m,weather_code,wind_speed_10m,precipitation",
      }).toString();
      const response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Weather provider unavailable");
      const { current } = await response.json();
      return NextResponse.json({
        alerts: [],
        current: {
          temp_c: current.temperature_2m,
          condition: weatherCondition(current.weather_code),
          wind_kph: current.wind_speed_10m,
          precip_mm: current.precipitation,
        },
        source: "Open-Meteo",
        timestamp: `${current.time}Z`,
      } satisfies WeatherData);
    } catch {
      return NextResponse.json({ error: "Live weather is unavailable." }, { status: 503 });
    }
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`,
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) },
    );

    if (!response.ok) {
      throw new Error("Weather provider unavailable");
    }

    const data = await response.json();
    return NextResponse.json({
      alerts: (data.alerts || []).map((alert: { event: string; description: string }) => ({
        headline: alert.event,
        description: alert.description,
        severity: "",
        urgency: "",
      })),
      current: {
        temp_c: data.current.temp,
        condition: data.current.weather[0].description,
        wind_kph: Number((data.current.wind_speed * 3.6).toFixed(1)),
        precip_mm: data.current.rain ? data.current.rain["1h"] || 0 : 0,
      },
      source: "OpenWeather",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 503 },
    );
  }
}
