<!--
  Home's update card: a newer Boite is out on its track (`lib/island/
  update.svelte.ts`). Open Boite brings its window forward, where its app
  update settings install it; Later sets this version aside.
-->
<script lang="ts">
  import { Sparkles } from '@lucide/svelte';
  import { showMain } from '../../../lib/companion/shell';
  import { useView } from '../../../lib/island/contract';
  import { fill, strings } from '../../../lib/strings';

  const view = useView();
  const update = $derived(view.update);
  const offer = $derived(update.offer);
  const copy = strings.island.update;
</script>

{#if offer}
  <section class="island-card update" data-testid="island-update">
    <span class="icon" aria-hidden="true"><Sparkles size={14} strokeWidth={2} /></span>
    <div class="text">
      <p class="title">{copy.title[offer.track]}</p>
      <p class="version">{fill(copy.version, { version: offer.version })}</p>
    </div>
    <button class="button ghost" onclick={() => update.dismiss()} data-testid="update-later">{copy.later}</button>
    <button class="button primary" title={copy.openTitle} onclick={() => void showMain(null).catch(() => {})} data-testid="update-open">{copy.open}</button>
  </section>
{/if}

<style>
  .update {
    display: flex;
    align-items: center;
    gap: 10px;
    border-color: color-mix(in srgb, var(--island-talking) 35%, transparent);
    background: linear-gradient(90deg, color-mix(in srgb, var(--island-talking) 12%, transparent), transparent 70%), var(--island-card);
  }
  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--island-talking) 18%, transparent);
    color: var(--island-talking);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font-weight: 600;
  }
  .version {
    color: var(--island-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .button {
    flex: none;
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .button:hover {
    background: var(--island-pill);
  }
  .button.primary {
    border-color: transparent;
    background: var(--island-talking);
    color: #fff;
  }
  .button.primary:hover {
    background: var(--island-talking);
    filter: brightness(1.1);
  }
  .button:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
</style>
