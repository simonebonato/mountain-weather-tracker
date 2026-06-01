<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<svelte:head>
  <title>Source Settings · Mountain Weather Tracker</title>
</svelte:head>

<main class="settings-view">
  <header class="page-header">
    <div>
      <h1>Source Settings</h1>
      <p>
        {data.sources.length}
        {data.sources.length === 1 ? 'source' : 'sources'} configured
      </p>
    </div>
    <a href="/" class="back-link">← Dashboard</a>
  </header>

  <section aria-labelledby="sources-heading">
    <h2 id="sources-heading" class="sr-only">Sources</h2>

    {#if data.sources.length === 0}
      <div class="empty-state">
        <p>No sources configured yet.</p>
      </div>
    {:else}
      <div class="source-list">
        {#each data.sources as source}
          <article class="source-card">
            <div class="source-info">
              <h3>{source.name}</h3>
              <p class="adapter">{source.adapter}</p>
              <dl class="scores">
                <div>
                  <dt>Geographic Match</dt>
                  <dd>{source.geographicMatchScore.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Domain Specialty</dt>
                  <dd>{source.domainSpecialtyScore.toFixed(2)}</dd>
                </div>
              </dl>
            </div>

            <div class="source-forms">
              <form
                method="POST"
                action="?/setReliability"
                class="reliability-form"
              >
                <input type="hidden" name="id" value={source.id} />
                <label>
                  <span>Reliability (1–5)</span>
                  <select name="reliability">
                    <option value="" selected={source.reliabilityScore === null}
                      >— unset —</option
                    >
                    {#each [1, 2, 3, 4, 5] as score}
                      <option
                        value={score}
                        selected={source.reliabilityScore === score}
                        >{score}</option
                      >
                    {/each}
                  </select>
                </label>
                <button type="submit">Save</button>
              </form>

              <form
                method="POST"
                action="?/setFetchInstructions"
                class="fetch-instructions-form"
              >
                <input type="hidden" name="id" value={source.id} />
                <label>
                  <span>Fetch Instructions</span>
                  <textarea
                    name="fetchInstructions"
                    placeholder="Enter fetch instructions..."
                    >{source.fetchInstructions || ''}</textarea
                  >
                </label>
                <button type="submit">Save</button>
              </form>
            </div>
          </article>
        {/each}
      </div>
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

  .settings-view {
    width: min(800px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 32px 0;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 20px;
    border-bottom: 1px solid #d8ddd2;
    margin-bottom: 24px;
  }

  h1 {
    font-size: 2rem;
    line-height: 1.1;
    margin: 0;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  .page-header p {
    margin-top: 6px;
    color: #667365;
    font-size: 0.95rem;
  }

  .back-link {
    color: #245a46;
    font-weight: 700;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .source-list {
    display: grid;
    gap: 12px;
  }

  .source-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 20px;
    padding: 16px;
    border: 1px solid #d8ddd2;
    border-radius: 8px;
    background: #ffffff;
  }

  .source-forms {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  h3 {
    font-size: 1rem;
    font-weight: 700;
  }

  .adapter {
    margin-top: 2px;
    color: #667365;
    font-size: 0.85rem;
  }

  .scores {
    display: flex;
    gap: 20px;
    margin-top: 10px;
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

  .reliability-form {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  label {
    display: grid;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #4e5b4d;
    text-transform: uppercase;
  }

  select,
  textarea {
    border: 1px solid #cbd4c7;
    border-radius: 8px;
    padding: 12px;
    background: #ffffff;
    font: inherit;
    color: #17201b;
  }

  select {
    min-width: 120px;
    min-height: 42px;
  }

  textarea {
    min-height: 100px;
    resize: vertical;
    font-family: monospace;
    font-size: 0.9rem;
  }

  button {
    display: inline-flex;
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

  .empty-state {
    display: flex;
    align-items: center;
    min-height: 120px;
    padding: 20px;
    border: 1px solid #d8ddd2;
    border-radius: 8px;
    background: #ffffff;
    color: #667365;
  }

  .reliability-form,
  .fetch-instructions-form {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  .fetch-instructions-form {
    flex-direction: column;
    align-items: stretch;
  }

  .fetch-instructions-form label {
    display: grid;
    gap: 6px;
  }

  @media (max-width: 600px) {
    .source-card {
      grid-template-columns: 1fr;
    }

    .source-forms {
      flex-direction: column;
    }

    .reliability-form {
      flex-wrap: wrap;
    }

    button {
      width: 100%;
    }
  }
</style>
