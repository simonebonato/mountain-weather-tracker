import { error, json, type RequestHandler } from '@sveltejs/kit';

import { listDashboardOutings } from '$lib/server/outings';

export const GET: RequestHandler = ({ params }) => {
  const outingId = Number(params.outingId);

  if (!Number.isInteger(outingId)) {
    error(400, 'Invalid outing id');
  }

  const outing = listDashboardOutings().find(
    (candidate) => candidate.id === outingId
  );
  if (!outing) {
    error(404, 'Outing not found');
  }

  return json({ outing });
};
