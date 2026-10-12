<!--
  The deck's today tab: a big clock with the date, the week with today
  marked, a dot on each day a mission runs and the next mission under it, the
  to-do list (`views/TodoCard.svelte`) with a ring counting the done ones, the
  focus timer (a ring, quick lengths, start, pause and reset, the focus mode,
  and the break and focus cards), and the day's recap in big numbers with the
  threads it counts. The music playing, if any, in a strip at the bottom. The
  clock turns once a minute, only while the tab shows.
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
  import MusicStrip from '../../music/MusicStrip.svelte';
  import TodoCard from '../../views/TodoCard.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const timer = $derived(companion.timer);
  const copy = strings.island.deck.today;
  const recapCopy = strings.island.assistant.recap;
  const pomodoro = strings.companion.pomodoro;
  /** The ring's radius, in the 100 × 100 box it is drawn in. */
  const RING = 44;
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
  <DeckTile area="clock" testid="deck-clock">
    <div class="clock" role="timer" aria-label={fill(copy.clock, { time: `${hours}:${minutes}${period ? ` ${period}` : ''}`, date })}>
      <p class="time" aria-hidden="true">
        <span>{hours}</span><span class="dots"><i></i><i></i><i></i></span><span>{minutes}</span>
        {#if period}<span class="period">{period}</span>{/if}
      </p>
      <p class="date" aria-hidden="true">{date}</p>
    </div>
  </DeckTile>

  <DeckTile area="week" heading={copy.week} testid="deck-week">
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
    <div class="todo"><TodoCard /></div>
  </DeckTile>

  <DeckTile area="timer" heading={copy.focus} testid="deck-timer">
    <div class="timer">
      <div class="ring" role="timer" aria-label={said} class:paused={timer.paused} class:resting={timer.phase === 'break'}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="track" cx="50" cy="50" r={RING} />
          <circle class="fill" cx="50" cy="50" r={RING} stroke-dasharray={ROUND} stroke-dashoffset={ROUND * (1 - share)} />
        </svg>
        <span class="left" aria-hidden="true">{shown}</span>
        <span class="phase" aria-hidden="true">{running ? phase : copy.idle}</span>
      </div>
      <div class="controls">
        {#if !running}
          <div class="presets" role="group" aria-label={copy.focus}>
            {#each FOCUS_PRESETS as minutes (minutes)}
              <button class="chip" class:on={chosen === minutes} aria-pressed={chosen === minutes} title={fill(copy.presetTitle, { minutes: String(minutes), rest: String(companion.prefs.breakMinutes) })} onclick={() => (chosen = minutes)}>
                {fill(copy.preset, { minutes: String(minutes) })}
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
            <button class="chip" onclick={() => timer.stop()} title={pomodoro.stop[timer.kind ?? 'pomodoro']}><RotateCcw size={13} />{copy.reset}</button>
          {/if}
          <button class="chip" class:on={companion.focus.active} aria-pressed={companion.focus.active} title={companion.focus.active ? strings.companion.focus.turnOff : strings.companion.focus.turnOn} onclick={() => companion.focus.toggle()}>
            <FocusIcon size={13} />{strings.companion.focus.label}
          </button>
        </div>
      </div>
    </div>
    <CompanionFocusCards {timer} focus={companion.focus} onopen={open} />
  </DeckTile>

  <DeckTile area="recap" heading={copy.recap} testid="island-recap">
    {#if view.recap.loaded && count === 0}
      <p class="none">{copy.none}</p>
    {:else}
      <div class="numbers">
        <p><span class="big">{count}</span><span>{count === 1 ? copy.threadsOne : copy.threadsMany}</span></p>
        <p><span class="big">{recap.files}</span><span>{recap.files === 1 ? copy.filesOne : copy.filesMany}</span></p>
        <p><span class="big">{worked}</span><span>{copy.time}</span></p>
      </div>
      <ul class="lines">
        {#each recap.threads as line (line.id)}
          <li>
            <button class="row" title={fill(recapCopy.open, { title: line.title })} onclick={() => open(line.id)}>
              <span class="name">{line.title}{#if line.project}<span class="project">{` · ${line.project}`}</span>{/if}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </DeckTile>

  {#if companion.media}
    <div class="music"><MusicStrip {companion} /></div>
  {/if}
</div>

<style>
  .today {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'clock week todo'
      'timer recap recap'
      'music music music';
    gap: var(--deck-gap);
  }
  .clock {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    gap: 2px;
  }
  .clock p {
    margin: 0;
  }
  .time {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 54px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  /* The three dots of the robots, between the hours and the minutes. */
  .dots {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--deck-accent);
  }
  .period {
    align-self: flex-end;
    color: var(--island-muted);
    font-size: 15px;
    font-weight: 500;
  }
  .date {
    color: var(--island-muted);
    font-size: 14px;
  }
  .date::first-letter {
    text-transform: uppercase;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .week li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0 10px;
    border-radius: 14px;
    background: var(--deck-field);
  }
  .week .day {
    color: var(--island-muted);
    font-size: 12px;
  }
  .week .number {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .week .mission {
    width: 5px;
    height: 5px;
    margin-top: -1px;
    border-radius: 50%;
  }
  .week .mission.on {
    background: var(--deck-accent);
  }
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .next {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    color: var(--island-muted);
    font-size: 12.5px;
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
    color: var(--island-text);
    text-overflow: ellipsis;
    white-space: nowrap;
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
    font-size: 12px;
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
    font-size: 12px;
    cursor: pointer;
  }
  .clear:hover {
    color: var(--island-text);
  }
  /* The tile's heading says the list's title, count and clearing: the card's own goes. */
  .todo :global(.head) {
    display: none;
  }
  /* Three rows, then it scrolls; padded so the rows' wider hover stays inside. */
  .todo :global(section ul) {
    max-height: 82px;
    margin-inline: -6px;
    padding-inline: 6px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  .week .today {
    background: var(--deck-accent-soft);
  }
  .week .today .day,
  .week .today .number {
    color: var(--deck-accent-ink);
  }
  .timer {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ring {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 112px;
    height: 112px;
  }
  .ring svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 7;
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
  .left {
    margin-top: -8px;
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 24px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .phase {
    position: absolute;
    top: 64px;
    max-width: 84px;
    overflow: hidden;
    color: var(--island-muted);
    font-size: 11px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls,
  .presets,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .controls {
    flex-direction: column;
    flex-wrap: nowrap;
    min-width: 0;
  }
  .chip,
  .main {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .chip:hover {
    color: var(--island-text);
  }
  .chip.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .main {
    background: var(--deck-accent);
    color: var(--island-bg);
    font-weight: 600;
  }
  .chip:focus-visible,
  .main:focus-visible,
  .clear:focus-visible,
  .row:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  .none {
    margin: 0;
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
    gap: 2px;
    margin: 0;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--deck-field);
    color: var(--island-muted);
    font-size: 12px;
  }
  .big {
    color: var(--island-text);
    font-family: var(--deck-numeral-font);
    font-size: 30px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .lines {
    display: flex;
    flex-direction: column;
    max-height: 66px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  .row {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    height: auto;
    padding: 3px 6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
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
    color: var(--island-muted);
  }
  .music {
    grid-area: music;
    display: flex;
    justify-content: center;
    padding: 6px;
    border-radius: var(--deck-tile-radius);
    background: var(--deck-tile);
  }
</style>
