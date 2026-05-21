<script lang="ts">
  import type { OutingForecast } from '$lib/forecast/outings';
  import {
    getVisibleForecastDays,
    isLowConfidenceDay
  } from '$lib/forecast/horizon';

  export let forecast: OutingForecast;
  export let initialExpanded = false;

  let expanded = initialExpanded;

  $: visibleDays = getVisibleForecastDays(forecast.days, expanded);
</script>

<article class="forecast-card" aria-label={`${forecast.areaName} forecast`}>
  <header class="card-header">
    <div>
      <p class="activity">{forecast.activity}</p>
      <h2>{forecast.areaName}</h2>
    </div>
    <div
      class:good={forecast.verdict === 'Good'}
      class:bad={forecast.verdict === 'Bad'}
      class="verdict"
    >
      {forecast.verdict}
    </div>
  </header>

  <div class="meta">
    <span>Last updated at {forecast.lastUpdatedAt}</span>
    <span>{expanded ? '14-day breakdown' : '7-day outlook'}</span>
  </div>

  <ol class="days" aria-label={expanded ? '14-day forecast' : '7-day forecast'}>
    {#each visibleDays as day}
      <li class:low-confidence={isLowConfidenceDay(day)} class="day">
        <div class="day-heading">
          <span>Day {day.dayIndex}</span>
          {#if isLowConfidenceDay(day)}
            <span class="confidence-label">low confidence</span>
          {/if}
        </div>
        <time datetime={day.date}>{day.date}</time>
        <strong>{day.summary}</strong>
        <dl>
          <div>
            <dt>High</dt>
            <dd>{day.temperatureHighC} C</dd>
          </div>
          <div>
            <dt>Low</dt>
            <dd>{day.temperatureLowC} C</dd>
          </div>
          <div>
            <dt>Rain</dt>
            <dd>{day.precipitationMm} mm</dd>
          </div>
          <div>
            <dt>Wind</dt>
            <dd>{day.windSpeedKmh} km/h</dd>
          </div>
        </dl>
      </li>
    {/each}
  </ol>

  <button type="button" class="toggle" on:click={() => (expanded = !expanded)}>
    {expanded ? 'Show 7 days' : 'Show days 8-14'}
  </button>
</article>

<style>
  .forecast-card {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid #d4d8dd;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 30px rgb(31 41 55 / 8%);
  }

  .card-header,
  .meta,
  .day-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .activity {
    margin: 0 0 0.25rem;
    color: #526070;
    font-size: 0.85rem;
  }

  h2 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: 0;
  }

  .verdict {
    min-width: 6rem;
    padding: 0.45rem 0.65rem;
    border-radius: 6px;
    background: #fff2c5;
    color: #6d4b00;
    font-weight: 700;
    text-align: center;
  }

  .verdict.good {
    background: #dff4e7;
    color: #17623a;
  }

  .verdict.bad {
    background: #f9d4d4;
    color: #8b1e1e;
  }

  .meta {
    color: #526070;
    font-size: 0.9rem;
  }

  .days {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .day {
    display: grid;
    gap: 0.55rem;
    min-height: 11rem;
    padding: 0.75rem;
    border: 1px solid #dce2e8;
    border-radius: 8px;
    background: #f9fafb;
  }

  .day.low-confidence {
    border-style: dashed;
    background: #f1f3f5;
    color: #5d6773;
    opacity: 0.62;
  }

  .day-heading {
    font-weight: 700;
  }

  .confidence-label {
    padding: 0.2rem 0.35rem;
    border: 1px solid #a9b3bf;
    border-radius: 4px;
    color: #4f5b68;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  time {
    color: #526070;
    font-size: 0.82rem;
  }

  strong {
    font-size: 0.98rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem 0.75rem;
    margin: 0;
  }

  dt {
    color: #526070;
    font-size: 0.72rem;
  }

  dd {
    margin: 0;
    font-weight: 700;
  }

  .toggle {
    justify-self: start;
    min-height: 2.5rem;
    padding: 0 0.9rem;
    border: 1px solid #1f2937;
    border-radius: 6px;
    background: #1f2937;
    color: white;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  @media (max-width: 520px) {
    .card-header,
    .meta {
      align-items: flex-start;
      flex-direction: column;
    }

    .verdict {
      min-width: 100%;
    }
  }
</style>
