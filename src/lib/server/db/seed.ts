import { eq } from 'drizzle-orm';

import {
  buildTripSummary,
  deterministicForecastForDate,
  keyNumbersForDay,
  type Activity,
  type ForecastMetrics
} from '$lib/domain/outings';
import { datesFromToday } from '$lib/server/weather/dates';

import type { AppDatabase } from './index';
import { areas, forecasts, keyPoints, outings, sources } from './schema';

export function seedDemoData(db: AppDatabase): void {
  const existingSource = db.select().from(sources).limit(1).get();

  if (!existingSource) {
    db.insert(sources)
      .values({
        name: 'Open-Meteo',
        adapter: 'open-meteo',
        geographicMatchScore: 1,
        domainSpecialtyScore: 1
      })
      .run();
  }

  const existingOuting = db.select().from(outings).limit(1).get();
  if (existingOuting) {
    return;
  }

  db.insert(areas).values({ name: 'Chamonix' }).run();
  const area = db.select().from(areas).where(eq(areas.name, 'Chamonix')).get();
  if (!area) {
    throw new Error('Failed to seed demo area');
  }

  db.insert(keyPoints)
    .values({
      areaId: area.id,
      name: 'Chamonix valley',
      latitude: 45.9237,
      longitude: 6.8694,
      elevationM: 1035
    })
    .run();

  const activity: Activity = 'hiking';
  const dates = datesFromToday();
  const dailyForecasts = dates.map((date) => ({
    date,
    metrics: deterministicForecastForDate(date, `Chamonix:${activity}`)
  }));
  const trip = buildTripSummary(dailyForecasts, activity);
  const now = new Date();
  const nowIso = now.toISOString();

  db.insert(outings)
    .values({
      areaId: area.id,
      name: 'Chamonix week',
      activity,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      active: true,
      currentVerdict: trip.tripVerdict,
      lastUpdatedAt: now,
      summaryJson: JSON.stringify({
        metrics: trip.compactNumbers.map((number) => ({
          ...number,
          range: number.value
        })),
        days: trip.days.map((day) => ({
          date: day.date,
          verdict: day.verdict,
          precipitation: keyNumberValue(day.metrics, 'precipitationMm'),
          wind: keyNumberValue(day.metrics, 'windKmh')
        }))
      })
    })
    .run();

  const source = db
    .select()
    .from(sources)
    .where(eq(sources.adapter, 'open-meteo'))
    .get();
  const keyPoint = db
    .select()
    .from(keyPoints)
    .where(eq(keyPoints.areaId, area.id))
    .get();

  if (!source || !keyPoint) {
    throw new Error('Failed to seed demo forecast dependencies');
  }

  db.insert(forecasts)
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
}

function keyNumberValue(
  metrics: ForecastMetrics,
  key: 'precipitationMm' | 'windKmh'
): string {
  const numbers = keyNumbersForDay('hiking', metrics);
  return (
    numbers.find(
      (number) =>
        number.label === (key === 'precipitationMm' ? 'Precip' : 'Wind')
    )?.value ?? ''
  );
}
