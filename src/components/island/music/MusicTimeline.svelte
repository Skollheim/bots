<!--
  The player's timeline: the track's progress and its two times. Where the
  player takes it (`seekable`), a click or a drag along the bar moves the
  track: the bar and the time follow the pointer, and the track moves once
  it lets go. The arrow keys move it 5 seconds, Page Up and Page Down 20.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { trackTime } from '../../../lib/companion/media';
  import { fill, strings } from '../../../lib/strings';

  interface Props {
    /** Where the track is, and how long it lasts, in milliseconds. */
    position: number;
    duration: number;
    seekable: boolean;
    onseek: (position: number) => void;
  }

  let { position, duration, seekable, onseek }: Props = $props();

  const copy = strings.companion.media;
  const STEP_MS = 5000;
  const PAGE_MS = 20_000;

  let bar = $state<HTMLElement>();
  /** Where a drag holds the track, until the pointer lets go. */
  let scrub = $state<number | null>(null);
  const shown = $derived(scrub ?? position);
  const progress = $derived(duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0);
  const label = $derived(fill(copy.position, { position: trackTime(shown), duration: trackTime(duration) }));

  function at(event: PointerEvent): number {
    const box = bar?.getBoundingClientRect();
    if (!box || box.width <= 0) return shown;
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration;
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    scrub = at(event);
  }

  function move(event: PointerEvent) {
    if (scrub !== null) scrub = at(event);
  }

  function release() {
    if (scrub === null) return;
    const to = scrub;
    scrub = null;
    onseek(to);
  }

  function key(event: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -STEP_MS, ArrowDown: -STEP_MS, ArrowRight: STEP_MS, ArrowUp: STEP_MS, PageDown: -PAGE_MS, PageUp: PAGE_MS };
    let to: number;
    if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = duration;
    else if (event.key in moves) to = position + moves[event.key]!;
    else return;
    event.preventDefault();
    onseek(Math.min(duration, Math.max(0, to)));
  }

  // A bubble that folds under a drag (the pointer left it) moves the track where the drag was.
  $effect(() => () => untrack(release));
</script>

{#if seekable}
  <div class="time" class:scrubbing={scrub !== null}>
    <span
      class="hit"
      role="slider"
      tabindex="0"
      aria-label={copy.seek}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration / 1000)}
      aria-valuenow={Math.round(shown / 1000)}
      aria-valuetext={label}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={release}
      onlostpointercapture={release}
      onkeydown={key}
      data-testid="island-music-seek"
    >
      <span class="track" bind:this={bar}><i style:transform="scaleX({progress.toFixed(4)})"></i></span>
      <span class="knob" style:left="{(progress * 100).toFixed(2)}%"></span>
    </span>
    <span class="clock" aria-hidden="true"><span>{trackTime(shown)}</span><span>{trackTime(duration)}</span></span>
  </div>
{:else}
  <div class="time" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(duration / 1000)} aria-valuenow={Math.round(shown / 1000)}>
    <span class="track"><i style:transform="scaleX({progress.toFixed(4)})"></i></span>
    <span class="clock" aria-hidden="true"><span>{trackTime(shown)}</span><span>{trackTime(duration)}</span></span>
  </div>
{/if}

<style>
  .time {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .hit {
    position: relative;
    display: block;
    margin: -5px 0;
    padding: 5px 0;
    border-radius: 4px;
    cursor: pointer;
    touch-action: none;
  }
  .hit:focus-visible {
    outline: none;
  }
  /* Around the bar only: the times below stay readable. */
  .hit:focus-visible .track {
    outline: 2px solid var(--music-accent);
    outline-offset: 2px;
  }
  .track {
    display: block;
    height: 3px;
    overflow: hidden;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.12);
  }
  .track i {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--music-accent);
    transform-origin: left;
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--island-text);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--music-accent) 45%, transparent);
    pointer-events: none;
    transform: translate(-50%, -50%) scale(0);
    transition: transform 140ms ease;
  }
  .hit:hover .knob,
  .hit:focus-visible .knob,
  .scrubbing .knob {
    transform: translate(-50%, -50%) scale(1);
  }
  .clock {
    display: flex;
    justify-content: space-between;
    color: var(--island-muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    line-height: 12px;
  }
  .scrubbing .clock span:first-child {
    color: var(--island-text);
  }
  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
  }
</style>
