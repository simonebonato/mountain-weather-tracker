export const NORMAL_FORECAST_DAYS = 7;
export const MAX_FORECAST_DAYS = 14;

export type ConfidenceTier = 'normal' | 'low';

export interface SourceDailyForecast {
  date: string;
  summary: string;
  temperatureHighC: number;
  temperatureLowC: number;
  precipitationMm: number;
  windSpeedKmh: number;
}

export interface DailyForecast extends SourceDailyForecast {
  dayIndex: number;
  confidenceTier: ConfidenceTier;
}

export function confidenceTierForDay(dayIndex: number): ConfidenceTier {
  return dayIndex <= NORMAL_FORECAST_DAYS ? 'normal' : 'low';
}

export function normalizeForecastHorizon(
  sourceDays: SourceDailyForecast[]
): DailyForecast[] {
  return sourceDays.slice(0, MAX_FORECAST_DAYS).map((day, index) => {
    const dayIndex = index + 1;

    return {
      ...day,
      dayIndex,
      confidenceTier: confidenceTierForDay(dayIndex)
    };
  });
}

export function getVisibleForecastDays(
  days: DailyForecast[],
  expanded: boolean
): DailyForecast[] {
  const cappedDays = days.filter((day) => day.dayIndex <= MAX_FORECAST_DAYS);

  if (expanded) {
    return cappedDays;
  }

  return cappedDays.filter((day) => day.dayIndex <= NORMAL_FORECAST_DAYS);
}

export function isLowConfidenceDay(day: DailyForecast): boolean {
  return day.confidenceTier === 'low';
}
