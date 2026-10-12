<!--
  One tile of the computer tabs: a dark rounded box, its heading in small
  muted type with what goes beside it, and what it shows. A long list
  scrolls inside it (`scroll`), never the whole deck. The deck shell has its
  own `DeckTile` with the same look; this one keeps the computer tabs apart
  from it until both land.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    heading?: string;
    /** The tab grid's area for it. */
    area?: string;
    scroll?: boolean;
    testid?: string;
    aside?: Snippet;
    children: Snippet;
  }

  let { heading, area, scroll = false, testid, aside, children }: Props = $props();
</script>

<section class="tile" class:scroll style:grid-area={area} data-testid={testid}>
  {#if heading || aside}
    <header>
      {#if heading}<h3>{heading}</h3>{/if}
      {@render aside?.()}
    </header>
  {/if}
  <div class="content">{@render children()}</div>
</section>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    min-height: 22px;
  }
  h3 {
    margin: 0;
    overflow: hidden;
    color: var(--island-muted);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .scroll .content {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
</style>
