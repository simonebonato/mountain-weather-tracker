import { describe, expect, it } from 'vitest';
import {
  buildTripSummary,
  computeDayVerdict,
  deterministicForecastForDate,
  enumerateDateRange,
  enumerateForecastHorizon,
  type ForecastMetrics,
  worstVerdict
} from './outings';

const goodMetrics: ForecastMetrics = {
  temperatureC: 12,
  precipitationMm: 0.5,
  windKmh: 12,
  visibilityKm: 18,
  thunderstormProbabilityPct: 5,
  snowDepthCm: 45,
  freezeLevelM: 1800,
  avalancheRisk: 1
};

describe('outing date ranges', () => {
  it('includes start and end dates', () => {
    expect(
      enumerateDateRange({ startDate: '2026-06-05', endDate: '2026-06-07' })
    ).toEqual(['2026-06-05', '2026-06-06', '2026-06-07']);
  });

  it('allows a single-day outing when start and end match', () => {
    expect(
      enumerateDateRange({ startDate: '2026-06-05', endDate: '2026-06-05' })
    ).toEqual(['2026-06-05']);
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      enumerateDateRange({ startDate: '2026-06-07', endDate: '2026-06-05' })
    ).toThrow('End date must be on or after the start date.');
  });

  it('builds the capped 14-day forecast horizon from the start date', () => {
    const dates = enumerateForecastHorizon('2026-06-05');

    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-06-05');
    expect(dates[13]).toBe('2026-06-18');
  });
});

describe('trip verdicts', () => {
  it('returns the worst verdict across the whole range', () => {
    expect(
      worstVerdict([
        { verdict: 'Good' },
        { verdict: 'Bad' },
        { verdict: 'Good' }
      ])
    ).toBe('Bad');
  });

  it('keeps uncertain as the trip verdict when there are no bad days', () => {
    expect(
      worstVerdict([
        { verdict: 'Good' },
        { verdict: 'Uncertain' },
        { verdict: 'Good' }
      ])
    ).toBe('Uncertain');
  });

  it('uses the worst day for the compact card numbers', () => {
    const summary = buildTripSummary(
      [
        { date: '2026-06-05', metrics: goodMetrics },
        {
          date: '2026-06-06',
          metrics: { ...goodMetrics, precipitationMm: 14, windKmh: 60 }
        },
        { date: '2026-06-07', metrics: goodMetrics }
      ],
      'hiking'
    );

    expect(summary.tripVerdict).toBe('Bad');
    expect(summary.worstDay.date).toBe('2026-06-06');
    expect(summary.days.map((day) => day.verdict)).toEqual([
      'Good',
      'Bad',
      'Good'
    ]);
    expect(summary.compactNumbers).toEqual([
      { label: 'Temp', value: '12°C' },
      { label: 'Precip', value: '14 mm' },
      { label: 'Wind', value: '60 km/h' }
    ]);
  });

  it('marks days 8-14 as low-confidence display metadata', () => {
    const summary = buildTripSummary(
      enumerateForecastHorizon('2026-06-05').map((date) => ({
        date,
        metrics: goodMetrics
      })),
      'hiking'
    );

    expect(summary.days[0]).toMatchObject({
      dayIndex: 1,
      confidenceTier: 'normal'
    });
    expect(summary.days[6]).toMatchObject({
      dayIndex: 7,
      confidenceTier: 'normal'
    });
    expect(summary.days[7]).toMatchObject({
      dayIndex: 8,
      confidenceTier: 'low'
    });
    expect(summary.days[13]).toMatchObject({
      dayIndex: 14,
      confidenceTier: 'low'
    });
  });
});

describe('deterministic fallback forecasts', () => {
  it('never produces negative key numbers', () => {
    const metrics = deterministicForecastForDate(
      '2026-06-01',
      'Chamonix:hiking'
    );

    expect(metrics.precipitationMm).toBeGreaterThanOrEqual(0);
    expect(metrics.windKmh).toBeGreaterThanOrEqual(0);
    expect(metrics.visibilityKm).toBeGreaterThanOrEqual(0);
  });
});

describe('activity-aware daily verdicts', () => {
  it('applies the via ferrata thunderstorm blocker only above the threshold', () => {
    expect(
      computeDayVerdict(
        { ...goodMetrics, thunderstormProbabilityPct: 30 },
        'via_ferrata'
      )
    ).toBe('Good');
    expect(
      computeDayVerdict(
        { ...goodMetrics, thunderstormProbabilityPct: 31 },
        'via_ferrata'
      )
    ).toBe('Bad');
  });

  it('includes ski touring avalanche risk in the day verdict', () => {
    expect(
      computeDayVerdict({ ...goodMetrics, avalancheRisk: 4 }, 'ski_touring')
    ).toBe('Bad');
  });
});
