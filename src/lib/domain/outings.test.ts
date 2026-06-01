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
  describe('via ferrata thunderstorm hard blocker', () => {
    it('returns Good below the 30% threshold', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, thunderstormProbabilityPct: 29 },
          'via_ferrata'
        )
      ).toBe('Good');
    });

    it('returns Good at exactly the 30% threshold', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, thunderstormProbabilityPct: 30 },
          'via_ferrata'
        )
      ).toBe('Good');
    });

    it('returns Bad above the 30% threshold', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, thunderstormProbabilityPct: 31 },
          'via_ferrata'
        )
      ).toBe('Bad');
    });

    it('returns Bad regardless of other variables when above threshold', () => {
      expect(
        computeDayVerdict(
          {
            ...goodMetrics,
            thunderstormProbabilityPct: 65,
            precipitationMm: 0,
            windKmh: 0,
            visibilityKm: 50,
            temperatureC: 20
          },
          'via_ferrata'
        )
      ).toBe('Bad');
    });
  });

  describe('activity-specific verdicts for hiking', () => {
    it('uses base variable scoring only', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, precipitationMm: 0, windKmh: 12, visibilityKm: 18 },
          'hiking'
        )
      ).toBe('Good');
    });

    it('returns Uncertain when precipitation is high', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, precipitationMm: 15 }, 'hiking')
      ).toBe('Uncertain');
    });

    it('returns Bad when multiple base variables exceed threshold', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, precipitationMm: 15, windKmh: 60 },
          'hiking'
        )
      ).toBe('Bad');
    });
  });

  describe('activity-specific verdicts for skiing', () => {
    it('includes snow depth and freeze level scoring', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, snowDepthCm: 45, freezeLevelM: 1800 },
          'skiing'
        )
      ).toBe('Good');
    });

    it('returns Uncertain when snow depth is critically low', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, snowDepthCm: 5 }, 'skiing')
      ).toBe('Uncertain');
    });

    it('returns Bad when snow depth and other factors combine', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, snowDepthCm: 5, windKmh: 60 },
          'skiing'
        )
      ).toBe('Bad');
    });

    it('returns Uncertain when freeze level is extreme', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, freezeLevelM: 600 }, 'skiing')
      ).toBe('Uncertain');
    });

    it('returns Bad when both snow depth and freeze level are extreme', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, snowDepthCm: 5, freezeLevelM: 600 },
          'skiing'
        )
      ).toBe('Bad');
    });
  });

  describe('activity-specific verdicts for snowshoeing', () => {
    it('includes snow depth and freeze level scoring like skiing', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, snowDepthCm: 45, freezeLevelM: 1800 },
          'snowshoeing'
        )
      ).toBe('Good');
    });

    it('returns Uncertain when snow depth is critically low', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, snowDepthCm: 5 }, 'snowshoeing')
      ).toBe('Uncertain');
    });

    it('returns Bad when snow depth and other factors combine', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, snowDepthCm: 5, windKmh: 60 },
          'snowshoeing'
        )
      ).toBe('Bad');
    });
  });

  describe('activity-specific verdicts for ski touring', () => {
    it('includes snow depth, wind, and avalanche risk scoring', () => {
      expect(
        computeDayVerdict(
          {
            ...goodMetrics,
            snowDepthCm: 45,
            freezeLevelM: 1800,
            windKmh: 15,
            avalancheRisk: 2
          },
          'ski_touring'
        )
      ).toBe('Good');
    });

    it('returns Bad when avalanche risk >= 4', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, avalancheRisk: 4 }, 'ski_touring')
      ).toBe('Bad');
    });

    it('returns Bad when avalanche risk is 5', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, avalancheRisk: 5 }, 'ski_touring')
      ).toBe('Bad');
    });

    it('applies stricter wind threshold than general verdict', () => {
      expect(
        computeDayVerdict({ ...goodMetrics, windKmh: 25 }, 'ski_touring')
      ).toBe('Good');
      expect(
        computeDayVerdict({ ...goodMetrics, windKmh: 30 }, 'ski_touring')
      ).toBe('Uncertain');
    });
  });

  describe('Good/Uncertain/Bad verdict boundaries', () => {
    it('returns Good when score < 2', () => {
      expect(computeDayVerdict(goodMetrics, 'hiking')).toBe('Good');
    });

    it('returns Uncertain when score >= 2 and < 4', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, precipitationMm: 5, windKmh: 30 },
          'hiking'
        )
      ).toBe('Uncertain');
    });

    it('returns Bad when score >= 4', () => {
      expect(
        computeDayVerdict(
          { ...goodMetrics, precipitationMm: 15, windKmh: 60 },
          'hiking'
        )
      ).toBe('Bad');
    });
  });
});
