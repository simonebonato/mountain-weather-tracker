export const FORECAST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type Verdict = 'Good' | 'Uncertain' | 'Bad';

export type ForecastPayload = {
  source: string;
  date: string;
  temperatureC: number;
  precipitationMm: number;
  windSpeedKmh: number;
  visibilityM: number;
};

export type CachedForecast = {
  sourceId: number;
  keyPointId: number;
  forecastDate: string;
  fetchedAt: Date;
  payload: ForecastPayload;
};

export type ForecastCacheKey = {
  sourceId: number;
  keyPointId: number;
  forecastDate: string;
};

export type ForecastCacheWrite = ForecastCacheKey & {
  fetchedAt: Date;
  payload: ForecastPayload;
};

export function isForecastFresh(
  fetchedAt: Date,
  now = new Date(),
  ttlMs = FORECAST_CACHE_TTL_MS
): boolean {
  return now.getTime() - fetchedAt.getTime() <= ttlMs;
}
