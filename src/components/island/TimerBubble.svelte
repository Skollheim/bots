<!--
  The timer's drop, on the island's left while the island is not open: a ring
  that empties with the phase and the time left (or the time so far, for a
  stopwatch). Under the pointer or the keyboard it shows what the timer is for
  and its controls: pause or resume, skip the break, stop. Hidden without a
  timer; Home shows the same timer once the island opens. While the pill's
  line tells the timer (`compact`), the drop keeps the ring and leaves the
  time to the line, so it is not read twice.
-->
<script lang="ts">
  import { Pause, Play, SkipForward, Square } from '@lucide/svelte';
  import type { PomodoroTimer } from '../../lib/companion/focus.svelte';
  import { clock } from '../../lib/companion/pomodoro';
  import { inShell } from '../../lib/companion/shell';
  import { fill, strings } from '../../lib/strings';

  interface Props {
    timer: PomodoroTimer;
    /** The shell's word that the pointer is on the island's window. */
    hover: boolean;
    /** The pill's line tells the time: the ring alone. */
    compact?: boolean;
    /** The drop changed size, for the page to send its hit areas again. */
    onresize: () => void;
  }

  let { timer, hover, compact = false, onresize }: Props = $props();

  const copy = strings.companion.pomodoro;
  const RING = 2 * Math.PI * 6;
  const LEAVE_MS = 300;

  let pointer = $state(false);
  let keyboard = $state(false);
  const open = $derived(pointer || keyboard);
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(leaveTimer));

  // A click-through window does not see the pointer go: the shell's word wins.
  $effect(() => {
    if (inShell() && !hover) pointer = false;
  });

  const kind = $derived(timer.kind ?? 'pomodoro');
  const resting = $derived(timer.phase === 'break');
  const counting = $derived(kind === 'stopwatch');
  const phaseName = $derived(kind === 'countdown' ? copy.countdown : counting ? copy.stopwatch : resting ? copy.rest : copy.work);
  const time = $derived(counting ? clock(timer.elapsed, 'down') : clock(timer.left));
  const said = $derived(fill(timer.paused ? copy.paused : counting ? copy.elapsed : copy.left, { phase: phaseName, time }));
  /** What is left of the phase, 1 to 0; a stopwatch goes round once a minute. */
  const share = $derived.by(() => {
    const current = timer.current;
    if (!current) return 0;
    if (counting) return 1 - (timer.elapsed % 60_000) / 60_000;
    const whole = resting ? current.breakMs : current.workMs;
    return whole > 0 ? Math.max(0, Math.min(1, timer.left / whole)) : 0;
  });
  const label = $derived(timer.current?.label && !resting ? timer.current.label : phaseName);

  $effect(() => {
    void [open, compact, timer.current === null];
    const read = setTimeout(onresize);
    return () => clearTimeout(read);
  });
</script>

{#if timer.current}
  <div
    class="drop"
    class:open
    class:compact
    class:resting
    class:paused={timer.paused}
    data-hit
    data-testid="island-timer"
    role="timer"
    aria-label={said}
    onpointerenter={() => {
      clearTimeout(leaveTimer);
      pointer = true;
    }}
    onpointerleave={() => {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => (pointer = false), LEAVE_MS);
    }}
    onfocusin={(event) => (keyboard = (event.target as HTMLElement).matches(':focus-visible'))}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) keyboard = false;
    }}
    ontransitionend={(event) => {
      if (event.target === event.currentTarget) onresize();
    }}
  >
    <div class="line">
      <svg class="ring" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" class="track" />
        <circle cx="8" cy="8" r="6" class="left" stroke-dasharray={RING.toFixed(2)} stroke-dashoffset={(RING * (1 - share)).toFixed(2)} />
      </svg>
      {#if !compact}<span class="time" aria-hidden="true">{time}</span>{/if}
    </div>
    {#if open}
      <div class="more">
        <span class="label" title={label}>{label}</span>
        <span class="controls">
          {#if timer.paused}
            <button aria-label={copy.resume} title={copy.resume} onclick={() => timer.resume()} data-testid="island-timer-resume"><Play size={12} fill="currentColor" /></button>
          {:else}
            <button aria-label={copy.pause} title={copy.pause} onclick={() => timer.pause()} data-testid="island-timer-pause"><Pause size={12} fill="currentColor" /></button>
          {/if}
          {#if resting}
            <button aria-label={copy.skipBreak} title={copy.skipBreak} onclick={() => timer.skip()}><SkipForward size={12} fill="currentColor" /></button>
          {/if}
          <button aria-label={copy.stop[kind]} title={copy.stop[kind]} onclick={() => timer.stop()} data-testid="island-timer-stop"><Square size={10} fill="currentColor" /></button>
        </span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .drop {
    --tone: var(--island-attention);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 76px;
    max-width: 200px;
    border-radius: 0 0 16px 16px;
    background: var(--island-bg);
    color: var(--island-text);
  }
  .resting {
    --tone: var(--island-done);
  }
  .drop.open {
    border-radius: 0 0 18px 18px;
  }
  /* The ring alone: the pill's line tells the time. */
  .drop.compact:not(.open) {
    min-width: 0;
  }
  .compact .line {
    padding: 0 10px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 12px 0 10px;
  }
  .ring {
    width: 16px;
    height: 16px;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 2.4;
  }
  .ring .track {
    stroke: rgb(255 255 255 / 0.14);
  }
  .ring .left {
    stroke: var(--tone);
    stroke-linecap: round;
  }
  .time {
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .paused .time,
  .paused .ring .left {
    opacity: 0.5;
  }
  .more {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 8px 8px 12px;
    animation: appear 180ms ease-out;
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--island-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    display: flex;
    gap: 2px;
  }
  .controls button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--island-pill);
    color: var(--island-text);
    cursor: pointer;
    transition: scale 90ms ease-out;
  }
  .controls button:hover {
    background: var(--island-card-hover);
  }
  .controls button:active {
    scale: 0.96;
  }
  .controls button:focus-visible {
    outline: 2px solid var(--tone);
    outline-offset: 1px;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .more {
      animation: none;
    }
    .controls button {
      transition: none;
    }
    .controls button:active {
      scale: none;
    }
  }
</style>
