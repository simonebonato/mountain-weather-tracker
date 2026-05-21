import { describe, expect, it } from 'vitest';

import { createDatabase } from '$lib/server/db/index';

import { createOuting, listDashboardOutings } from './outings';

describe('outing date ranges', () => {
  it('stores and displays only the selected outing date range', () => {
    const { db, sqlite } = createDatabase();

    createOuting(
      {
        areaName: 'Test ridge',
        activity: 'hiking',
        startDate: '2026-06-05',
        endDate: '2026-06-05'
      },
      db
    );

    const [outing] = listDashboardOutings(db);

    expect(outing.trip.days).toHaveLength(1);
    expect(outing.trip.days[0]).toMatchObject({
      dayIndex: 1,
      confidenceTier: 'normal'
    });

    sqlite.close();
  });
});
