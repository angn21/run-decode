export type WeatherData = {
  temperature: number;
  humidity: number;
  description: string;
};

export async function fetchWeatherAt(
  lat: number,
  lng: number,
  isoDate: string,
): Promise<WeatherData | null> {
  const date = isoDate.slice(0, 10);
  const hour = new Date(isoDate).getUTCHours();

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m");
  url.searchParams.set("timezone", "UTC");

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 86400 } });
    if (!res.ok) return null;

    const data = await res.json();
    const temp: number[] = data.hourly?.temperature_2m ?? [];
    const humidity: number[] = data.hourly?.relative_humidity_2m ?? [];

    const temperature = temp[hour] ?? temp[0];
    const hum = humidity[hour] ?? humidity[0];

    if (temperature === undefined) return null;

    return {
      temperature,
      humidity: hum ?? 50,
      description: describeWeather(temperature, hum ?? 50),
    };
  } catch {
    return null;
  }
}

function describeWeather(temp: number, humidity: number): string {
  if (temp >= 28) return "Hot and taxing";
  if (temp >= 22) return "Warm";
  if (temp >= 12) return "Comfortable";
  if (temp >= 5) return "Cool";
  return "Cold";
}

/** Rough expected pace slowdown % from heat/humidity (heuristic for beginners). */
export function weatherPaceAdjustment(tempC: number, humidity: number): number {
  let adj = 0;
  if (tempC > 15) adj += (tempC - 15) * 0.8;
  if (humidity > 60) adj += ((humidity - 60) / 10) * 0.5;
  return Math.min(adj, 15);
}
