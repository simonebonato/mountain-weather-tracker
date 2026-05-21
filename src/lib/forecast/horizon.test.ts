import { describe, expect, it } from 'vitest';
import {
  MAX_FORECAST_DAYS,
  NORMAL_FORECAST_DAYS,
  getVisibleForecastDays,
  normalizeForecastHorizon
} from './horizon';

describe('forecast horizon normalization', () => {
  it('caps source data at 14 days and marks days 8-14 as low confidence', () => {
    const days = normalizeForecastHorizon(makeSourceDays(16));

    expect(days).toHaveLength(MAX_FORECAST_DAYS);
    expect(days[0]).toMatchObject({ dayIndex: 1, confidenceTier: 'normal' });
    expect(days[6]).toMatchObject({
      dayIndex: NORMAL_FORECAST_DAYS,
      confidenceTier: 'normal'
    });
    expect(days[7]).toMatchObject({ dayIndex: 8, confidenceTier: 'low' });
    expect(days[13]).toMatchObject({
      dayIndex: MAX_FORECAST_DAYS,
      confidenceTier: 'low'
    });
    expect(days.every((day) => day.dayIndex <= MAX_FORECAST_DAYS)).toBe(true);
  });

  it('shows only the normal-confidence horizon until the card is expanded', () => {
    const days = normalizeForecastHorizon(makeSourceDays(14));

    expect(
      getVisibleForecastDays(days, false).map((day) => day.dayIndex)
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      getVisibleForecastDays(days, true).map((day) => day.dayIndex)
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
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
