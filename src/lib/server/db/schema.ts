import { sql } from 'drizzle-orm';
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text
} from 'drizzle-orm/sqlite-core';

import type { ForecastPayload } from '$lib/forecast/types';
import type { Verdict } from '$lib/domain/verdict';

export const areas = sqliteTable('areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const keyPoints = sqliteTable('key_points', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  areaId: integer('area_id')
    .notNull()
    .references(() => areas.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  elevationM: real('elevation_m'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const outings = sqliteTable('outings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  areaId: integer('area_id')
    .notNull()
    .references(() => areas.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  activity: text('activity').notNull().default('hiking'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  currentVerdict: text('current_verdict')
    .$type<Verdict>()
    .notNull()
    .default('Uncertain'),
  lastUpdatedAt: integer('last_updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  summaryJson: text('summary_json')
    .notNull()
    .default('{"metrics":[],"days":[]}'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  adapter: text('adapter').notNull(),
  geographicMatchScore: real('geographic_match_score').notNull().default(1),
  domainSpecialtyScore: real('domain_specialty_score').notNull().default(1),
  reliabilityScore: real('reliability_score'),
  fetchInstructions: text('fetch_instructions'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});

export const forecasts = sqliteTable(
  'forecasts',
  {
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    keyPointId: integer('key_point_id')
      .notNull()
      .references(() => keyPoints.id, { onDelete: 'cascade' }),
    forecastDate: text('forecast_date').notNull(),
    fetchedAt: text('fetched_at').notNull(),
    temperatureC: real('temperature_c').notNull().default(0),
    precipitationMm: real('precipitation_mm').notNull().default(0),
    windKmh: real('wind_kmh').notNull().default(0),
    visibilityKm: real('visibility_km').notNull().default(0),
    thunderstormProbabilityPct: integer('thunderstorm_probability_pct')
      .notNull()
      .default(0),
    snowDepthCm: integer('snow_depth_cm').notNull().default(0),
    freezeLevelM: integer('freeze_level_m').notNull().default(0),
    avalancheRisk: integer('avalanche_risk').notNull().default(1),
    payload: text('payload', { mode: 'json' })
      .$type<ForecastPayload>()
      .notNull()
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.sourceId, table.keyPointId, table.forecastDate]
    })
  })
);

export const verdictSnapshots = sqliteTable('verdict_snapshots', {
  outingId: integer('outing_id')
    .primaryKey()
    .references(() => outings.id, { onDelete: 'cascade' }),
  verdict: text('verdict').$type<Verdict>().notNull(),
  seenAt: integer('seen_at', { mode: 'timestamp_ms' }).notNull()
});

export type OutingRow = typeof outings.$inferSelect;
export type NewOutingRow = typeof outings.$inferInsert;
