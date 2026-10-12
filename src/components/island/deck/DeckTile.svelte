<!--
  One tile of the deck's bento: a dark rounded box, its heading in small
  muted type, and what it shows. `area` places it in the tab's grid; a long
  list scrolls inside it (`scroll`). Cards drawn for the island elsewhere lose
  their own box inside a tile: the tile is the box.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    heading?: string;
    /** The tab grid's area for it. */
    area?: string;
    /** Its content scrolls inside it past its height. */
    scroll?: boolean;
    testid?: string;
    /** Beside the heading, on its right. */
    aside?: Snippet;
    children: Snippet;
  }

  let { heading, area, scroll = false, testid, aside, children }: Props = $props();
</script>

<section class="tile" class:scroll style:grid-area={area} data-testid={testid}>
  {#if heading}
    <header>
      <h3>{heading}</h3>
      {@render aside?.()}
    </header>
  {/if}
  <div class="content">{@render children()}</div>
</section>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    padding: var(--deck-tile-pad);
    border-radius: var(--deck-tile-radius);
    background: var(--deck-tile);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 18px;
  }
  h3 {
    margin: 0;
    color: var(--island-muted);
    font-size: 13px;
    font-weight: 600;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
  }
  .scroll .content {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  /* The island's cards, drawn inside a tile: the tile is their box. */
  .content :global(.island-card) {
    padding: 0;
    border: none;
    background: none;
  }
</style>
