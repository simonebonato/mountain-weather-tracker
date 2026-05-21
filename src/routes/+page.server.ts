import { fail } from '@sveltejs/kit';
import { ACTIVITY_OPTIONS, todayDateString } from '$lib/domain/outings';
import {
  ingestHikingAppUrl,
  formatHikingUrlError
} from '$lib/ingestion/hiking-url';
import { createArea, listAreas } from '$lib/server/area-store';
import { getDatabase } from '$lib/server/db/index';
import { refreshDashboardInBackground } from '$lib/server/forecast/refresh';
import { createOuting, listDashboardOutings } from '$lib/server/outings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const db = getDatabase();
  const outings = listDashboardOutings(db);

  if (outings.some((outing) => outing.needsRefresh)) {
    refreshDashboardInBackground();
  }

  return {
    activities: ACTIVITY_OPTIONS,
    areas: listAreas(db),
    outings,
    today: todayDateString()
  };
};

export const actions: Actions = {
  createOuting: async ({ request }) => {
    const formData = await request.formData();

    try {
      createOuting({
        areaName: valueFromForm(formData, 'areaName'),
        activity: valueFromForm(formData, 'activity'),
        startDate: valueFromForm(formData, 'startDate'),
        endDate: valueFromForm(formData, 'endDate')
      });

      return { createdOuting: true };
    } catch (error) {
      return fail(400, {
        intent: 'createOuting',
        areaName: valueFromForm(formData, 'areaName'),
        activity: valueFromForm(formData, 'activity'),
        startDate: valueFromForm(formData, 'startDate'),
        endDate: valueFromForm(formData, 'endDate'),
        error:
          error instanceof Error ? error.message : 'Could not create outing.'
      });
    }
  },
  createFromUrl: async ({ request, fetch }) => {
    const formData = await request.formData();
    const url = String(formData.get('url') ?? '').trim();

    if (!url) {
      return fail(400, {
        intent: 'createFromUrl',
        url,
        error: 'Paste a public Komoot or O-Trails route URL.'
      });
    }

    try {
      const area = createArea(
        getDatabase(),
        await ingestHikingAppUrl(url, {
          fetch: (input, init) => fetch(input, init)
        })
      );

      return {
        createdAreaId: area.id
      };
    } catch (error) {
      return fail(400, {
        intent: 'createFromUrl',
        url,
        error: formatHikingUrlError(error)
      });
    }
  }
};

function valueFromForm(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
