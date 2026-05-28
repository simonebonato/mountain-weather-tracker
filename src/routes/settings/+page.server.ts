import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDatabase } from '$lib/server/db/index';
import { sources, appSettings } from '$lib/server/db/schema';
import { detectCredentials } from '$lib/server/agents/credentials';
import type { Actions, PageServerLoad } from './$types';

type AgentName = 'codex' | 'claude';

function resolveDefaultAgent(credentials: {
  codex: boolean;
  claude: boolean;
}): AgentName | null {
  if (credentials.codex) return 'codex';
  if (credentials.claude) return 'claude';
  return null;
}

export const load: PageServerLoad = async () => {
  const db = getDatabase();
  const credentials = detectCredentials();

  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'activeAgent'))
    .get();

  let activeAgent: AgentName | null = (row?.value as AgentName) ?? null;

  if (!activeAgent) {
    const defaultAgent = resolveDefaultAgent(credentials);
    if (defaultAgent) {
      db.insert(appSettings)
        .values({ key: 'activeAgent', value: defaultAgent })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: defaultAgent }
        })
        .run();
      activeAgent = defaultAgent;
    }
  }

  return {
    sources: db.select().from(sources).all(),
    credentials,
    activeAgent
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

  setActiveAgent: async ({ request }) => {
    const formData = await request.formData();
    const agent = formData.get('agent') as string;

    if (agent !== 'codex' && agent !== 'claude') {
      return fail(400, { error: 'Invalid agent.' });
    }

    const db = getDatabase();
    db.insert(appSettings)
      .values({ key: 'activeAgent', value: agent })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: agent }
      })
      .run();

    return { updated: true };
  }
};
