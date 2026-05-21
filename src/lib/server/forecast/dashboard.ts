import { and, eq } from 'drizzle-orm';

import {
  isForecastFresh,
  type CachedForecast,
  type ForecastPayload,
  type Verdict
} from '$lib/forecast/types';
import { getDatabase, type AppDatabase } from '$lib/server/db/index';
import { areas, keyPoints, outings, sources } from '$lib/server/db/schema';
import { enumerateDates } from '$lib/server/weather/dates';

import { ForecastCache } from './cache';

export type DashboardForecast = CachedForecast & {
  fresh: boolean;
};

export type DashboardOuting = {
  id: number;
  name: string;
  areaName: string;
  dateRangeLabel: string;
  lastUpdatedAt: string | null;
  needsRefresh: boolean;
  verdict: Verdict;
  keyNumbers: {
    temperatureC: number | null;
    precipitationMm: number | null;
    windSpeedKmh: number | null;
  };
  forecasts: DashboardForecast[];
};

type OutingRow = {
  id: number;
  name: string;
  areaId: number;
  areaName: string;
  startDate: string;
  endDate: string;
};

export function getDashboardOutings(
  now = new Date(),
  db = getDatabase()
): DashboardOuting[] {
  return listActiveOutings(db).map((outing) =>
    buildDashboardOuting(outing, now, db)
  );
}

export function getDashboardOuting(
  outingId: number,
  now = new Date(),
  db = getDatabase()
): DashboardOuting | null {
  const outing = listActiveOutings(db).find(
    (candidate) => candidate.id === outingId
  );
  return outing ? buildDashboardOuting(outing, now, db) : null;
}

export function listActiveOutings(db: AppDatabase): OutingRow[] {
  return db
    .select({
      id: outings.id,
      name: outings.name,
      areaId: outings.areaId,
      areaName: areas.name,
      startDate: outings.startDate,
      endDate: outings.endDate
    })
    .from(outings)
    .innerJoin(areas, eq(outings.areaId, areas.id))
    .where(eq(outings.active, true))
    .all();
}

function buildDashboardOuting(
  outing: OutingRow,
  now: Date,
  db: AppDatabase
): DashboardOuting {
  const cache = new ForecastCache(db);
  const dates = enumerateDates(outing.startDate, outing.endDate);
  const outingKeyPoints = db
    .select()
    .from(keyPoints)
    .where(eq(keyPoints.areaId, outing.areaId))
    .all();
  const forecastSources = db.select().from(sources).all();
  const forecastsForOuting: DashboardForecast[] = [];
  let missingForecast = false;

  for (const keyPoint of outingKeyPoints) {
    for (const source of forecastSources) {
      for (const forecastDate of dates) {
        const cached = cache.getAny({
          sourceId: source.id,
          keyPointId: keyPoint.id,
          forecastDate
        });

        if (!cached) {
          missingForecast = true;
          continue;
        }

        forecastsForOuting.push({
          ...cached,
          fresh: isForecastFresh(cached.fetchedAt, now)
        });
      }
    }
  }

  const lastUpdatedAt = latestFetchTime(forecastsForOuting);
  const hasStaleForecast = forecastsForOuting.some(
    (forecast) => !forecast.fresh
  );
  const payloads = forecastsForOuting.map((forecast) => forecast.payload);

  return {
    id: outing.id,
    name: outing.name,
    areaName: outing.areaName,
    dateRangeLabel: formatDateRange(outing.startDate, outing.endDate),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    needsRefresh: missingForecast || hasStaleForecast,
    verdict: computeVerdict(payloads),
    keyNumbers: computeKeyNumbers(payloads),
    forecasts: forecastsForOuting.sort((a, b) =>
      a.forecastDate.localeCompare(b.forecastDate)
    )
  };
}

function latestFetchTime(forecastsForOuting: DashboardForecast[]): Date | null {
  const timestamps = forecastsForOuting.map((forecast) =>
    forecast.fetchedAt.getTime()
  );
  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function computeKeyNumbers(
  payloads: ForecastPayload[]
): DashboardOuting['keyNumbers'] {
  if (payloads.length === 0) {
    return {
      temperatureC: null,
      precipitationMm: null,
      windSpeedKmh: null
    };
  }

  return {
    temperatureC: average(payloads.map((payload) => payload.temperatureC)),
    precipitationMm: average(
      payloads.map((payload) => payload.precipitationMm)
    ),
    windSpeedKmh: average(payloads.map((payload) => payload.windSpeedKmh))
  };
}

function computeVerdict(payloads: ForecastPayload[]): Verdict {
  if (payloads.length === 0) {
    return 'Uncertain';
  }

  const precipitation = average(
    payloads.map((payload) => payload.precipitationMm)
  );
  const wind = average(payloads.map((payload) => payload.windSpeedKmh));
  const visibility = average(payloads.map((payload) => payload.visibilityM));

  if (precipitation >= 8 || wind >= 55 || visibility < 5000) {
    return 'Bad';
  }

  if (precipitation >= 3 || wind >= 35 || visibility < 10000) {
    return 'Uncertain';
  }

  return 'Good';
}

function average(values: number[]): number {
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10
    ) / 10
  );
}

function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
}
