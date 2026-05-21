import { describe, expect, it } from 'vitest';
import { MAX_FORECAST_DAYS } from './horizon';
import { fetchForecastsForSources, type ForecastSource } from './sources';

describe('forecast sources', () => {
  it('requests the 14-day horizon from every source', async () => {
    const requestedDays: number[] = [];
    const sources: ForecastSource[] = ['open-meteo', 'alpine-model'].map(
      (id) => ({
        id,
        name: id,
        fetchDailyForecast: async ({ days }) => {
          requestedDays.push(days);
          return makeSourceDays(days + 2);
        }
      })
    );

    const forecasts = await fetchForecastsForSources(sources, {
      latitude: 46.8523,
      longitude: 9.532,
      elevationM: 2844,
      startDate: '2026-06-01'
    });

    expect(requestedDays).toEqual([MAX_FORECAST_DAYS, MAX_FORECAST_DAYS]);
    expect(forecasts).toHaveLength(2);
    expect(
      forecasts.every((forecast) => forecast.days.length === MAX_FORECAST_DAYS)
    ).toBe(true);
    expect(
      forecasts.every((forecast) => forecast.days[7].confidenceTier === 'low')
    ).toBe(true);
  });
});

function makeSourceDays(length: number) {
  return Array.from({ length }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    summary: 'Clear',
    temperatureHighC: 10,
    temperatureLowC: 2,
    precipitationMm: 0,
    windSpeedKmh: 12
  }));
}
