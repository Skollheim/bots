<!--
  The quotas at a glance, in the island's tab bar so they show on every tab:
  the least left across the subscriptions as a small pill (amber under a
  quarter, red under a tenth), and on a click every account with a bar per
  window and when it resets, then the tokens the threads used. The core's
  `quotas.list`, `quotas.updated` and `usage.get` only.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Gauge } from '@lucide/svelte';
  import { useView } from '../../../lib/island/contract';
  import { compactCount, QuotaWatch, resetIn, tokensOf } from '../../../lib/island/quotas.svelte';
  import { fill, strings } from '../../../lib/strings';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const view = useView();
  const copy = strings.island.assistant.quotas;
  const watch = new QuotaWatch();

  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);
  let now = $state(Date.now());

  const top = $derived(watch.tightest);
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

  function resets(at: number | null): string {
    const left = resetIn(at, now);
    return left ? fill(copy.resets, { time: fill(copy.units[left.unit], { value: String(left.value) }) }) : '';
  }
</script>

{#if top}
  <div class="quotas" onkeydown={keys} role="presentation">
    <button
      bind:this={trigger}
      class="pill"
      data-tone={top.bar.tone}
      aria-expanded={open}
      aria-label={fill(copy.label, { percent: String(top.bar.left), name: top.account.name, window: top.bar.label })}
      title={fill(copy.label, { percent: String(top.bar.left), name: top.account.name, window: top.bar.label })}
      data-testid="island-quotas"
      onclick={() => (open = !open)}
    >
      <Gauge size={13} strokeWidth={2} />
      <span>{fill(copy.pill, { percent: String(top.bar.left) })}</span>
    </button>

    {#if open}
      <div bind:this={panel} class="panel" role="dialog" aria-label={copy.title} data-testid="island-quotas-panel">
        <p class="title">{copy.title}</p>
        {#each watch.accounts as account (account.id)}
          <section class="account">
            <p class="name">{account.name}</p>
            {#each account.bars as bar (bar.id)}
              <div class="bar" data-tone={bar.tone}>
                <span class="window">{bar.label}</span>
                <span class="track" role="img" aria-label="{bar.label}: {fill(copy.left, { percent: String(bar.left) })}"><i style:width="{bar.left}%"></i></span>
                <span class="left">{fill(copy.left, { percent: String(bar.left) })}</span>
                {#if bar.resetsAt}<span class="resets">{resets(bar.resetsAt)}</span>{/if}
              </div>
            {/each}
          </section>
        {:else}
          <p class="none">{copy.none}</p>
        {/each}
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
    width: 268px;
    padding: 10px 12px 12px;
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
    grid-template-columns: 58px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 1px;
    font-size: 11.5px;
  }
  .window,
  .resets {
    color: var(--island-muted);
  }
  .resets {
    grid-column: 2 / 4;
    font-size: 11px;
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
  }
  .bar[data-tone='amber'] .left {
    color: var(--island-quota-amber);
  }
  .bar[data-tone='red'] .left {
    color: var(--island-quota-red);
  }
  .none,
  .tokens {
    margin: 0;
    color: var(--island-muted);
    font-size: 11.5px;
  }
</style>
