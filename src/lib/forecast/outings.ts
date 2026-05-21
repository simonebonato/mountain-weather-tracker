import type { DailyForecast } from './horizon';
import type { SourceForecast } from './sources';

export interface OutingForecast {
  areaName: string;
  activity: string;
  verdict: 'Good' | 'Uncertain' | 'Bad';
  lastUpdatedAt: string;
  days: DailyForecast[];
}

export function summarizeOutingForecast(
  sourceForecasts: SourceForecast[]
): DailyForecast[] {
  const firstSource = sourceForecasts[0];

  if (!firstSource) {
    return [];
  }

  return firstSource.days;
}
