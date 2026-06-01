import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDatabase } from '$lib/server/db/index';
import { sources } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const db = getDatabase();
  return {
    sources: db.select().from(sources).all()
  };
};

export const actions: Actions = {
  setReliability: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get('id'));
    const raw = formData.get('reliability');
    const score = raw === '' || raw === null ? null : Number(raw);

    if (!Number.isInteger(id) || id <= 0) {
      return fail(400, { error: 'Invalid source id.' });
    }

    if (
      score !== null &&
      (score < 1 || score > 5 || !Number.isInteger(score))
    ) {
      return fail(400, { error: 'Reliability must be 1–5 or empty.' });
    }

    const db = getDatabase();
    db.update(sources)
      .set({ reliabilityScore: score })
      .where(eq(sources.id, id))
      .run();

    return { updated: true };
  },
  setFetchInstructions: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get('id'));
    const instructions = formData.get('fetchInstructions');

    if (!Number.isInteger(id) || id <= 0) {
      return fail(400, { error: 'Invalid source id.' });
    }

    const db = getDatabase();
    db.update(sources)
      .set({
        fetchInstructions:
          instructions === '' || instructions === null
            ? null
            : String(instructions)
      })
      .where(eq(sources.id, id))
      .run();

    return { updated: true };
  }
};
