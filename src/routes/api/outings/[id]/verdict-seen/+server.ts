import { json, type RequestHandler } from '@sveltejs/kit';

import { markOutingVerdictSeen } from '$lib/server/outings';

export const POST: RequestHandler = ({ params }) => {
  const outingId = Number(params.id);

  if (!Number.isInteger(outingId) || !markOutingVerdictSeen(outingId)) {
    return json({ error: 'Outing not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
};
