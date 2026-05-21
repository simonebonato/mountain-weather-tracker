import { and, eq } from 'drizzle-orm';

import {
  FORECAST_CACHE_TTL_MS,
  isForecastFresh,
  type CachedForecast,
  type ForecastCacheKey,
  type ForecastCacheWrite
} from '$lib/forecast/types';
import type { AppDatabase } from '$lib/server/db/index';
import { forecasts } from '$lib/server/db/schema';

type ForecastRow = typeof forecasts.$inferSelect;

export class ForecastCache {
  constructor(
    private readonly db: AppDatabase,
    private readonly ttlMs = FORECAST_CACHE_TTL_MS
  ) {}

  get(key: ForecastCacheKey, now = new Date()): CachedForecast | null {
    const cached = this.getAny(key);
    if (!cached || !isForecastFresh(cached.fetchedAt, now, this.ttlMs)) {
      return null;
    }

    return cached;
  }

  getAny(key: ForecastCacheKey): CachedForecast | null {
    const row = this.db
      .select()
      .from(forecasts)
      .where(
        and(
          eq(forecasts.sourceId, key.sourceId),
          eq(forecasts.keyPointId, key.keyPointId),
          eq(forecasts.forecastDate, key.forecastDate)
        )
      )
      .get();

    return row ? mapForecastRow(row) : null;
  }

  set(entry: ForecastCacheWrite): void {
    this.db
      .insert(forecasts)
      .values({
        sourceId: entry.sourceId,
        keyPointId: entry.keyPointId,
        forecastDate: entry.forecastDate,
        fetchedAt: entry.fetchedAt.toISOString(),
        temperatureC: entry.payload.temperatureC,
        precipitationMm: entry.payload.precipitationMm,
        windKmh: entry.payload.windSpeedKmh,
        visibilityKm: entry.payload.visibilityM / 1000,
        payload: entry.payload
      })
      .onConflictDoUpdate({
        target: [
          forecasts.sourceId,
          forecasts.keyPointId,
          forecasts.forecastDate
        ],
        set: {
          fetchedAt: entry.fetchedAt.toISOString(),
          temperatureC: entry.payload.temperatureC,
          precipitationMm: entry.payload.precipitationMm,
          windKmh: entry.payload.windSpeedKmh,
          visibilityKm: entry.payload.visibilityM / 1000,
          payload: entry.payload
        }
      })
      .run();
  }
}

function mapForecastRow(row: ForecastRow): CachedForecast {
  return {
    sourceId: row.sourceId,
    keyPointId: row.keyPointId,
    forecastDate: row.forecastDate,
    fetchedAt: new Date(row.fetchedAt),
    payload: row.payload
  };
}
