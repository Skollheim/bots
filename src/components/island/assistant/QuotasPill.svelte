<!--
  The quotas at a glance, in the island's tab bar so they show on every tab:
  the least left across the subscriptions as a small pill (amber under a
  quarter, red under a tenth), and on a click every account with a bar per
  window, and when it resets, then the tokens the threads used. The core's
  `quotas.list`, `quotas.updated` and `usage.get` only: the list carries the
  subscription proxy's entries too, shown apart and as Settings lets them
  (its "Show quotas" switch and the entries turned off). Every percent is
  what is left, and says so.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Gauge } from '@lucide/svelte';
  import { useView } from '../../../lib/island/contract';
  import { compactCount, QuotaWatch, resetIn, tokensOf, type QuotaAccount } from '../../../lib/island/quotas.svelte';
  import { fill, strings } from '../../../lib/strings';

  /** `compact`: the percent alone, for the deck's tab bar, where room is short. */
  let { open = $bindable(false), compact = false }: { open?: boolean; compact?: boolean } = $props();

  const view = useView();
  const copy = strings.island.assistant.quotas;
  const watch = new QuotaWatch(() => ({ shown: view.companion.prefs.quotas, hidden: view.companion.prefs.hiddenQuotas }));

  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);
  let now = $state(Date.now());

  const top = $derived(watch.tightest);
  const own = $derived(watch.accounts.filter((account) => !account.proxy));
  const proxy = $derived(watch.accounts.filter((account) => account.proxy));
  const tokens = $derived(tokensOf(watch.usage));

  $effect(() => {
    const client = view.core.client;
    if (!client) return;
    return untrack(() => watch.follow(client));
  });

  $effect(() => {
    view.hold('quotas', open);
    if (!open) return;
    now = Date.now();
    const outside = (event: PointerEvent) => {
      if (!panel?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) open = false;
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });
  $effect(() => () => view.hold('quotas', false));

  function keys(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    open = false;
    trigger?.focus();
  }

  /** How long until the window resets, short (`3 h`); empty when unknown. */
  function until(at: number | null): string {
    const left = resetIn(at, now);
    return left ? fill(copy.units[left.unit], { value: String(left.value) }) : '';
  }

  function resets(at: number | null): string {
    const time = until(at);
    return time ? fill(copy.resets, { time }) : '';
  }
</script>

{#snippet accounts(list: QuotaAccount[])}
  {#each list as account (account.id)}
    <section class="account">
      <p class="name">{account.name}</p>
      {#each account.bars as bar (bar.id)}
        {@const said = [fill(copy.left, { percent: String(bar.left) }), resets(bar.resetsAt)].filter(Boolean).join(', ')}
        <div class="bar" data-tone={bar.tone} title={said}>
          <span class="window">{bar.label}</span>
          <span class="track" role="img" aria-label="{bar.label}: {said}"><i style:width="{bar.left}%"></i></span>
          <span class="left" aria-hidden="true">{fill(copy.left, { percent: String(bar.left) })}</span>
          <span class="resets" aria-hidden="true">{until(bar.resetsAt)}</span>
        </div>
      {/each}
    </section>
  {/each}
{/snippet}

{#if top}
  <div class="quotas" onkeydown={keys} role="presentation">
    <button
      bind:this={trigger}
      class="pill"
      class:compact
      data-tone={top.bar.tone}
      aria-expanded={open}
      aria-label={fill(copy.label, { percent: String(top.bar.left), name: top.account.name, window: top.bar.label })}
      title={fill(copy.label, { percent: String(top.bar.left), name: top.account.name, window: top.bar.label })}
      data-testid="island-quotas"
      onclick={() => (open = !open)}
    >
      {#if !compact}<Gauge size={13} strokeWidth={2} />{/if}
      <span>{fill(copy.left, { percent: String(top.bar.left) })}</span>
    </button>

    {#if open}
      <div bind:this={panel} class="panel" role="dialog" aria-label={copy.title} data-testid="island-quotas-panel">
        <p class="title">{copy.title}</p>
        {@render accounts(own)}
        {#if proxy.length > 0}
          <p class="title">{copy.proxy}</p>
          {@render accounts(proxy)}
        {/if}
        {#if tokens > 0}<p class="tokens">{fill(copy.tokens, { count: compactCount(tokens) })}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .quotas {
    position: relative;
    display: flex;
    align-items: center;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    background: none;
    color: var(--island-quota-ok);
    font: inherit;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .pill.compact {
    padding: 0 8px;
  }
  .pill:hover,
  .pill[aria-expanded='true'] {
    border-color: var(--island-line-strong);
  }
  .pill[data-tone='amber'] {
    border-color: color-mix(in srgb, var(--island-quota-amber) 45%, transparent);
    color: var(--island-quota-amber);
  }
  .pill[data-tone='red'] {
    border-color: color-mix(in srgb, var(--island-quota-red) 45%, transparent);
    color: var(--island-quota-red);
  }
  .panel {
    position: absolute;
    z-index: 6;
    top: calc(100% + 6px);
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 300px;
    max-height: 270px;
    padding: 10px 12px 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    border: 1px solid var(--island-line-strong);
    border-radius: 14px;
    background: var(--island-menu);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
    text-align: left;
  }
  .title {
    margin: 0;
    color: var(--island-faint);
    font-size: 11px;
    font-weight: 600;
  }
  .account {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .name {
    margin: 0;
    overflow: hidden;
    color: var(--island-text);
    font-size: 12.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto 32px;
    align-items: center;
    column-gap: 8px;
    font-size: 11.5px;
  }
  .window,
  .resets {
    overflow: hidden;
    color: var(--island-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resets {
    font-size: 11px;
    text-align: right;
  }
  .track {
    height: 5px;
    border-radius: 999px;
    background: var(--island-quota-track);
    overflow: hidden;
  }
  .track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--island-quota-ok);
  }
  .bar[data-tone='amber'] .track i {
    background: var(--island-quota-amber);
  }
  .bar[data-tone='red'] .track i {
    background: var(--island-quota-red);
  }
  .left {
    color: var(--island-text);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .bar[data-tone='amber'] .left {
    color: var(--island-quota-amber);
  }
  .bar[data-tone='red'] .left {
    color: var(--island-quota-red);
  }
  .tokens {
    margin: 0;
    color: var(--island-muted);
    font-size: 11.5px;
  }
</style>
