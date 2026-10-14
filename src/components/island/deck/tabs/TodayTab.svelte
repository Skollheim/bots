<!--
  The deck's today tab. The day leads, on one tile: the time in the hero
  type with the date written out under it, the week beside it (today marked,
  a dot on each day a mission runs, the next mission under it), then the
  day's recap in display numbers with the threads it counts in a quiet list.
  Beside it, the to-do list (`views/TodoCard.svelte`) with a ring counting
  the done ones, and the focus timer: a ring with one main action (start,
  pause or resume), the quick lengths before it starts, reset and the focus
  mode quieter beside it, and the break and focus cards. The clock turns once
  a minute, only while the tab shows.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { CalendarClock, Focus as FocusIcon, Pause, Play, RotateCcw } from '@lucide/svelte';
  import { formatLocale } from '@boite/ui/lib/i18n.svelte';
  import { clockOf, whenText } from '../../../../lib/companion/mission-text';
  import { clock } from '../../../../lib/companion/pomodoro';
  import { todoCount } from '../../../../lib/companion/todo';
  import { useView } from '../../../../lib/island/contract';
  import { dayKey, FOCUS_PRESETS, missionDays, nextMission, timerShare, untilNextMinute, weekOf } from '../../../../lib/island/deck-data';
  import { duration } from '../../../../lib/island/recap.svelte';
  import { fill, strings } from '../../../../lib/strings';
  import CompanionFocusCards from '../../../companion/CompanionFocusCards.svelte';
  import TodoCard from '../../views/TodoCard.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const timer = $derived(companion.timer);
  const copy = strings.island.deck.today;
  const recapCopy = strings.island.assistant.recap;
  const pomodoro = strings.companion.pomodoro;
  /** The ring's radius, in the 100 × 100 box it is drawn in. */
  const RING = 45;
  const ROUND = 2 * Math.PI * RING;
  const TODO_ROUND = 2 * Math.PI * 8;

  // The clock: read now, then again as each minute turns.
  let now = $state(Date.now());
  $effect(() => {
    let wait: ReturnType<typeof setTimeout>;
    const next = () => {
      wait = setTimeout(() => {
        now = Date.now();
        next();
      }, untilNextMinute(Date.now()));
    };
    next();
    return () => clearTimeout(wait);
  });
  const locale = $derived(formatLocale());
  const parts = $derived(new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).formatToParts(now));
  const hours = $derived(parts.find((part) => part.type === 'hour')?.value ?? '');
  const minutes = $derived(parts.find((part) => part.type === 'minute')?.value ?? '');
  const period = $derived(parts.find((part) => part.type === 'dayPeriod')?.value ?? '');
  const date = $derived(new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now));
  const week = $derived(weekOf(new Date(now), locale));

  // The missions: a dot on the days they run, and the next one in a line.
  const missionList = $derived(companion.missions.list);
  const dotted = $derived(missionDays(missionList, week));
  const coming = $derived(nextMission(missionList));
  const comingWhen = $derived(coming ? (dayKey(new Date(coming.due)) === dayKey(new Date(now)) ? clockOf(coming.minutes) : whenText(coming.due)) : '');

  // The to-do list's count, for the ring beside its heading.
  const todoCopy = strings.companion.todo;
  const todos = $derived(companion.todos);
  const todo = $derived(todoCount(todos.items));
  const todoText = $derived({ done: String(todo.done), total: String(todo.total) });

  // The focus timer.
  let chosen = $state<number>(untrack(() => (FOCUS_PRESETS as readonly number[]).includes(companion.prefs.workMinutes) ? companion.prefs.workMinutes : 25));
  const running = $derived(timer.current !== null);
  const counting = $derived(timer.kind === 'stopwatch');
  const share = $derived(timerShare(timer.current, timer.left, timer.elapsed));
  const shown = $derived(running ? (counting ? clock(timer.elapsed, 'down') : clock(timer.left)) : clock(chosen * 60_000));
  const phase = $derived(timer.kind === 'countdown' ? pomodoro.countdown : counting ? pomodoro.stopwatch : timer.phase === 'break' ? pomodoro.rest : pomodoro.work);
  const said = $derived(running ? fill(timer.paused ? pomodoro.paused : counting ? pomodoro.elapsed : pomodoro.left, { phase, time: shown }) : copy.idle);
  const focusTitle = $derived(companion.focus.active ? strings.companion.focus.turnOff : strings.companion.focus.turnOn);

  const start = () => companion.startTimer(chosen * 60_000);
  const open = (threadId: string) => void view.reveal(threadId).catch(() => {});

  // The recap: read as the tab shows, and again when the threads move (at most every half minute).
  const recap = $derived(view.recap.recap);
  $effect(() => {
    void [companion.threads, view.core.client];
    untrack(() => void view.recap.load());
  });
  const worked = $derived.by(() => {
    const { hours: h, minutes: m } = duration(recap.workedMs);
    return h > 0 ? fill(recapCopy.hours, { hours: String(h), minutes: String(m).padStart(2, '0') }) : fill(recapCopy.minutes, { minutes: String(m) });
  });
  const count = $derived(recap.threads.length);
</script>

<div class="today" data-testid="deck-tab-today">
  <DeckTile area="day" testid="deck-clock">
    <div class="hero">
      <div class="clock" role="timer" aria-label={fill(copy.clock, { time: `${hours}:${minutes}${period ? ` ${period}` : ''}`, date })}>
        <p class="time" aria-hidden="true">
          <span>{hours}</span><span class="dots"><i></i><i></i><i></i></span><span>{minutes}</span>
          {#if period}<span class="period">{period}</span>{/if}
        </p>
        <p class="date" aria-hidden="true">{date}</p>
      </div>

      <div class="days" role="group" aria-label={copy.week} data-testid="deck-week">
        <ol class="week">
          {#each week as day (day.key)}
            <li class:today={day.today} aria-current={day.today ? 'date' : undefined}>
              <span class="day">{day.name}</span>
              <span class="number">{day.date}</span>
              <i class="mission" class:on={dotted.has(day.key)} aria-hidden="true"></i>
              {#if dotted.has(day.key)}<span class="unseen">{copy.missionDay}</span>{/if}
            </li>
          {/each}
        </ol>
        {#if coming}
          <p class="next" title={fill(copy.nextMissionLine, { when: comingWhen, prompt: coming.prompt })} data-testid="deck-next-mission">
            <CalendarClock size={13} aria-hidden="true" />
            <span class="label">{copy.nextMission}</span>
            <span class="when">{comingWhen}</span>
            <span class="prompt">{coming.prompt}</span>
          </p>
        {/if}
      </div>
    </div>

    <!-- The day's recap, under the time: the numbers, then the threads they count. -->
    <section class="recap" aria-label={copy.recap} data-testid="island-recap">
      {#if view.recap.loaded && count === 0}
        <p class="none">{copy.none}</p>
      {:else}
        <div class="numbers">
          <p><span class="big">{count}</span><span>{count === 1 ? copy.threadsOne : copy.threadsMany}</span></p>
          <p><span class="big">{recap.files}</span><span>{recap.files === 1 ? copy.filesOne : copy.filesMany}</span></p>
          <p><span class="big">{worked}</span><span>{copy.time}</span></p>
        </div>
        <ul class="lines deck-scroll island-fade">
          {#each recap.threads as line (line.id)}
            <li>
              <button class="row" title={fill(recapCopy.open, { title: line.title })} onclick={() => open(line.id)}>
                <span class="name">{line.title}</span>{#if line.project}<span class="project">{line.project}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </DeckTile>

  <DeckTile area="todo" heading={todoCopy.title} testid="deck-todo">
    {#snippet aside()}
      <span class="todo-aside">
        {#if todo.total > 0}
          <span class="todo-count" role="img" aria-label={fill(todoCopy.countLabel, todoText)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle class="track" cx="10" cy="10" r="8" />
              <circle class="fill" cx="10" cy="10" r="8" stroke-dasharray={TODO_ROUND} stroke-dashoffset={TODO_ROUND * (1 - todo.done / todo.total)} />
            </svg>
            <span aria-hidden="true">{fill(todoCopy.count, todoText)}</span>
          </span>
        {/if}
        {#if todo.done > 0}
          <button class="clear" onclick={() => todos.clearDone()} data-testid="deck-todo-clear">{todoCopy.clearDone}</button>
        {/if}
      </span>
    {/snippet}
    <div class="todo"><TodoCard tile /></div>
  </DeckTile>

  <DeckTile area="timer" heading={copy.focus} testid="deck-timer">
    <div class="timer">
      <div class="ring" role="timer" aria-label={said} class:paused={timer.paused} class:resting={timer.phase === 'break'}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="track" cx="50" cy="50" r={RING} />
          <circle class="fill" cx="50" cy="50" r={RING} stroke-dasharray={ROUND} stroke-dashoffset={ROUND * (1 - share)} />
        </svg>
        <span class="face" aria-hidden="true">
          <span class="left">{shown}</span>
          {#if running}<span class="phase">{phase}</span>{/if}
        </span>
      </div>
      <div class="controls">
        {#if !running}
          <div class="presets" role="group" aria-label={copy.focus}>
            {#each FOCUS_PRESETS as minutes (minutes)}
              <button
                class="preset"
                class:on={chosen === minutes}
                aria-pressed={chosen === minutes}
                aria-label={fill(copy.preset, { minutes: String(minutes) })}
                title={fill(copy.presetTitle, { minutes: String(minutes), rest: String(companion.prefs.breakMinutes) })}
                onclick={() => (chosen = minutes)}
              >
                {minutes}
              </button>
            {/each}
          </div>
        {/if}
        <div class="actions">
          {#if !running}
            <button class="main" onclick={start} data-testid="deck-timer-start"><Play size={13} fill="currentColor" />{pomodoro.start}</button>
          {:else if timer.paused}
            <button class="main" onclick={() => timer.resume()}><Play size={13} fill="currentColor" />{pomodoro.resume}</button>
          {:else}
            <button class="main" onclick={() => timer.pause()}><Pause size={13} fill="currentColor" />{pomodoro.pause}</button>
          {/if}
          {#if running}
            <button class="quiet" aria-label={copy.reset} title={pomodoro.stop[timer.kind ?? 'pomodoro']} onclick={() => timer.stop()}><RotateCcw size={14} /></button>
          {/if}
          <button class="quiet" class:on={companion.focus.active} aria-pressed={companion.focus.active} aria-label={strings.companion.focus.label} title={focusTitle} onclick={() => companion.focus.toggle()}>
            <FocusIcon size={14} />
          </button>
        </div>
      </div>
    </div>
    <CompanionFocusCards {timer} focus={companion.focus} onopen={open} />
  </DeckTile>
</div>

<style>
  .today {
    display: grid;
    grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr);
    grid-template-areas:
      'day todo'
      'day timer';
    gap: var(--deck-gap);
  }
  p {
    margin: 0;
  }
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The tab's hero: the time, large and thin, the date written out, and the week beside them. */
  .hero {
    display: flex;
    align-items: flex-start;
    gap: 24px;
  }
  .clock {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
  }
  .time {
    display: flex;
    align-items: center;
    gap: 0.08em;
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: var(--deck-hero);
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--deck-display-tracking);
    line-height: 0.92;
  }
  /* The three dots of the robots, between the hours and the minutes. */
  .dots {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0.06em;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--deck-accent);
  }
  .period {
    align-self: flex-end;
    margin-left: 0.15em;
    color: var(--island-muted);
    font-size: var(--deck-unit);
    letter-spacing: 0;
  }
  .date {
    color: var(--island-muted);
    font-size: var(--deck-title);
    font-weight: var(--deck-display-weight);
  }
  .date::first-letter {
    text-transform: uppercase;
  }
  .days {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding-top: 4px;
  }
  /* The days stand on the tile, quiet: today alone wears the accent, on its number. */
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .week li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .week .day {
    color: var(--island-muted);
    font-size: var(--deck-small);
  }
  .week .number {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: var(--deck-body);
    font-variant-numeric: tabular-nums;
  }
  .week .today .day {
    color: var(--deck-accent-ink);
  }
  .week .today .number {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-weight: 600;
  }
  .week .mission {
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }
  .week .mission.on {
    background: var(--island-muted);
  }
  .week .today .mission.on {
    background: var(--deck-accent);
  }
  .next {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--island-muted);
    font-size: var(--deck-small);
  }
  .next :global(svg) {
    flex: none;
    color: var(--deck-accent);
  }
  .next .label,
  .next .when {
    flex: none;
  }
  .next .when {
    color: var(--island-text);
    font-variant-numeric: tabular-nums;
  }
  .next .prompt {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
   * The day's recap: the numbers in the display type, the threads a quiet list
   * under them. The list takes whatever height the tile has left (the tile
   * stretches to the column beside it), so no band opens between the time and
   * the numbers; with more threads than room it scrolls, its edges fading.
   */
  .recap {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding-top: 20px;
  }
  .none {
    color: var(--island-muted);
  }
  .numbers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--deck-gap);
  }
  .numbers p {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    color: var(--island-muted);
    font-size: var(--deck-small);
  }
  .big {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: var(--deck-display);
    font-weight: var(--deck-display-weight);
    letter-spacing: var(--deck-display-tracking);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .lines {
    --island-fade-gap: 0px;
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    min-height: 72px;
    margin: 0 -6px;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    height: auto;
    padding: 3px 6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: var(--deck-small);
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--deck-tile-hover);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project {
    flex: none;
    color: var(--island-muted);
  }

  .todo-aside {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .todo-count {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--island-muted);
    font-size: var(--deck-small);
    font-variant-numeric: tabular-nums;
  }
  .todo-count svg {
    width: 16px;
    height: 16px;
    transform: rotate(-90deg);
  }
  .todo-count circle {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }
  .todo-count .fill {
    stroke: var(--island-done);
  }
  .clear {
    height: auto;
    padding: 0 2px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    font-size: var(--deck-small);
    cursor: pointer;
  }
  .clear:hover {
    color: var(--island-text);
  }
  /* The tile's heading says the list's title, count and clearing: the card's own goes. */
  .todo :global(.head) {
    display: none;
  }
  /* Three rows, then it scrolls, with no bar and its edges fading; padded so the rows' wider hover stays inside. */
  .todo :global(section ul) {
    --island-fade-gap: 1px;
    max-height: 82px;
    margin-inline: -6px;
    padding-inline: 6px;
    overflow-x: hidden;
  }

  /* The focus timer: the ring, one main action, the rest quiet. */
  .timer {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .ring {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: 84px;
    height: 84px;
  }
  .ring svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
  }
  .track {
    stroke: var(--deck-field);
  }
  .fill {
    stroke: var(--deck-accent);
  }
  .resting .fill {
    stroke: var(--island-done);
  }
  .paused .fill {
    stroke: var(--island-faint);
  }
  .face {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }
  .left {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: var(--deck-title);
    font-weight: var(--deck-display-weight);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  .phase {
    max-width: 64px;
    overflow: hidden;
    color: var(--island-muted);
    font-size: var(--deck-small);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .presets,
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .preset,
  .main,
  .quiet {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-size: var(--deck-small);
    cursor: pointer;
  }
  /* The lengths read as numbers on the tile, the chosen one lit. */
  .preset {
    min-width: 30px;
    padding: 0 6px;
    background: transparent;
    color: var(--island-muted);
    font-family: var(--deck-numeral-font);
    font-variant-numeric: tabular-nums;
  }
  .preset:hover,
  .quiet:hover {
    background: var(--deck-tile-hover);
    color: var(--island-text);
  }
  .preset.on,
  .quiet.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .main {
    gap: 5px;
    padding: 0 12px;
    background: var(--deck-accent);
    color: var(--island-bg);
    font-weight: 600;
    white-space: nowrap;
  }
  .quiet {
    flex: none;
    width: 28px;
    padding: 0;
    background: transparent;
    color: var(--island-muted);
  }
  .main:active,
  .preset:active,
  .quiet:active {
    transform: scale(0.96);
  }
  .preset:focus-visible,
  .main:focus-visible,
  .quiet:focus-visible,
  .clear:focus-visible,
  .row:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .main:active,
    .preset:active,
    .quiet:active {
      transform: none;
    }
  }
</style>
