import { MAX_FORECAST_DAYS } from '$lib/forecast/horizon';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function datesFrom(
  startDate: string,
  days = MAX_FORECAST_DAYS
): string[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);

  if (Number.isNaN(start) || days <= 0) {
    return [];
  }

  return Array.from({ length: Math.min(days, MAX_FORECAST_DAYS) }, (_, index) =>
    toIsoDate(new Date(start + index * DAY_MS))
  );
}

export function datesFromToday(
  days = MAX_FORECAST_DAYS,
  now = new Date()
): string[] {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  return Array.from({ length: Math.min(days, MAX_FORECAST_DAYS) }, (_, index) =>
    toIsoDate(new Date(start + index * DAY_MS))
  );
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return [];
  }

  const dates: string[] = [];
  for (let current = start; current <= end; current += DAY_MS) {
    dates.push(toIsoDate(new Date(current)));
  }

  return dates;
}
