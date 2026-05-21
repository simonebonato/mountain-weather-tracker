import { eq } from 'drizzle-orm';

import {
  compareVerdictsForDashboard,
  hasVerdictChanged,
  isVerdict,
  type Verdict
} from '$lib/domain/verdict';

import { getDatabase, type AppDatabase } from './db/index';
import { seedDemoData } from './db/seed';
import { areas, outings, verdictSnapshots, type OutingRow } from './db/schema';

export type WeatherMetric = {
  label: string;
  value: string;
  range: string;
};

export type DayBreakdown = {
  date: string;
  verdict: Verdict;
  precipitation: string;
  wind: string;
};

export type OutingSummary = {
  metrics: WeatherMetric[];
  days: DayBreakdown[];
};

export type DashboardOuting = {
  id: number;
  name: string;
  areaName: string;
  activity: string;
  verdict: Verdict;
  previousVerdict: Verdict | null;
  verdictChanged: boolean;
  lastUpdatedAt: string;
  summary: OutingSummary;
};

export function listDashboardOutings(
  database: AppDatabase = getDatabase(),
  visitedAt = new Date()
): DashboardOuting[] {
  ensureSeedOutings(database);

  const outingRows = database
    .select({
      id: outings.id,
      areaName: areas.name,
      name: outings.name,
      activity: outings.activity,
      currentVerdict: outings.currentVerdict,
      lastUpdatedAt: outings.lastUpdatedAt,
      summaryJson: outings.summaryJson
    })
    .from(outings)
    .innerJoin(areas, eq(outings.areaId, areas.id))
    .all();
  const snapshotRows = database.select().from(verdictSnapshots).all();
  const snapshotsByOuting = new Map(
    snapshotRows.map((snapshot) => [snapshot.outingId, snapshot])
  );

  const cards = outingRows.map((outing) => {
    const previousVerdict = snapshotsByOuting.get(outing.id)?.verdict ?? null;
    const verdictChanged = hasVerdictChanged(
      previousVerdict,
      outing.currentVerdict
    );

    return toDashboardOuting(outing, previousVerdict, verdictChanged);
  });

  for (const outing of outingRows) {
    upsertSnapshot(database, outing.id, outing.currentVerdict, visitedAt);
  }

  return cards.sort((left, right) => {
    const verdictSort = compareVerdictsForDashboard(
      left.verdict,
      right.verdict
    );
    return verdictSort === 0
      ? left.name.localeCompare(right.name)
      : verdictSort;
  });
}

export function markVerdictSeen(
  outingId: number | string,
  database: AppDatabase = getDatabase(),
  seenAt = new Date()
): boolean {
  const normalizedId =
    typeof outingId === 'number' ? outingId : Number(outingId);

  if (!Number.isInteger(normalizedId)) {
    return false;
  }

  const outing = database
    .select()
    .from(outings)
    .where(eq(outings.id, normalizedId))
    .get();

  if (!outing) {
    return false;
  }

  upsertSnapshot(database, outing.id, outing.currentVerdict, seenAt);
  return true;
}

function ensureSeedOutings(database: AppDatabase): void {
  const existingOuting = database
    .select({ id: outings.id })
    .from(outings)
    .limit(1)
    .get();

  if (!existingOuting) {
    seedDemoData(database);
  }
}

function upsertSnapshot(
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

function toDashboardOuting(
  outing: Pick<
    OutingRow,
    | 'id'
    | 'name'
    | 'activity'
    | 'currentVerdict'
    | 'lastUpdatedAt'
    | 'summaryJson'
  > & { areaName: string },
  previousVerdict: Verdict | null,
  verdictChanged: boolean
): DashboardOuting {
  return {
    id: outing.id,
    name: outing.name,
    areaName: outing.areaName,
    activity: outing.activity,
    verdict: outing.currentVerdict,
    previousVerdict: verdictChanged ? previousVerdict : null,
    verdictChanged,
    lastUpdatedAt: formatTime(outing.lastUpdatedAt),
    summary: parseSummary(outing.summaryJson)
  };
}

function parseSummary(summaryJson: string): OutingSummary {
  const parsed = JSON.parse(summaryJson) as OutingSummary;

  return {
    metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
    days: Array.isArray(parsed.days)
      ? parsed.days.filter((day) => isVerdict(day.verdict))
      : []
  };
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(value);
}
