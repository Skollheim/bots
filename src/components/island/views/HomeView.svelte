<!--
  The island's Home: the agents at work (a click shows one in Boite), the
  reminders and what finished, the focus timer and its tools, the music, the
  threads that waited a while, the tasks launched, and the quotas of the
  subscription proxy, one gauge each.
-->
<script lang="ts">
  import { elapsed } from '@boite/ui/lib/format';
  import { page } from '@boite/ui/lib/page-hidden.svelte';
  import ProviderLogo from '@boite/ui/components/ProviderLogo.svelte';
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import CompanionFocusCards from '../../companion/CompanionFocusCards.svelte';
  import CompanionNotes from '../../companion/CompanionNotes.svelte';
  import CompanionRadar from '../../companion/CompanionRadar.svelte';
  import CompanionTaskCards from '../../companion/CompanionTaskCards.svelte';
  import CompanionTimer from '../../companion/CompanionTimer.svelte';
  import CompanionTools from '../../companion/CompanionTools.svelte';
  import MediaPill from '../../companion/MediaPill.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.home;
  const open = (threadId: string) => void view.reveal(threadId).catch(() => {});

  /** The earlier answers show in the chat: turned on here, the island turns to it. */
  function showHistory(on: boolean) {
    companion.history = on;
    if (on) view.show('chat');
  }

  // The clock of the agents at work runs while they show.
  let now = $state(Date.now());
  $effect(() => {
    if (companion.busy.length === 0 || page.hidden) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

</script>

<div class="home" data-testid="island-home">
  <CompanionNotes members={[]} notes={companion.notes} open={false} reachable={companion.reachable} />

  <section class="island-card">
    <h3 class="island-heading">{copy.busy}</h3>
    {#if companion.busy.length === 0}
      <p class="none">{copy.none}</p>
    {:else}
      <ul class="busy">
        {#each companion.busy as thread (thread.id)}
          <li>
            <button class="row" onclick={() => open(thread.id)} data-testid="island-busy">
              <i class="dot" aria-hidden="true"></i>
              <span class="lines">
                <span class="title">{thread.title}{#if thread.project}<span class="project"> · {thread.project}</span>{/if}</span>
                <span class="step">{thread.step}</span>
              </span>
              {#if thread.since !== null}<span class="time">{elapsed(now - thread.since)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if companion.radar.shown}
    <CompanionRadar radar={companion.radar} onopen={open} onreply={(threadId, text) => companion.replyFromRadar(threadId, text)} />
  {/if}
  <CompanionFocusCards timer={companion.timer} focus={companion.focus} onopen={open} />
  <CompanionTaskCards tasks={companion.tasks} onopen={open} />

  <section class="island-card focus">
    <h3 class="island-heading">{copy.focus}</h3>
    <CompanionTimer timer={companion.timer} hover={true} onresize={() => {}} />
    <CompanionTools
      timer={companion.timer}
      focus={companion.focus}
      workMinutes={companion.prefs.workMinutes}
      breakMinutes={companion.prefs.breakMinutes}
      bind:history={() => companion.history, (on) => showHistory(on)}
      onstart={() => companion.startTimer()}
    />
  </section>

  {#if companion.media}
    <MediaPill media={companion.media} oncontrol={(action) => companion.pressMediaKey(action)} />
  {/if}

  {#if companion.gauges.length > 0}
    <section class="island-card">
      <h3 class="island-heading">{copy.quotas}</h3>
      <ul class="gauges">
        {#each companion.gauges as gauge (gauge.id)}
          <li class="gauge" data-level={gauge.level} title={gauge.label}>
            <ProviderLogo providerId={gauge.providerId} size={13} />
            <span class="name">{gauge.name}</span>
            <span class="meter" role="img" aria-label={gauge.label}><i style:width="{gauge.used === null ? 0 : 100 - gauge.used}%"></i></span>
            <span class="left">{gauge.used === null ? '–' : `${Math.round(100 - gauge.used)}%`}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .none {
    margin: 0;
    color: var(--island-muted);
  }
  .busy,
  .gauges {
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
    padding: 6px 8px;
    margin: 0 -8px;
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
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-working);
  }
  .lines {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .title,
  .step {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font-weight: 500;
  }
  .project,
  .step,
  .time {
    color: var(--island-muted);
    font-weight: 400;
  }
  .step,
  .time {
    font-size: 12px;
  }
  .time {
    font-variant-numeric: tabular-nums;
  }
  .focus :global([data-testid='companion-tools']) {
    padding: 4px 0 0;
  }
  .gauge {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 120px 38px;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meter {
    height: 5px;
    border-radius: 999px;
    background: var(--island-pill);
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--island-done);
  }
  .gauge[data-level='warning'] .meter i {
    background: var(--island-attention);
  }
  .gauge[data-level='danger'] .meter i {
    background: var(--island-danger);
  }
  .left {
    color: var(--island-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
