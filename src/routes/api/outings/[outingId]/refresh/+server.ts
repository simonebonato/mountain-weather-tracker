import { error, json, type RequestHandler } from '@sveltejs/kit';

import { refreshOutingForecasts } from '$lib/server/forecast/refresh';
import { listDashboardOutings } from '$lib/server/outings';

export const POST: RequestHandler = async ({ params }) => {
  const outingId = Number(params.outingId);

  if (!Number.isInteger(outingId)) {
    error(400, 'Invalid outing id');
  }

  await refreshOutingForecasts(outingId, { force: true });

  const outing = listDashboardOutings().find(
    (candidate) => candidate.id === outingId
  );
  if (!outing) {
    error(404, 'Outing not found');
  }

  return json({ outing });
};
