import { desc, eq } from 'drizzle-orm';

import type { AreaDraft, KeyPoint, StoredArea } from '$lib/domain/area';

import type { AppDatabase } from './db/index';
import { areas, keyPoints } from './db/schema';

export function createArea(
  db: AppDatabase,
  draft: AreaDraft,
  now: Date = new Date()
): StoredArea {
  if (draft.keyPoints.length === 0) {
    throw new Error('Cannot store an area without key points.');
  }

  const createdAt = now.toISOString();

  const area = db
    .insert(areas)
    .values({ name: draft.name, createdAt })
    .returning({ id: areas.id })
    .get();

  db.insert(keyPoints)
    .values(
      draft.keyPoints.map((keyPoint) => ({
        areaId: area.id,
        name: keyPoint.label,
        latitude: keyPoint.latitude,
        longitude: keyPoint.longitude,
        elevationM: keyPoint.elevationM
      }))
    )
    .run();

  return {
    id: area.id,
    name: draft.name,
    keyPoints: draft.keyPoints,
    createdAt,
    sourceUrl: draft.sourceUrl,
    sourceProvider: draft.sourceProvider
  };
}

export function listAreas(db: AppDatabase): StoredArea[] {
  const areaRows = db
    .select({
      id: areas.id,
      name: areas.name,
      createdAt: areas.createdAt
    })
    .from(areas)
    .orderBy(desc(areas.createdAt), desc(areas.id))
    .all();

  if (areaRows.length === 0) {
    return [];
  }

  const keyPointRows = db
    .select({
      areaId: keyPoints.areaId,
      label: keyPoints.name,
      latitude: keyPoints.latitude,
      longitude: keyPoints.longitude,
      elevationM: keyPoints.elevationM
    })
    .from(keyPoints)
    .all();

  const keyPointsByAreaId = new Map<number, KeyPoint[]>();

  for (const row of keyPointRows) {
    const grouped = keyPointsByAreaId.get(row.areaId) ?? [];
    grouped.push({
      label: row.label,
      latitude: row.latitude,
      longitude: row.longitude,
      elevationM: row.elevationM ?? 0
    });
    keyPointsByAreaId.set(row.areaId, grouped);
  }

  return areaRows.map((area) => ({
    id: area.id,
    name: area.name,
    createdAt: area.createdAt,
    keyPoints: keyPointsByAreaId.get(area.id) ?? []
  }));
}
