<!--
  Settings, the island's place: a small screen with its taskbar and the six
  places drawn where they are, the chosen one filled. One radio group: the
  arrows move across and between the rows, as on the screen.
-->
<script lang="ts">
  import InfoTip from '@boite/ui/components/InfoTip.svelte';
  import { ISLAND_PLACES, type IslandPlace, type IslandSide } from '../../../lib/companion/prefs';
  import { placeOf, placeParts } from '../../../lib/island/place';

  interface Props {
    label: string;
    hint: string;
    names: Record<IslandPlace, string>;
    current: IslandPlace;
    onpick: (place: IslandPlace) => void;
  }

  let { label, hint, names, current, onpick }: Props = $props();

  const SIDES: IslandSide[] = ['left', 'center', 'right'];

  function step(event: KeyboardEvent, place: IslandPlace): void {
    let { edge, side } = placeParts(place);
    const column = SIDES.indexOf(side);
    if (event.key === 'ArrowLeft') side = SIDES[Math.max(0, column - 1)] ?? side;
    else if (event.key === 'ArrowRight') side = SIDES[Math.min(SIDES.length - 1, column + 1)] ?? side;
    else if (event.key === 'ArrowUp') edge = 'top';
    else if (event.key === 'ArrowDown') edge = 'bottom';
    else if (event.key === 'Home') side = 'left';
    else if (event.key === 'End') side = 'right';
    else return;
    event.preventDefault();
    const next = placeOf(edge, side);
    if (next === place) return;
    onpick(next);
    const group = (event.currentTarget as HTMLElement).parentElement;
    group?.querySelector<HTMLElement>(`[data-place='${next}']`)?.focus();
  }
</script>

<div class="row">
  <span class="text ui-label-box"><span class="ui-label">{label}</span><InfoTip topic={label} text={hint} /></span>
  <div class="pick">
    <div class="screen" role="radiogroup" aria-label={label} data-testid="companion-island-place">
      {#each ISLAND_PLACES as place (place)}
        {@const { edge, side } = placeParts(place)}
        <button
          type="button"
          role="radio"
          class="slot {edge} {side}"
          aria-checked={current === place}
          aria-label={names[place]}
          title={names[place]}
          tabindex={current === place ? 0 : -1}
          onclick={() => onpick(place)}
          onkeydown={(event) => step(event, place)}
          data-place={place}
          data-testid={`companion-island-place-${place}`}><span class="pill"></span></button
        >
      {/each}
      <span class="taskbar" aria-hidden="true"></span>
    </div>
    <span class="current ui-label" aria-hidden="true">{names[current]}</span>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
  }
  .pick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  /* The screen: the island's black, its taskbar a strip at the bottom; each place a third of a row. */
  .screen {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 1fr;
    width: 156px;
    height: 92px;
    padding: 0 4px 10px;
    border: 1px solid color-mix(in srgb, var(--island-text) 22%, transparent);
    border-radius: 8px;
    background: var(--island-bg);
    overflow: hidden;
  }
  .taskbar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 10px;
    background: color-mix(in srgb, var(--island-text) 16%, transparent);
  }
  .slot {
    display: flex;
    justify-content: center;
    min-height: 0;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    box-shadow: none;
    cursor: pointer;
  }
  .slot.top {
    align-items: flex-start;
  }
  .slot.bottom {
    align-items: flex-end;
  }
  .slot.left {
    justify-content: flex-start;
  }
  .slot.right {
    justify-content: flex-end;
  }
  /* A place is a pill against its edge: outlined, filled with the accent once chosen. */
  .pill {
    width: 34px;
    height: 10px;
    border: 1px dashed var(--island-muted);
    border-radius: 0 0 5px 5px;
    transition:
      background-color 140ms ease,
      border-color 140ms ease;
  }
  .slot.top .pill {
    border-top: none;
  }
  .slot.bottom .pill {
    border-bottom: none;
    border-radius: 5px 5px 0 0;
  }
  .slot:hover .pill {
    border-color: var(--island-text);
  }
  .slot[aria-checked='true'] .pill {
    border: 1px solid var(--deck-accent);
    background: var(--deck-accent);
  }
  .slot:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  .current {
    color: var(--island-muted);
    font-size: var(--text-sm);
  }
  @media (prefers-reduced-motion: reduce) {
    .pill {
      transition: none;
    }
  }
</style>
