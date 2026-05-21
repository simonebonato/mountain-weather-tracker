import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url:
      process.env.MOUNTAIN_WEATHER_DB ?? 'data/mountain-weather-tracker.sqlite'
  }
});
