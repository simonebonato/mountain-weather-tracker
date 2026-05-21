import {
  MAX_FORECAST_DAYS,
  type DailyForecast,
  type SourceDailyForecast,
  normalizeForecastHorizon
} from './horizon';

export interface ForecastRequest {
  latitude: number;
  longitude: number;
  elevationM: number;
  startDate: string;
}

export interface ForecastSource {
  id: string;
  name: string;
  fetchDailyForecast: (
    request: ForecastRequest & { days: number }
  ) => Promise<SourceDailyForecast[]>;
}

export interface SourceForecast {
  sourceId: string;
  sourceName: string;
  days: DailyForecast[];
}

export async function fetchForecastsForSources(
  sources: ForecastSource[],
  request: ForecastRequest
): Promise<SourceForecast[]> {
  return Promise.all(
    sources.map(async (source) => {
      const sourceDays = await source.fetchDailyForecast({
        ...request,
        days: MAX_FORECAST_DAYS
      });

      return {
        sourceId: source.id,
        sourceName: source.name,
        days: normalizeForecastHorizon(sourceDays)
      };
    })
  );
}
