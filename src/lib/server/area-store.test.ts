import { describe, expect, it } from 'vitest';
import { createArea, listAreas } from './area-store';
import { createDatabase } from './db/index';

describe('area-store', () => {
  it('stores and lists an area with key points', () => {
    const { db, sqlite } = createDatabase();

    const stored = createArea(
      db,
      {
        name: 'Warner Route',
        keyPoints: [
          {
            label: 'Start',
            latitude: 38.562706,
            longitude: -107.741587,
            elevationM: 2519
          },
          {
            label: 'High point',
            latitude: 38.566891,
            longitude: -107.750795,
            elevationM: 2604
          },
          {
            label: 'End',
            latitude: 38.562706,
            longitude: -107.741587,
            elevationM: 2519
          }
        ]
      },
      new Date('2026-05-21T12:00:00.000Z')
    );

    expect(stored.id).toBe(1);
    expect(listAreas(db)).toEqual([
      {
        id: 1,
        name: 'Warner Route',
        createdAt: '2026-05-21T12:00:00.000Z',
        keyPoints: [
          {
            label: 'Start',
            latitude: 38.562706,
            longitude: -107.741587,
            elevationM: 2519
          },
          {
            label: 'High point',
            latitude: 38.566891,
            longitude: -107.750795,
            elevationM: 2604
          },
          {
            label: 'End',
            latitude: 38.562706,
            longitude: -107.741587,
            elevationM: 2519
          }
        ]
      }
    ]);

    sqlite.close();
  });
});
