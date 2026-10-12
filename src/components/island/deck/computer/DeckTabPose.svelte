<!--
  A computer tab alone, for the captures (`?fake=1&pose=decktab&tab=…`, dev
  bundle only): in a black frame as wide as the deck, over the page, with an
  island context holding just what the tabs read.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { Companion } from '../../../../lib/companion/companion.svelte';
  import { provideView, type ViewContext } from '../../../../lib/island/contract';

  interface Props {
    companion: Companion;
    tab: Component;
  }

  let { companion, tab: Tab }: Props = $props();

  // The tabs read the companion and turn the deck to the chat: the rest stays out of the pose.
  // svelte-ignore state_referenced_locally
  provideView({
    companion,
    core: { client: null, reachable: false },
    island: { size: 'open', tab: 'chat', pinned: false, glow: 'none' },
    attention: () => () => {},
    hold: () => {},
    reveal: async () => {},
    show: () => {}
  } as unknown as ViewContext);
</script>

<div class="backdrop" data-testid="deck-tab-pose">
  <div class="deck">
    <Tab />
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: start center;
    padding-top: 24px;
    background: var(--island-card);
  }
  .deck {
    width: var(--deck-width);
    padding: 12px;
    border-radius: var(--deck-radius);
    background: var(--island-bg);
  }
</style>
