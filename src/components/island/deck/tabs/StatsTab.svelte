<!--
  The deck's stats tab, from what Bots already reads. The quotas first, the
  whole width: what is left where the work can still go beside the heading
  (as the pill reads it), then a row per subscription, its windows side by
  side in columns, tightest first, each with what is left and when it resets
  (the core's quotas, as Settings lets them show); a subscription with
  nothing left fades. Under them, the day's agents in big numbers (the
  threads finished, the files changed, their time and the tokens), and the
  memory the agents hold against their budget, as a gauge.
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
  /** The rows share their columns: as many as the subscription with the most windows. */
  const columns = $derived(Math.max(1, ...watch.accounts.map((account) => account.bars.length)));
  const room = $derived(watch.headroom);

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
  {#if watch.read}
    <DeckTile heading={copy.quotas} area="quotas" testid={watch.accounts.length > 0 ? 'deck-quotas' : 'deck-quota-none'}>
      {#snippet aside()}
        {#if room}
          <p class="room" data-tone={room.bar.tone} data-testid="deck-quota-room">{fill(copy.room, { percent: String(room.bar.left), name: room.account.name })}</p>
        {/if}
      {/snippet}
      {#if watch.accounts.length > 0}
        <ul class="accounts" style:--columns={columns}>
          {#each watch.accounts as account (account.id)}
            <li class="account" class:spent={account.left === 0} data-testid="deck-quota">
              <p class="who">
                <span class="name" title={account.name}>{account.name}</span>
                <span class="provider">{account.proxy ? `${account.provider} · ${quotas.proxy}` : account.provider}</span>
              </p>
              {#each account.bars as bar (bar.id)}
                <div class="window" data-tone={bar.tone}>
                  <p class="head"><span class="label" title={bar.label}>{bar.label}</span><span class="left">{fill(copy.percent, { percent: String(bar.left) })}</span></p>
                  <span class="bar" aria-hidden="true"><i style:width="{bar.left}%"></i></span>
                  <p class="resets">{until(bar.resetsAt)}</p>
                </div>
              {/each}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="quiet">{copy.noQuotas}</p>
      {/if}
    </DeckTile>
  {/if}

  <DeckTile heading={copy.day} area="day" testid="deck-day">
    <div class="numbers">
      <p><span class="big">{count}</span><span>{count === 1 ? today.threadsOne : today.threadsMany}</span></p>
      <p><span class="big">{recap.files}</span><span>{recap.files === 1 ? today.filesOne : today.filesMany}</span></p>
      <p><span class="big">{worked}</span><span>{today.time}</span></p>
      {#if tokens > 0}<p><span class="big">{compactCount(tokens)}</span><span>{copy.tokens}</span></p>{/if}
    </div>
  </DeckTile>

  <DeckTile heading={copy.memory} area="memory" testid="deck-memory">
    {#if gauge}
      <div class="memory" data-tone={gauge.tone}>
        <p class="used"><span class="big">{size(gauge.used)}</span><span>{copy.used}</span></p>
        <span class="bar" role="img" aria-label="{size(gauge.used)} {copy.used}{gauge.budget !== null ? `, ${fill(copy.of, { budget: size(gauge.budget) })}` : ''}">
          <i style:width="{(gauge.share ?? 0) * 100}%"></i>
        </span>
        <p class="quiet">
          {gauge.budget !== null ? fill(copy.of, { budget: size(gauge.budget) }) : copy.noBudget}{#if gauge.available !== null}{` · ${fill(copy.free, { size: size(gauge.available) })}`}{/if}
        </p>
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
    grid-template-areas:
      'quotas quotas quotas'
      'day day memory';
    gap: var(--deck-gap);
  }
  p {
    margin: 0;
  }
  [data-tone] {
    --tone: var(--island-quota-ok);
  }
  [data-tone='amber'] {
    --tone: var(--island-quota-amber);
  }
  [data-tone='red'] {
    --tone: var(--island-quota-red);
  }
  .room {
    color: var(--tone);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .accounts {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .account {
    display: grid;
    grid-template-columns: minmax(0, 190px) repeat(var(--columns), minmax(0, 1fr));
    align-items: center;
    gap: 18px;
    padding: 9px 0;
    transition: opacity 160ms ease;
  }
  .account + .account {
    border-top: 1px solid var(--island-line);
  }
  .account:first-child {
    padding-top: 2px;
  }
  .account:last-child {
    padding-bottom: 0;
  }
  .spent {
    opacity: 0.55;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    color: var(--island-text);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider {
    overflow: hidden;
    color: var(--island-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .window {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
  }
  .label {
    min-width: 0;
    overflow: hidden;
    color: var(--island-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .left {
    flex: none;
    color: var(--tone);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    display: block;
    height: 5px;
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
  .resets {
    min-height: 14px;
    color: var(--island-muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .quiet {
    color: var(--island-muted);
    font-size: 12px;
  }
  .numbers {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
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
    min-width: 0;
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
    height: 8px;
  }
</style>
