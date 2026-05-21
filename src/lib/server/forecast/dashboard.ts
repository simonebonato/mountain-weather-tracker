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
  const sourceWeights = new Map(
    forecastSources.map((s) => [
      s.id,
      s.geographicMatchScore *
        s.domainSpecialtyScore *
        (s.reliabilityScore !== null ? s.reliabilityScore / 5 : 1)
    ])
  );
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
  const weightedPayloads = forecastsForOuting.map((f) => ({
    payload: f.payload,
    weight: sourceWeights.get(f.sourceId) ?? 1
  }));

  return {
    id: outing.id,
    name: outing.name,
    areaName: outing.areaName,
    dateRangeLabel: formatDateRange(outing.startDate, outing.endDate),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    needsRefresh: missingForecast || hasStaleForecast,
    verdict: computeVerdict(weightedPayloads),
    keyNumbers: computeKeyNumbers(weightedPayloads),
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

type WeightedPayload = { payload: ForecastPayload; weight: number };

function computeKeyNumbers(
  weighted: WeightedPayload[]
): DashboardOuting['keyNumbers'] {
  if (weighted.length === 0) {
    return {
      temperatureC: null,
      precipitationMm: null,
      windSpeedKmh: null
    };
  }

  return {
    temperatureC: weightedAverage(weighted, (p) => p.temperatureC),
    precipitationMm: weightedAverage(weighted, (p) => p.precipitationMm),
    windSpeedKmh: weightedAverage(weighted, (p) => p.windSpeedKmh)
  };
}

function computeVerdict(weighted: WeightedPayload[]): Verdict {
  if (weighted.length === 0) {
    return 'Uncertain';
  }

  const precipitation = weightedAverage(weighted, (p) => p.precipitationMm);
  const wind = weightedAverage(weighted, (p) => p.windSpeedKmh);
  const visibility = weightedAverage(weighted, (p) => p.visibilityM);

  if (precipitation >= 8 || wind >= 55 || visibility < 5000) {
    return 'Bad';
  }

  if (precipitation >= 3 || wind >= 35 || visibility < 10000) {
    return 'Uncertain';
  }

  return 'Good';
}

function weightedAverage(
  weighted: WeightedPayload[],
  getValue: (p: ForecastPayload) => number
): number {
  const totalWeight = weighted.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const sum = weighted.reduce(
    (acc, { payload, weight }) => acc + getValue(payload) * weight,
    0
  );
  return Math.round((sum / totalWeight) * 10) / 10;
}

function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
}
