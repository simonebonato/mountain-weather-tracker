import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { normalizeForecastHorizon } from '$lib/forecast/horizon';
import type { OutingForecast } from '$lib/forecast/outings';
import ForecastCard from './ForecastCard.svelte';

describe('ForecastCard', () => {
  it('renders the collapsed card with days 1-7 only', () => {
    const { body } = render(ForecastCard, {
      props: {
        forecast: makeForecast()
      }
    });

    expect(body).toContain('Day 7');
    expect(body).not.toContain('Day 8');
    expect(body).not.toContain('low confidence');
  });

  it('renders the expanded card with days 8-14 dimmed and labelled', () => {
    const { body } = render(ForecastCard, {
      props: {
        forecast: makeForecast(),
        initialExpanded: true
      }
    });

    expect(body).toContain('Day 8');
    expect(body).toContain('Day 14');
    expect(body).toContain('low-confidence');
    expect(body).toContain('low confidence');
  });
});

function makeForecast(): OutingForecast {
  return {
    areaName: 'Piz Nair',
    activity: 'Ski touring',
    verdict: 'Uncertain',
    lastUpdatedAt: '09:30',
    days: normalizeForecastHorizon(
      Array.from({ length: 14 }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        summary: 'Clear',
        temperatureHighC: 10,
        temperatureLowC: 2,
        precipitationMm: 0,
        windSpeedKmh: 12
      }))
    )
  };
}
