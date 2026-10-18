<!--
  The island's six places, shown while the pill is carried to one
  (`lib/island/move.svelte.ts`): a faint outline of the pill at each, rounded
  away from its edge of the screen, the one the island would go to filled in.
  The window spans the screen meanwhile, so the page is the screen.
-->
<script lang="ts">
  import { ISLAND_PLACES, type IslandPlace } from '../../lib/companion/prefs';
  import { placeParts, placeRect } from '../../lib/island/place';

  interface Props {
    /** The place the island would go to if let go now. */
    over: IslandPlace | null;
    /** The pill's size: each target is one. */
    size: { width: number; height: number };
    radius: number;
  }

  let { over, size, radius }: Props = $props();

  let width = $state(window.innerWidth);
  let height = $state(window.innerHeight);

  const targets = $derived(
    ISLAND_PLACES.map((place) => {
      const rect = placeRect(place, { width, height }, size);
      const corners = placeParts(place).edge === 'bottom' ? `${radius}px ${radius}px 0 0` : `0 0 ${radius}px ${radius}px`;
      return { place, rect, corners };
    })
  );
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<div class="targets island-tokens" aria-hidden="true" data-testid="island-targets">
  {#each targets as { place, rect, corners } (place)}
    <span
      class="target"
      class:over={place === over}
      data-place={place}
      style:left="{rect.x}px"
      style:top="{rect.y}px"
      style:width="{rect.w}px"
      style:height="{rect.h}px"
      style:border-radius={corners}
    ></span>
  {/each}
</div>

<style>
  .targets {
    position: fixed;
    inset: 0;
    pointer-events: none;
    animation: targets-in 160ms ease-out;
  }
  /* A dashed outline on a light veil of the island's black: seen on a dark wallpaper as on a light one. */
  .target {
    position: absolute;
    background: color-mix(in srgb, var(--island-bg) 22%, transparent);
    outline: 1.5px dashed color-mix(in srgb, var(--island-text) 55%, transparent);
    outline-offset: -1.5px;
  }
  /* The place it would go to: the island's black, as it will stand there. */
  .target::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--island-bg);
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--island-text) 80%, transparent);
    opacity: 0;
    transition: opacity 140ms ease;
  }
  .target.over::after {
    opacity: 0.55;
  }
  @keyframes targets-in {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .targets {
      animation: none;
    }
    .target::after {
      transition: none;
    }
  }
</style>
