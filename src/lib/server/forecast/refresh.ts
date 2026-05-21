import { and, eq } from 'drizzle-orm';

import { getDatabase, type AppDatabase } from '$lib/server/db/index';
import { keyPoints, outings, sources } from '$lib/server/db/schema';
import { datesFrom } from '$lib/server/weather/dates';
import { fetchOpenMeteoForecasts } from '$lib/server/weather/open-meteo';

import { ForecastCache } from './cache';
import { listActiveOutings } from './dashboard';

type RefreshOptions = {
  force?: boolean;
  now?: Date;
  db?: AppDatabase;
};

const inFlightRefreshes = new Map<string, Promise<void>>();

export function refreshDashboardInBackground(now = new Date()): void {
  const key = 'dashboard';
  if (inFlightRefreshes.has(key)) {
    return;
  }

  const refresh = refreshDashboardForecasts({ now }).finally(() => {
    inFlightRefreshes.delete(key);
  });

  inFlightRefreshes.set(key, refresh);
  refresh.catch((error: unknown) => {
    console.error('Background forecast refresh failed', error);
  });
}

export async function refreshDashboardForecasts(
  options: RefreshOptions = {}
): Promise<void> {
  const db = options.db ?? getDatabase();
  const activeOutings = listActiveOutings(db);

  await Promise.all(
    activeOutings.map((outing) =>
      refreshOutingForecasts(outing.id, {
        ...options,
        db
      })
    )
  );
}

export async function refreshOutingForecasts(
  outingId: number,
  options: RefreshOptions = {}
): Promise<void> {
  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const cache = new ForecastCache(db);
  const outing = db
    .select()
    .from(outings)
    .where(eq(outings.id, outingId))
    .get();

  if (!outing) {
    throw new Error(`Outing ${outingId} does not exist`);
  }

  const outingKeyPoints = db
    .select()
    .from(keyPoints)
    .where(eq(keyPoints.areaId, outing.areaId))
    .all();
  const forecastSources = db.select().from(sources).all();
  const dates = datesFrom(outing.startDate);

  await Promise.all(
    forecastSources.map(async (source) => {
      if (source.adapter !== 'open-meteo') {
        return;
      }

      for (const keyPoint of outingKeyPoints) {
        const datesToFetch = dates.filter((forecastDate) => {
          if (options.force) {
            return true;
          }

          return (
            cache.get(
              {
                sourceId: source.id,
                keyPointId: keyPoint.id,
                forecastDate
              },
              now
            ) === null
          );
        });

        if (datesToFetch.length === 0) {
          continue;
        }

        const fetchedForecasts = await fetchOpenMeteoForecasts(
          keyPoint,
          datesToFetch
        );
        const fetchedAt = new Date();

        for (const payload of fetchedForecasts) {
          cache.set({
            sourceId: source.id,
            keyPointId: keyPoint.id,
            forecastDate: payload.date,
            fetchedAt,
            payload
          });
        }
      }
    })
  );
}

export function hasRefreshInFlight(): boolean {
  return inFlightRefreshes.size > 0;
}
