<!--
  The deck's stats tab, from what Bots already reads: a tile per
  subscription with a ring for its tightest window and a bar for each
  window, what is left and when it resets (the core's quotas, as the bar's
  pill reads them, and as Settings lets them show); the day's agents in big
  numbers (the threads finished, the files changed, their time and the
  tokens); and the memory the agents hold against their budget, as a gauge.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useView } from '../../../../lib/island/contract';
  import { memoryGauge, sizeText } from '../../../../lib/island/pressure';
  import { compactCount, QuotaWatch, resetIn, tokensOf } from '../../../../lib/island/quotas.svelte';
  import { duration } from '../../../../lib/island/recap.svelte';
  import { fill, strings } from '../../../../lib/strings';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.deck.stats;
  const today = strings.island.deck.today;
  const quotas = strings.island.assistant.quotas;
  const recapCopy = strings.island.assistant.recap;
  const units = strings.island.memory;
  /** The rings' radius, in the 100 × 100 box they are drawn in. */
  const RING = 42;
  const ROUND = 2 * Math.PI * RING;

  const watch = new QuotaWatch(() => ({ shown: view.companion.prefs.quotas, hidden: view.companion.prefs.hiddenQuotas }));
  $effect(() => {
    const client = view.core.client;
    if (!client) return;
    return untrack(() => watch.follow(client));
  });
  // The resets count from when the tab shows; the quotas' own updates carry them on.
  const now = $derived.by(() => {
    void watch.rows;
    return Date.now();
  });

  function until(at: number | null): string {
    const left = resetIn(at, now);
    return left ? fill(copy.resets, { time: fill(quotas.units[left.unit], { value: String(left.value) }) }) : '';
  }

  const recap = $derived(view.recap.recap);
  $effect(() => {
    void [companion.threads, view.core.client];
    untrack(() => void view.recap.load());
  });
  const worked = $derived.by(() => {
    const { hours, minutes } = duration(recap.workedMs);
    return hours > 0 ? fill(recapCopy.hours, { hours: String(hours), minutes: String(minutes).padStart(2, '0') }) : fill(recapCopy.minutes, { minutes: String(minutes) });
  });
  const tokens = $derived(tokensOf(watch.usage));
  const count = $derived(recap.threads.length);

  const status = $derived(view.memory.status);
  const gauge = $derived(status ? memoryGauge(status) : null);
  const size = (bytes: number) => sizeText(bytes, units);
</script>

<div class="stats" data-testid="deck-tab-stats">
  {#each watch.accounts as account (account.id)}
    {@const said = fill(quotas.left, { percent: String(account.left) })}
    <DeckTile heading={account.name} testid="deck-quota">
      <div class="account">
        <div class="ring" data-tone={account.tone} role="img" aria-label="{account.name}: {said}">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="track" cx="50" cy="50" r={RING} />
            <circle class="fill" cx="50" cy="50" r={RING} stroke-dasharray={ROUND} stroke-dashoffset={ROUND * (1 - account.left / 100)} />
          </svg>
          <span class="percent" aria-hidden="true">{account.left}<small>%</small></span>
        </div>
        <ul class="windows">
          {#each account.bars as bar (bar.id)}
            <li data-tone={bar.tone}>
              <p class="window"><span>{bar.label}</span><span class="left">{fill(quotas.left, { percent: String(bar.left) })}</span></p>
              <span class="bar" aria-hidden="true"><i style:width="{bar.left}%"></i></span>
              {#if bar.resetsAt}<p class="resets">{until(bar.resetsAt)}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    </DeckTile>
  {:else}
    {#if watch.read}
      <DeckTile heading={copy.quotas} testid="deck-quota-none">
        <p class="quiet">{copy.noQuotas}</p>
      </DeckTile>
    {/if}
  {/each}

  <DeckTile heading={copy.day} testid="deck-day">
    <div class="numbers">
      <p><span class="big">{count}</span><span>{count === 1 ? today.threadsOne : today.threadsMany}</span></p>
      <p><span class="big">{recap.files}</span><span>{recap.files === 1 ? today.filesOne : today.filesMany}</span></p>
      <p><span class="big">{worked}</span><span>{today.time}</span></p>
      {#if tokens > 0}<p><span class="big">{compactCount(tokens)}</span><span>{copy.tokens}</span></p>{/if}
    </div>
  </DeckTile>

  <DeckTile heading={copy.memory} testid="deck-memory">
    {#if gauge}
      <div class="memory" data-tone={gauge.tone}>
        <p class="used"><span class="big">{size(gauge.used)}</span><span>{copy.used}</span></p>
        <span class="bar" role="img" aria-label="{size(gauge.used)} {copy.used}{gauge.budget !== null ? `, ${fill(copy.of, { budget: size(gauge.budget) })}` : ''}">
          <i style:width="{(gauge.share ?? 0) * 100}%"></i>
        </span>
        <p class="quiet">{gauge.budget !== null ? fill(copy.of, { budget: size(gauge.budget) }) : copy.noBudget}</p>
        {#if gauge.available !== null}<p class="quiet">{fill(copy.free, { size: size(gauge.available) })}</p>{/if}
      </div>
    {:else}
      <p class="quiet">{copy.memoryWaiting}</p>
    {/if}
  </DeckTile>
</div>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--deck-gap);
    align-items: start;
  }
  p {
    margin: 0;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ring {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    --tone: var(--island-quota-ok);
  }
  [data-tone='amber'] {
    --tone: var(--island-quota-amber);
  }
  [data-tone='red'] {
    --tone: var(--island-quota-red);
  }
  .ring svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .track {
    stroke: var(--deck-field);
  }
  .fill {
    stroke: var(--tone);
  }
  .percent {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .percent small {
    color: var(--island-muted);
    font-size: 12px;
  }
  .windows {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .windows li {
    --tone: var(--island-quota-ok);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .windows li[data-tone='amber'] {
    --tone: var(--island-quota-amber);
  }
  .windows li[data-tone='red'] {
    --tone: var(--island-quota-red);
  }
  .window {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    color: var(--island-text);
    font-size: 12.5px;
  }
  .window span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .left {
    flex: none;
    color: var(--tone);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: block;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--deck-field);
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--tone, var(--deck-accent));
  }
  .resets,
  .quiet {
    color: var(--island-muted);
    font-size: 12px;
  }
  .numbers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .numbers p,
  .used {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--island-muted);
    font-size: 12px;
  }
  .numbers p {
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--deck-field);
  }
  .big {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .memory {
    --tone: var(--deck-accent);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .memory[data-tone='amber'] {
    --tone: var(--island-quota-amber);
  }
  .memory[data-tone='red'] {
    --tone: var(--island-quota-red);
  }
  .memory .bar {
    height: 10px;
  }
</style>
