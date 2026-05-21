import { describe, expect, it } from 'vitest';

import { forecasts, verdictSnapshots } from '$lib/server/db/schema';
import { createDatabase, type AppDatabase } from '$lib/server/db/index';

import {
  createOuting,
  listDashboardOutings,
  markOutingVerdictSeen
} from './outings';

describe('verdict snapshots', () => {
  it('records last-seen verdicts without showing badges on the first visit', () => {
    const { db, sqlite } = createDatabase();
    createTestOuting(db);
    setGoodForecasts(db);

    const cards = listDashboardOutings(
      db,
      new Date('2026-05-21T08:00:00.000Z')
    );
    const snapshots = db.select().from(verdictSnapshots).all();

    expect(cards).toHaveLength(1);
    expect(cards[0].verdictChanged).toBe(false);
    expect(cards[0].previousVerdict).toBeNull();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].verdict).toBe('Good');

    sqlite.close();
  });

  it('shows a badge when the current verdict differs from the previous visit', () => {
    const { db, sqlite } = createDatabase();
    createTestOuting(db);
    setGoodForecasts(db);
    const [target] = listDashboardOutings(
      db,
      new Date('2026-05-21T08:00:00.000Z')
    );

    setBadForecasts(db);

    const cards = listDashboardOutings(
      db,
      new Date('2026-05-21T09:00:00.000Z')
    );
    const changedCard = cards.find((card) => card.id === target.id);
    const snapshot = db.select().from(verdictSnapshots).get();

    expect(changedCard?.trip.tripVerdict).toBe('Bad');
    expect(changedCard?.verdictChanged).toBe(true);
    expect(changedCard?.previousVerdict).toBe('Good');
    expect(snapshot?.verdict).toBe('Bad');

    sqlite.close();
  });

  it('lets expansion mark the current verdict as seen', () => {
    const { db, sqlite } = createDatabase();
    createTestOuting(db);
    setGoodForecasts(db);
    const [target] = listDashboardOutings(
      db,
      new Date('2026-05-21T08:00:00.000Z')
    );

    setBadForecasts(db);

    expect(
      markOutingVerdictSeen(target.id, db, new Date('2026-05-21T09:00:00.000Z'))
    ).toBe(true);

    const cards = listDashboardOutings(
      db,
      new Date('2026-05-21T09:05:00.000Z')
    );
    const changedCard = cards.find((card) => card.id === target.id);

    expect(changedCard?.verdictChanged).toBe(false);
    expect(changedCard?.previousVerdict).toBeNull();

    sqlite.close();
  });
});

function createTestOuting(db: AppDatabase) {
  createOuting(
    {
      areaName: 'Test ridge',
      activity: 'hiking',
      startDate: '2026-06-05',
      endDate: '2026-06-05'
    },
    db
  );
}

function setGoodForecasts(db: AppDatabase) {
  db.update(forecasts)
    .set({
      temperatureC: 12,
      precipitationMm: 0,
      windKmh: 10,
      visibilityKm: 20,
      thunderstormProbabilityPct: 0,
      snowDepthCm: 60,
      freezeLevelM: 1800,
      avalancheRisk: 1
    })
    .run();
}

function setBadForecasts(db: AppDatabase) {
  db.update(forecasts)
    .set({
      precipitationMm: 18,
      windKmh: 70,
      visibilityKm: 1
    })
    .run();
}
