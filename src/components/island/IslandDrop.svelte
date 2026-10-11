<!--
  A drop beside the island: the timer on its left, the music on its right.
  It is born from the island's edge and taken back into it
  (`lib/island/motion.ts`): the drop slides out from under the island while
  its black twin and a neck hanging from the top of the screen melt into the
  island through the goo filter (`Island.svelte` defines it). The goo layer
  shows only while the drop moves. The music drop wears the cover's colour
  while it plays.
-->
<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import { dripBody, dripGoo } from '../../lib/island/motion';

  interface Props {
    side: 'left' | 'right';
    reduced: boolean;
    /** The drop moved: the page sends its hit areas again. */
    onresize: () => void;
    /** The pointer came on the drop, or left it. */
    onside: (on: boolean) => void;
    /** The music's colour, and whether it plays: a soft glow of it under the drop. */
    tint?: { accent: string | null; playing: boolean };
    children: Snippet;
  }

  let { side, reduced, onresize, onside, tint, children }: Props = $props();

  // Gone under the pointer, the drop does not see it leave.
  onDestroy(() => onside(false));
</script>

<div class="side {side}" class:playing={tint?.playing === true} style:--pill-accent={tint?.accent ?? undefined} role="presentation" onpointerenter={() => onside(true)} onpointerleave={() => onside(false)}>
  <span class="goo" transition:dripGoo|global={{ side, reduced }} aria-hidden="true"><i class="anchor"></i><i class="neck"></i><i class="twin"></i></span>
  <div class="body" transition:dripBody|global={{ side, reduced }} onintroend={onresize} onoutroend={onresize}>
    {#if tint}<span class="tint" aria-hidden="true"></span>{/if}
    {@render children()}
  </div>
</div>

<style>
  .side {
    position: absolute;
    top: 0;
  }
  .side.left {
    right: calc(100% + 8px);
  }
  .side.right {
    left: calc(100% + 8px);
  }
  .body {
    position: relative;
  }
  .left .body {
    transform-origin: right top;
  }
  .right .body {
    transform-origin: left top;
  }
  /* The drops wear the island's shadow, and are born here rather than by their own. */
  .body > :global([data-hit]) {
    box-shadow: var(--island-shadow);
    animation: none;
  }

  /*
   * The goo layer: the island's edge (under the island, 48 px past the drop:
   * `GOO_REACH`), the neck hanging from the top of the screen, and the drop's
   * black twin. `dripGoo` shows and filters it, and writes its numbers.
   */
  .goo {
    position: absolute;
    top: -16px;
    bottom: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .right .goo {
    left: -48px;
    right: 0;
  }
  .left .goo {
    left: 0;
    right: -48px;
    transform: scaleX(-1);
  }
  .goo i {
    position: absolute;
    top: 0;
    background: var(--island-bg);
  }
  .anchor {
    left: 0;
    width: 40px;
    height: 48px;
    border-radius: 0 0 16px 16px;
  }
  .neck {
    left: 34px;
    width: calc(22px + max(0, var(--x, 0)) * 1px);
    height: calc(16px + var(--neck, 0) * 1px);
  }
  .twin {
    left: 48px;
    width: calc(100% - 48px);
    height: 100%;
    border-radius: 0 0 16px 16px;
    transform-origin: 0 16px;
    transform: translateX(calc(var(--x, 0) * 1px)) scale(var(--sx, 1), var(--sy, 1));
  }

  .tint {
    position: absolute;
    inset: 0;
    border-radius: 0 0 16px 16px;
    box-shadow: 0 2px 14px 1px color-mix(in srgb, var(--pill-accent, var(--island-text)) 42%, transparent);
    opacity: 0;
    transition: opacity 400ms ease;
    pointer-events: none;
  }
  .playing .tint {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .tint {
      transition: none;
    }
  }
</style>
