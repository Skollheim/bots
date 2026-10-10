<!--
  The music bubble's meter (`lib/companion/music.svelte.ts`): bars from the
  newest level in the middle to the older ones at both ends, so it pulses from
  its centre with the music. Each bar is scaled, never laid out again; paused,
  the bars rest as dots.
-->
<script lang="ts">
  import { mirrored } from '../../../lib/companion/music';

  interface Props {
    /** Newest first, 0 to 1. */
    levels: readonly number[];
    count: number;
    playing: boolean;
    /** How tall the bars stand at the loudest, in pixels. */
    height: number;
  }

  let { levels, count, playing, height }: Props = $props();

  /** The smallest a bar gets while the music plays: a dot, never nothing. */
  const REST = 0.16;
  const bars = $derived(playing ? mirrored(levels, count).map((level) => REST + (1 - REST) * level) : Array<number>(count).fill(REST));
</script>

<span class="meter" class:paused={!playing} style:height="{height}px" aria-hidden="true">
  {#each bars as scale, index (index)}<i style:transform="scaleY({scale.toFixed(3)})"></i>{/each}
</span>

<style>
  .meter {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }
  i {
    width: 3px;
    height: 100%;
    border-radius: 2px;
    background: var(--music-accent, var(--island-text));
  }
  .paused i {
    opacity: 0.45;
  }
</style>
