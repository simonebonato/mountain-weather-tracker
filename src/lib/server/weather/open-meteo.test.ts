import { describe, expect, it } from 'vitest';
import { clampToOpenMeteoHorizon } from './open-meteo';

describe('clampToOpenMeteoHorizon', () => {
  const now = new Date('2026-06-01T10:00:00Z');

  it('keeps dates within the 16-day window', () => {
    const dates = ['2026-06-01', '2026-06-08', '2026-06-16'];
    expect(clampToOpenMeteoHorizon(dates, now)).toEqual(dates);
  });

  it('drops dates beyond day 15 from today', () => {
    // today = Jun 1, max = Jun 16 (day 15, 0-indexed)
    const dates = ['2026-06-16', '2026-06-17', '2026-06-19'];
    expect(clampToOpenMeteoHorizon(dates, now)).toEqual(['2026-06-16']);
  });

  it('drops dates in the past', () => {
    const dates = ['2026-05-30', '2026-05-31', '2026-06-01'];
    expect(clampToOpenMeteoHorizon(dates, now)).toEqual(['2026-06-01']);
  });

  it('returns empty when all dates are out of range', () => {
    const dates = ['2026-06-17', '2026-06-20'];
    expect(clampToOpenMeteoHorizon(dates, now)).toEqual([]);
  });

  it('reproduces the engelberg bug: outing Jun 6–19 with today Jun 1', () => {
    // datesFrom("2026-06-06") produces Jun 6 → Jun 19 (14 days)
    // Open-Meteo horizon from Jun 1 = Jun 1 → Jun 16
    const dates = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 6 + i));
      return d.toISOString().slice(0, 10);
    });
    const result = clampToOpenMeteoHorizon(dates, now);
    expect(result.at(0)).toBe('2026-06-06');
    expect(result.at(-1)).toBe('2026-06-16');
    expect(result.every((d) => d <= '2026-06-16')).toBe(true);
  });
});
