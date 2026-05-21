import type { OutingForecast } from './outings';
import { summarizeOutingForecast } from './outings';
import {
  fetchForecastsForSources,
  type ForecastRequest,
  type ForecastSource
} from './sources';

const summaries = [
  'Clear',
  'Clear',
  'Partly cloudy',
  'Light snow',
  'Cloudy',
  'Clear',
  'Windy',
  'Mixed cloud',
  'Light rain',
  'Cloudy',
  'Clear',
  'Partly cloudy',
  'Snow showers',
  'Clear'
];

const demoSources: ForecastSource[] = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    fetchDailyForecast: async ({ days }) => makeDemoDays(days, 0)
  },
  {
    id: 'alpine-model',
    name: 'Alpine Model',
    fetchDailyForecast: async ({ days }) => makeDemoDays(days, 1)
  }
];

const demoRequest: ForecastRequest = {
  latitude: 46.8523,
  longitude: 9.532,
  elevationM: 2844,
  startDate: '2026-05-21'
};

export async function getDemoOutingForecast(): Promise<OutingForecast> {
  const sourceForecasts = await fetchForecastsForSources(
    demoSources,
    demoRequest
  );

  return {
    areaName: 'Piz Nair',
    activity: 'Ski touring',
    verdict: 'Uncertain',
    lastUpdatedAt: '09:30',
    days: summarizeOutingForecast(sourceForecasts)
  };
}

function makeDemoDays(days: number, sourceOffset: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(`${demoRequest.startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);

    return {
      date: date.toISOString().slice(0, 10),
      summary: summaries[index % summaries.length],
      temperatureHighC: 8 + sourceOffset - Math.floor(index / 4),
      temperatureLowC: 1 + sourceOffset - Math.floor(index / 5),
      precipitationMm: index % 4 === 0 ? 4 + sourceOffset : index % 3,
      windSpeedKmh: 18 + index * 2 + sourceOffset
    };
  });
}
