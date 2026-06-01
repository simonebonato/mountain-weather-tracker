import { and, desc, eq, sql } from 'drizzle-orm';
import { isForecastFresh } from '$lib/forecast/types';
import {
  activityLabel,
  assertDateRange,
  buildTripSummary,
  deterministicForecastForDate,
  enumerateDateRange,
  isActivity,
  keyNumbersForDay,
  type Activity,
  type ForecastMetrics,
  type TripSummary,
  type Verdict
} from '$lib/domain/outings';
import { getDatabase, type AppDatabase } from './db/index';
import {
  areas,
  forecasts,
  keyPoints,
  outings,
  sources,
  verdictSnapshots
} from './db/schema';

export interface CreateOutingInput {
  areaName: string;
  activity: string;
  startDate: string;
  endDate: string;
  scoutingNotes?: string;
}

export interface DashboardOuting {
  id: number;
  areaName: string;
  activity: Activity;
  activityLabel: string;
  startDate: string;
  endDate: string;
  trip: TripSummary;
  lastUpdatedAt: string | null;
  needsRefresh: boolean;
  verdictChanged: boolean;
  previousVerdict: Verdict | null;
  scoutingNotes: string | null;
}

type ForecastRow = {
  forecastDate: string;
  fetchedAt: string;
  temperatureC: number;
  precipitationMm: number;
  windKmh: number;
  visibilityKm: number;
  thunderstormProbabilityPct: number;
  snowDepthCm: number;
  freezeLevelM: number;
  avalancheRisk: number;
};

export function createOuting(
  input: CreateOutingInput,
  database: AppDatabase = getDatabase()
): void {
  const areaName = input.areaName.trim();

  if (areaName.length === 0) {
    throw new Error('Area name is required.');
  }

  if (!isActivity(input.activity)) {
    throw new Error('Choose a supported activity.');
  }

  assertDateRange({ startDate: input.startDate, endDate: input.endDate });

  const activity = input.activity;
  const dates = enumerateDateRange({
    startDate: input.startDate,
    endDate: input.endDate
  });
  const dailyForecasts = dates.map((date) => ({
    date,
    metrics: deterministicForecastForDate(date, `${areaName}:${activity}`)
  }));
  const trip = buildTripSummary(dailyForecasts, activity);
  const now = new Date();
  const nowIso = now.toISOString();
  const source = ensureDemoSource(database);

  database.transaction((tx) => {
    tx.insert(areas).values({ name: areaName }).run();
    const area = tx
      .select()
      .from(areas)
      .where(eq(areas.name, areaName))
      .orderBy(desc(areas.id))
      .get();

    if (!area) {
      throw new Error('Failed to create area.');
    }

    tx.insert(keyPoints)
      .values({
        areaId: area.id,
        name: `${areaName} reference point`,
        latitude: 0,
        longitude: 0,
        elevationM: 0
      })
      .run();

    const keyPoint = tx
      .select()
      .from(keyPoints)
      .where(eq(keyPoints.areaId, area.id))
      .orderBy(desc(keyPoints.id))
      .get();

    if (!keyPoint) {
      throw new Error('Failed to create key point.');
    }

    tx.insert(outings)
      .values({
        areaId: area.id,
        name: `${areaName} ${activityLabel(activity)}`,
        activity,
        startDate: input.startDate,
        endDate: input.endDate,
        active: true,
        currentVerdict: trip.tripVerdict,
        lastUpdatedAt: now,
        summaryJson: JSON.stringify(toStoredSummary(trip, activity))
      })
      .run();

    if (input.scoutingNotes) {
      tx.run(
        sql`UPDATE outings SET scouting_notes = ${input.scoutingNotes} WHERE area_id = ${area.id} ORDER BY id DESC LIMIT 1`
      );
    }

    tx.insert(forecasts)
      .values(
        dailyForecasts.map(({ date, metrics }) => ({
          sourceId: source.id,
          keyPointId: keyPoint.id,
          forecastDate: date,
          fetchedAt: nowIso,
          temperatureC: metrics.temperatureC,
          precipitationMm: metrics.precipitationMm,
          windKmh: metrics.windKmh,
          visibilityKm: metrics.visibilityKm,
          thunderstormProbabilityPct: metrics.thunderstormProbabilityPct,
          snowDepthCm: metrics.snowDepthCm,
          freezeLevelM: metrics.freezeLevelM,
          avalancheRisk: metrics.avalancheRisk,
          payload: {
            source: source.name,
            date,
            temperatureC: metrics.temperatureC,
            precipitationMm: metrics.precipitationMm,
            windSpeedKmh: metrics.windKmh,
            visibilityM: metrics.visibilityKm * 1000
          }
        }))
      )
      .run();
  });
}

type OutingDashboardRow = {
  id: number;
  areaId: number;
  areaName: string;
  activity: string;
  startDate: string;
  endDate: string;
  lastUpdatedAt: Date;
  scoutingNotes: string | null;
};

export function listDashboardOutings(
  database: AppDatabase = getDatabase(),
  visitedAt = new Date()
): DashboardOuting[] {
  const outingRows = database.all(
    sql`SELECT
      o.id, o.area_id as areaId, a.name as areaName, o.activity,
      o.start_date as startDate, o.end_date as endDate,
      o.last_updated_at as lastUpdatedAt, o.scouting_notes as scoutingNotes
    FROM outings o
    INNER JOIN areas a ON o.area_id = a.id
    WHERE o.active = 1
    ORDER BY o.created_at DESC, o.id DESC`
  ) as unknown as OutingDashboardRow[];

  const source = ensureDemoSource(database);
  const snapshotsByOuting = new Map(
    database
      .select()
      .from(verdictSnapshots)
      .all()
      .map((snapshot) => [snapshot.outingId, snapshot])
  );

  const dashboardOutings = outingRows.map((outing) => {
    const card = buildDashboardOuting(outing, source.id, database);
    const previousVerdict = snapshotsByOuting.get(card.id)?.verdict ?? null;
    const verdictChanged =
      previousVerdict !== null && previousVerdict !== card.trip.tripVerdict;

    return {
      ...card,
      previousVerdict: verdictChanged ? previousVerdict : null,
      verdictChanged,
      scoutingNotes: outing.scoutingNotes
    };
  });

  for (const outing of dashboardOutings) {
    upsertVerdictSnapshot(
      database,
      outing.id,
      outing.trip.tripVerdict,
      visitedAt
    );
  }

  return dashboardOutings;
}

export function markOutingVerdictSeen(
  outingId: number,
  database: AppDatabase = getDatabase(),
  seenAt = new Date()
): boolean {
  const outing = database.get(
    sql`SELECT
      o.id, o.area_id as areaId, a.name as areaName, o.activity,
      o.start_date as startDate, o.end_date as endDate,
      o.last_updated_at as lastUpdatedAt, o.scouting_notes as scoutingNotes
    FROM outings o
    INNER JOIN areas a ON o.area_id = a.id
    WHERE o.id = ${outingId} AND o.active = 1`
  ) as unknown as OutingDashboardRow | undefined;

  if (!outing) {
    return false;
  }

  const source = ensureDemoSource(database);
  const card = buildDashboardOuting(outing, source.id, database);
  upsertVerdictSnapshot(database, card.id, card.trip.tripVerdict, seenAt);
  return true;
}

function buildDashboardOuting(
  outing: OutingDashboardRow,
  sourceId: number,
  database: AppDatabase
): Omit<
  DashboardOuting,
  'previousVerdict' | 'verdictChanged' | 'scoutingNotes'
> {
  if (!isActivity(outing.activity)) {
    throw new Error(`Unsupported activity stored for outing ${outing.id}.`);
  }

  const expectedDates = enumerateDateRange({
    startDate: outing.startDate,
    endDate: outing.endDate
  });
  const forecastRows = database
    .select({
      forecastDate: forecasts.forecastDate,
      fetchedAt: forecasts.fetchedAt,
      temperatureC: forecasts.temperatureC,
      precipitationMm: forecasts.precipitationMm,
      windKmh: forecasts.windKmh,
      visibilityKm: forecasts.visibilityKm,
      thunderstormProbabilityPct: forecasts.thunderstormProbabilityPct,
      snowDepthCm: forecasts.snowDepthCm,
      freezeLevelM: forecasts.freezeLevelM,
      avalancheRisk: forecasts.avalancheRisk
    })
    .from(forecasts)
    .innerJoin(keyPoints, eq(forecasts.keyPointId, keyPoints.id))
    .where(
      and(eq(keyPoints.areaId, outing.areaId), eq(forecasts.sourceId, sourceId))
    )
    .all()
    .filter(
      (forecast) =>
        forecast.forecastDate >= outing.startDate &&
        forecast.forecastDate <= outing.endDate
    )
    .sort((left, right) => left.forecastDate.localeCompare(right.forecastDate));

  const dailyForecasts =
    forecastRows.length > 0
      ? forecastRows.map((forecast) => ({
          date: forecast.forecastDate,
          metrics: forecastToMetrics(forecast)
        }))
      : expectedDates.map((date) => ({
          date,
          metrics: deterministicForecastForDate(
            date,
            `${outing.areaName}:${outing.activity}`
          )
        }));

  return {
    id: outing.id,
    areaName: outing.areaName,
    activity: outing.activity,
    activityLabel: activityLabel(outing.activity),
    startDate: outing.startDate,
    endDate: outing.endDate,
    trip: buildTripSummary(dailyForecasts, outing.activity),
    lastUpdatedAt:
      mostRecentForecastTimestamp(forecastRows) ??
      outing.lastUpdatedAt.toISOString(),
    needsRefresh:
      forecastRows.length < expectedDates.length ||
      forecastRows.some(
        (forecast) => !isForecastFresh(new Date(forecast.fetchedAt))
      )
  };
}

function upsertVerdictSnapshot(
  database: AppDatabase,
  outingId: number,
  verdict: Verdict,
  seenAt: Date
): void {
  database
    .insert(verdictSnapshots)
    .values({ outingId, verdict, seenAt })
    .onConflictDoUpdate({
      target: verdictSnapshots.outingId,
      set: { verdict, seenAt }
    })
    .run();
}

function ensureDemoSource(database: AppDatabase): typeof sources.$inferSelect {
  const existing = database
    .select()
    .from(sources)
    .where(eq(sources.adapter, 'open-meteo'))
    .get();

  if (existing) {
    return existing;
  }

  database
    .insert(sources)
    .values({
      name: 'Open-Meteo',
      adapter: 'open-meteo',
      geographicMatchScore: 1,
      domainSpecialtyScore: 1
    })
    .run();

  const created = database
    .select()
    .from(sources)
    .where(eq(sources.adapter, 'open-meteo'))
    .get();

  if (!created) {
    throw new Error('Failed to create forecast source.');
  }

  return created;
}

function toStoredSummary(trip: TripSummary, activity: Activity) {
  return {
    metrics: trip.compactNumbers.map((number) => ({
      ...number,
      range: number.value
    })),
    days: trip.days.map((day) => ({
      date: day.date,
      verdict: day.verdict,
      precipitation: keyNumbersForDay(activity, day.metrics).find(
        (number) => number.label === 'Precip'
      )?.value,
      wind: keyNumbersForDay(activity, day.metrics).find(
        (number) => number.label === 'Wind'
      )?.value
    }))
  };
}

function forecastToMetrics(forecast: ForecastRow): ForecastMetrics {
  return {
    temperatureC: forecast.temperatureC,
    precipitationMm: forecast.precipitationMm,
    windKmh: forecast.windKmh,
    visibilityKm: forecast.visibilityKm,
    thunderstormProbabilityPct: forecast.thunderstormProbabilityPct,
    snowDepthCm: forecast.snowDepthCm,
    freezeLevelM: forecast.freezeLevelM,
    avalancheRisk: forecast.avalancheRisk
  };
}

function mostRecentForecastTimestamp(
  forecastRows: ForecastRow[]
): string | null {
  if (forecastRows.length === 0) {
    return null;
  }

  return new Date(
    Math.max(
      ...forecastRows.map((forecast) => new Date(forecast.fetchedAt).getTime())
    )
  ).toISOString();
}
