import type { ForecastPayload } from '$lib/forecast/types';

const OPEN_METEO_HORIZON_DAYS = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

type WeatherKeyPoint = {
  latitude: number;
  longitude: number;
};

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
  reason?: string;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function clampToOpenMeteoHorizon(dates: string[], now = new Date()): string[] {
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = toIsoDate(new Date(todayMs));
  const maxDate = toIsoDate(new Date(todayMs + (OPEN_METEO_HORIZON_DAYS - 1) * DAY_MS));
  return dates.filter((d) => d >= today && d <= maxDate);
}

export async function fetchOpenMeteoForecasts(
  keyPoint: WeatherKeyPoint,
  dates: string[],
  now = new Date()
): Promise<ForecastPayload[]> {
  const withinHorizon = clampToOpenMeteoHorizon(dates, now);

  if (withinHorizon.length === 0) {
    return [];
  }

  const sortedDates = [...withinHorizon].sort();
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(keyPoint.latitude));
  url.searchParams.set('longitude', String(keyPoint.longitude));
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max'
  );
  url.searchParams.set('start_date', sortedDates[0]);
  url.searchParams.set('end_date', sortedDates[sortedDates.length - 1]);
  url.searchParams.set('timezone', 'UTC');

  const response = await fetch(url);
  if (!response.ok) {
    const reason = await response
      .json()
      .then((b: { reason?: string }) => b.reason ?? '')
      .catch(() => '');
    throw new Error(
      `Open-Meteo request failed with ${response.status}${reason ? `: ${reason}` : ''}`
    );
  }

  const body = (await response.json()) as OpenMeteoDailyResponse;
  const daily = body.daily;

  if (
    !daily?.time ||
    !daily.temperature_2m_max ||
    !daily.temperature_2m_min ||
    !daily.precipitation_sum ||
    !daily.wind_speed_10m_max
  ) {
    throw new Error(
      body.reason ?? 'Open-Meteo response did not include daily forecast data'
    );
  }

  return sortedDates.map((date) => {
    const index = daily.time?.indexOf(date) ?? -1;
    if (index < 0) {
      throw new Error(`Open-Meteo response did not include ${date}`);
    }

    const maxTemperature = daily.temperature_2m_max?.[index] ?? 0;
    const minTemperature = daily.temperature_2m_min?.[index] ?? maxTemperature;
    const precipitationMm = daily.precipitation_sum?.[index] ?? 0;
    const windSpeedKmh = daily.wind_speed_10m_max?.[index] ?? 0;

    return {
      source: 'Open-Meteo',
      date,
      temperatureC: roundOneDecimal((maxTemperature + minTemperature) / 2),
      precipitationMm,
      windSpeedKmh,
      visibilityM: estimateVisibilityM(precipitationMm, windSpeedKmh)
    };
  });
}

function estimateVisibilityM(
  precipitationMm: number,
  windSpeedKmh: number
): number {
  if (precipitationMm >= 10 || windSpeedKmh >= 70) {
    return 3000;
  }

  if (precipitationMm >= 3 || windSpeedKmh >= 45) {
    return 7000;
  }

  return 15000;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
