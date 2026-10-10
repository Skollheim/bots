<!--
  The day at a glance, under Home: the threads finished today, the files their
  tools changed and the time they worked, then one line per thread; a click
  shows the thread in Boite. Read from the core's threads only.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useView } from '../../../lib/island/contract';
  import { duration, RecapReader } from '../../../lib/island/recap.svelte';
  import { fill, strings } from '../../../lib/strings';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.assistant.recap;
  const reader = new RecapReader({
    client: () => view.core.client,
    projects: () => companion.projects,
    leftOut: () => companion.ownThreads
  });

  const recap = $derived(reader.recap);
  const count = $derived(recap.threads.length);

  // Read again when the threads move (at most every half minute) or the core comes back.
  $effect(() => {
    void [companion.threads, view.core.client];
    untrack(() => void reader.load());
  });

  function time(ms: number): string {
    if (ms < 60_000) return copy.instant;
    const { hours, minutes } = duration(ms);
    return hours > 0 ? fill(copy.hours, { hours: String(hours), minutes: String(minutes).padStart(2, '0') }) : fill(copy.minutes, { minutes: String(minutes) });
  }

  const files = (n: number) => (n === 1 ? copy.filesOne : fill(copy.filesMany, { count: String(n) }));
</script>

{#if reader.loaded}
  <section class="island-card recap" data-testid="island-recap">
    <h3 class="island-heading">{copy.title}</h3>
    {#if count === 0}
      <p class="none">{copy.none}</p>
    {:else}
      <p class="totals">
        <span>{count === 1 ? copy.finishedOne : fill(copy.finishedMany, { count: String(count) })}</span>
        <span>{files(recap.files)}</span>
        <span>{time(recap.workedMs)}</span>
      </p>
      <ul>
        {#each recap.threads as line (line.id)}
          <li>
            <button class="row" title={fill(copy.open, { title: line.title })} onclick={() => void view.reveal(line.id).catch(() => {})}>
              <span class="title">{line.title}{#if line.project}<span class="project">{` · ${line.project}`}</span>{/if}</span>
              <span class="meta">{[line.files > 0 ? files(line.files) : '', time(line.workedMs)].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .none {
    margin: 0;
    color: var(--island-muted);
  }
  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0 0 6px;
    color: var(--island-text);
    font-size: 12.5px;
    font-weight: 500;
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: auto;
    margin: 0 -8px;
    padding: 5px 8px;
    border: none;
    border-radius: 10px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--island-card-hover);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project,
  .meta {
    color: var(--island-muted);
  }
  .meta {
    flex: none;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
