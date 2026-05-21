<script lang="ts">
  import { onMount } from 'svelte';
  import {
    formatDateRange,
    formatDisplayDate,
    type Verdict
  } from '$lib/domain/outings';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let outings = data.outings;
  let clearedVerdictChanges: Record<number, boolean> = {};
  let refreshingOutingIds: number[] = [];

  type FailedForm = {
    intent?: 'createFromUrl' | 'createOuting';
    url?: string;
    areaName?: string;
    activity?: string;
    startDate?: string;
    endDate?: string;
    error?: string;
  };

  const failedForm = () => form as FailedForm | undefined;
  const fieldValue = (field: keyof FailedForm) => {
    const value = failedForm()?.[field];
    return typeof value === 'string' ? value : '';
  };
  const formError = (intent: FailedForm['intent']) =>
    failedForm()?.intent === intent ? fieldValue('error') : '';
  const verdictClass = (verdict: Verdict) =>
    `verdict verdict-${verdict.toLowerCase()}`;
  const showVerdictChange = (outing: PageData['outings'][number]) =>
    outing.verdictChanged && !clearedVerdictChanges[outing.id];
  const isRefreshing = (outing: PageData['outings'][number]) =>
    refreshingOutingIds.includes(outing.id);
  const formatUpdatedTime = (timestamp: string | null) =>
    timestamp
      ? new Intl.DateTimeFormat('en', {
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date(timestamp))
      : 'Pending';

  onMount(() => {
    if (!outings.some((outing) => outing.needsRefresh)) {
      return;
    }

    const interval = window.setInterval(() => {
      void pollRefreshingOutings();
    }, 1500);

    void pollRefreshingOutings();

    return () => window.clearInterval(interval);
  });

  async function pollRefreshingOutings() {
    await Promise.all(
      outings
        .filter((outing) => outing.needsRefresh)
        .map(async (outing) => {
          const response = await fetch(`/api/outings/${outing.id}/forecasts`);

          if (!response.ok) {
            return;
          }

          const body = (await response.json()) as {
            outing: PageData['outings'][number];
          };
          replaceOuting(body.outing);
        })
    );
  }

  async function refreshOuting(outing: PageData['outings'][number]) {
    refreshingOutingIds = [...new Set([...refreshingOutingIds, outing.id])];

    try {
      const response = await fetch(`/api/outings/${outing.id}/refresh`, {
        method: 'POST'
      });

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as {
        outing: PageData['outings'][number];
      };
      replaceOuting(body.outing);
    } finally {
      refreshingOutingIds = refreshingOutingIds.filter(
        (id) => id !== outing.id
      );
    }
  }

  function replaceOuting(updated: PageData['outings'][number]) {
    outings = outings.map((outing) =>
      outing.id === updated.id ? updated : outing
    );
  }

  async function clearVerdictChange(outing: PageData['outings'][number]) {
    clearedVerdictChanges = { ...clearedVerdictChanges, [outing.id]: true };

    const response = await fetch(`/api/outings/${outing.id}/verdict-seen`, {
      method: 'POST'
    });

    if (!response.ok) {
      clearedVerdictChanges = { ...clearedVerdictChanges, [outing.id]: false };
    }
  }

  function handleOutingToggle(
    event: Event,
    outing: PageData['outings'][number]
  ) {
    const details = event.currentTarget as HTMLDetailsElement;

    if (details.open && showVerdictChange(outing)) {
      void clearVerdictChange(outing);
    }
  }
</script>

<svelte:head>
  <title>Mountain Weather Tracker</title>
  <meta
    name="description"
    content="Track candidate mountain areas and their weather key points."
  />
</svelte:head>

<main class="comparison-view">
  <section class="toolbar" aria-labelledby="area-ingestion-heading">
    <div>
      <h1 id="area-ingestion-heading">Comparison View</h1>
      <p>
        {data.areas.length} tracked {data.areas.length === 1 ? 'area' : 'areas'}
        · <a href="/settings" class="settings-link">Source settings</a>
      </p>
    </div>

    <form method="POST" action="?/createFromUrl" class="url-form">
      <label>
        <span>Route URL</span>
        <div class="input-row">
          <input
            name="url"
            type="url"
            placeholder="https://www.komoot.com/tour/..."
            value={fieldValue('url')}
            autocomplete="off"
          />
        </div>
      </label>
      <button type="submit">Add Area</button>
    </form>
  </section>

  {#if formError('createFromUrl')}
    <p class="form-error" role="alert">{formError('createFromUrl')}</p>
  {/if}

  <section class="outing-panel" aria-labelledby="outing-heading">
    <div>
      <h2 id="outing-heading">Outings</h2>
      <p>
        {outings.length} active {outings.length === 1 ? 'outing' : 'outings'}
      </p>
    </div>

    <form method="POST" action="?/createOuting" class="outing-form">
      <label>
        <span>Area</span>
        <input
          name="areaName"
          autocomplete="off"
          value={fieldValue('areaName')}
          required
        />
      </label>

      <label>
        <span>Activity</span>
        <select name="activity" required>
          {#each data.activities as activity}
            <option
              value={activity.value}
              selected={(fieldValue('activity') || 'hiking') === activity.value}
            >
              {activity.label}
            </option>
          {/each}
        </select>
      </label>

      <label>
        <span>Start</span>
        <input
          name="startDate"
          type="date"
          value={fieldValue('startDate') || data.today}
          required
        />
      </label>

      <label>
        <span>End</span>
        <input
          name="endDate"
          type="date"
          value={fieldValue('endDate') || data.today}
          required
        />
      </label>

      <button type="submit">Add outing</button>
    </form>

    {#if formError('createOuting')}
      <p class="form-error" role="alert">{formError('createOuting')}</p>
    {/if}
  </section>

  <section class="outing-list" aria-label="Outing verdicts">
    {#each outings as outing}
      <article class="outing-card">
        <details ontoggle={(event) => handleOutingToggle(event, outing)}>
          <summary>
            <div class="outing-title">
              <div class="verdict-stack">
                <span class={verdictClass(outing.trip.tripVerdict)}
                  >{outing.trip.tripVerdict}</span
                >
                {#if showVerdictChange(outing)}
                  <span
                    class="change-badge"
                    title={`Previous verdict: ${outing.previousVerdict}`}
                  >
                    Changed
                  </span>
                {/if}
              </div>
              <div>
                <h3>{outing.areaName}</h3>
                <p>
                  {outing.activityLabel} · {formatDateRange({
                    startDate: outing.startDate,
                    endDate: outing.endDate
                  })}
                </p>
              </div>
            </div>

            <dl class="compact-numbers">
              {#each outing.trip.compactNumbers as number}
                <div>
                  <dt>{number.label}</dt>
                  <dd>{number.value}</dd>
                </div>
              {/each}
            </dl>

            <div class="meta">
              <span
                >Worst day {formatDisplayDate(outing.trip.worstDay.date)}</span
              >
              <span
                >Last updated at {formatUpdatedTime(outing.lastUpdatedAt)}</span
              >
              {#if outing.needsRefresh || isRefreshing(outing)}
                <span class="refresh-label">Refreshing forecast</span>
              {/if}
              <button
                type="button"
                class="refresh-button"
                disabled={isRefreshing(outing)}
                onclick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void refreshOuting(outing);
                }}
              >
                Refresh
              </button>
            </div>
          </summary>

          <div class="day-breakdown">
            {#each outing.trip.days as day}
              <div class="day-row">
                <div class="day-heading">
                  <time datetime={day.date}>{formatDisplayDate(day.date)}</time>
                  <span class={verdictClass(day.verdict)}>{day.verdict}</span>
                </div>

                <dl class="day-numbers">
                  {#each day.keyNumbers as number}
                    <div>
                      <dt>{number.label}</dt>
                      <dd>{number.value}</dd>
                    </div>
                  {/each}
                </dl>
              </div>
            {/each}
          </div>
        </details>
      </article>
    {/each}
  </section>

  <section class="area-grid" aria-label="Tracked areas">
    {#if data.areas.length === 0}
      <div class="empty-state">
        <p>No areas yet.</p>
      </div>
    {:else}
      {#each data.areas as area}
        <article class="area-card">
          <header>
            <div>
              <h2>{area.name}</h2>
              <p>
                {area.keyPoints.length} key {area.keyPoints.length === 1
                  ? 'point'
                  : 'points'}
              </p>
            </div>
          </header>

          <ol>
            {#each area.keyPoints as keyPoint}
              <li>
                <div>
                  <strong>{keyPoint.label}</strong>
                  <span>
                    {keyPoint.latitude.toFixed(5)}, {keyPoint.longitude.toFixed(
                      5
                    )} · {keyPoint.elevationM} m
                  </span>
                </div>
              </li>
            {/each}
          </ol>
        </article>
      {/each}
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f6f7f3;
    color: #17201b;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .comparison-view {
    width: min(1120px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 32px 0;
  }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(340px, 560px);
    gap: 24px;
    align-items: end;
    padding-bottom: 20px;
    border-bottom: 1px solid #d8ddd2;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: 2rem;
    line-height: 1.1;
  }

  .toolbar p,
  .outing-panel p,
  .outing-title p,
  .meta,
  .area-card header p,
  .empty-state p {
    margin-top: 6px;
    color: #667365;
    font-size: 0.95rem;
  }

  .settings-link {
    color: #245a46;
    font-weight: 700;
  }

  .url-form {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: end;
  }

  label {
    display: grid;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #4e5b4d;
    text-transform: uppercase;
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    align-items: center;
    min-height: 42px;
    padding: 0 12px;
    background: #ffffff;
    border: 1px solid #cbd4c7;
    border-radius: 8px;
  }

  input,
  select {
    min-width: 0;
    width: 100%;
    min-height: 42px;
    border: 1px solid #cbd4c7;
    border-radius: 8px;
    padding: 0 12px;
    background: #ffffff;
    font: inherit;
    color: #17201b;
  }

  .input-row input {
    min-height: auto;
    border: 0;
    padding: 0;
    outline: 0;
  }

  button {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: #245a46;
    color: #ffffff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover {
    background: #1d4939;
  }

  .form-error {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid #e6b8ad;
    border-radius: 8px;
    background: #fff1ee;
    color: #8c2f22;
  }

  .outing-panel {
    display: grid;
    grid-template-columns: minmax(180px, 0.55fr) minmax(0, 1.45fr);
    gap: 18px;
    align-items: end;
    margin-top: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid #d8ddd2;
  }

  .outing-form {
    display: grid;
    grid-template-columns:
      minmax(160px, 1.2fr) minmax(150px, 0.9fr) minmax(132px, 0.8fr) minmax(
        132px,
        0.8fr
      )
      auto;
    gap: 10px;
    align-items: end;
  }

  .outing-list {
    display: grid;
    gap: 12px;
    margin-top: 20px;
  }

  .outing-card {
    border: 1px solid #d8ddd2;
    border-radius: 8px;
    background: #ffffff;
    overflow: hidden;
  }

  summary {
    display: grid;
    grid-template-columns: minmax(220px, 1.2fr) minmax(220px, 0.9fr) minmax(
        150px,
        auto
      );
    gap: 14px;
    align-items: center;
    min-height: 92px;
    padding: 16px;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .outing-title {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  h3 {
    overflow-wrap: anywhere;
    font-size: 1.08rem;
    line-height: 1.2;
  }

  .verdict {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 86px;
    min-height: 32px;
    border-radius: 999px;
    padding: 0 10px;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .verdict-stack {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .change-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    border-radius: 999px;
    padding: 0 9px;
    background: #223c63;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .refresh-label {
    color: #8a6214;
    font-weight: 800;
  }

  .refresh-button {
    min-height: 32px;
    padding: 0 10px;
    font-size: 0.8rem;
    justify-self: end;
  }

  .verdict-good {
    background: #d9f2df;
    color: #155f35;
  }

  .verdict-uncertain {
    background: #fff1bf;
    color: #765500;
  }

  .verdict-bad {
    background: #ffd9d1;
    color: #9f2415;
  }

  .compact-numbers,
  .day-numbers {
    display: grid;
    gap: 8px;
  }

  .compact-numbers {
    grid-template-columns: repeat(3, minmax(68px, 1fr));
  }

  dt {
    color: #667365;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  dd {
    margin: 2px 0 0;
    font-weight: 850;
  }

  .meta {
    display: grid;
    justify-items: end;
    gap: 2px;
    text-align: right;
  }

  .day-breakdown {
    border-top: 1px solid #e4e8df;
    padding: 0 16px 16px;
  }

  .day-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 14px;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid #edf0e9;
  }

  .day-row:last-child {
    border-bottom: 0;
  }

  .day-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  time {
    min-width: 54px;
    font-weight: 850;
  }

  .day-numbers {
    grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  }

  .area-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
    margin-top: 20px;
  }

  .area-card,
  .empty-state {
    border: 1px solid #d8ddd2;
    border-radius: 8px;
    background: #ffffff;
  }

  .area-card {
    padding: 16px;
  }

  .area-card header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  h2 {
    font-size: 1.05rem;
    line-height: 1.25;
  }

  ol {
    display: grid;
    gap: 10px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: start;
    padding-top: 10px;
    border-top: 1px solid #edf0e9;
  }

  li strong,
  li span {
    display: block;
  }

  li strong {
    font-size: 0.92rem;
  }

  li span {
    margin-top: 2px;
    color: #667365;
    font-size: 0.86rem;
  }

  .empty-state {
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 120px;
    padding: 20px;
  }

  @media (max-width: 760px) {
    .comparison-view {
      width: min(100vw - 20px, 1120px);
      padding: 20px 0;
    }

    .toolbar,
    .url-form,
    .outing-panel,
    .outing-form,
    summary,
    .day-row {
      grid-template-columns: 1fr;
    }

    .meta {
      justify-items: start;
      text-align: left;
    }

    button {
      width: 100%;
    }
  }
</style>
