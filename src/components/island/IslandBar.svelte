<!--
  The island's pill, collapsed or peeking: the lead robot and one line.

  - At rest the line answers one thing at a time (`lib/island/pill-view.ts`):
    someone waits on you (amber, the asking thread named), something just
    ended (green, red when it failed), what Settings shows at rest (the
    quota, the music, the timer, or the robot alone: `pill-rest.ts`), how
    many agents work, or nothing, the robot alone. A task list followed
    draws a hairline along the pill's lower lip. When the words change they
    roll, counter-like (`motion.ts`'s `rollIn` and `rollOut`); the same words
    move nothing. The width follows through the spring.
  - Hovered, or focused from the keyboard, the pill peeks with the detail:
    the status and the lead's step (`lib/island/status.ts`), and a dot per
    session (`lib/island/dots.ts`). The dots show only then: at rest the pill
    says how many, the hover says who. A request or a thing just told keeps
    its words while hovered.
  - The wheel goes through what the pill can show at rest, each conversation
    at work its own stop (`pill-stops.ts`), and rolls the line its way; where
    it lands becomes the setting. While it turns, the pill shows the stop
    rather than the hover's status, and the hover does not open the island.
    A request, a flash or a dot's name keeps the line: the wheel does nothing.
  - A dot hovered names its thread and state in the line. Over the dots, and
    while a request shows, a hover peeks without opening the island
    (`frame.hush`): the pill would otherwise open under the pointer of someone
    reading it. Over the dots the width holds, so they stay under the pointer.
  - A permission waiting shows under the line with Deny and Allow once, as the
    attention card has them: answered without opening the island. The buttons
    take no click for `ARM_MS` after they appear, so a click aimed elsewhere
    cannot allow by accident. "Always…" opens the choice of where the rule
    holds, this thread or this project (`lib/island/allow.svelte.ts`), armed
    again. Questions open the island, as before.
  - A request a rule answered is told in the line for a few seconds, its
    shield before it, with no sound or glow. A thread just ended or a pull
    request's CI told in the line (`pr-watch.svelte.ts`) opens its thread in
    Boite on a click.

  - On a pill with words, a press on the robot that moves pulls it out of
    the island, loose on the desktop (`Companion.onpress`); on the rest of
    the pill, it carries the island to another place
    (`lib/island/move.svelte.ts`). On a pill that shows the robot alone, a
    drag anywhere carries the island; the robot comes out after a press held
    still (`lib/island/hold.svelte.ts`), lifting a little as it arms. Without
    moving, a press is a click either way.
  - With the island on the screen's bottom edge, the pill is upside down: the
    line against the edge, the request above it, the lip on top.

  It tells the island the size it wants through `want`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Gauge, MemoryStick, Music, ShieldCheck, Timer, X } from '@lucide/svelte';
  import type { Companion } from '../../lib/companion/companion.svelte';
  import { describePermission, threadLabel } from '../../lib/companion/describe';
  import { writeCompanionPrefs } from '../../lib/companion/prefs';
  import { showMain } from '../../lib/companion/shell';
  import { ruleTarget, ruleText, type RuleScope } from '../../lib/island/allow-rules';
  import { dotLine, pillDots } from '../../lib/island/dots';
  import { LongPress, pressRoute } from '../../lib/island/hold.svelte';
  import { gazeOf, moodOf } from '../../lib/island/face';
  import type { FinishLine } from '../../lib/island/finished';
  import type { IslandFrame } from '../../lib/island/frame.svelte';
  import type { IslandMove } from '../../lib/island/move.svelte';
  import { bloom, blurAway, ROLL_MS, rollIn, rollOut } from '../../lib/island/motion';
  import { restLine, robotWidth, sessionLine, type TimerSource } from '../../lib/island/pill-rest';
  import { pillStops, stepStop, stopAt, WHEEL_STILL, wheelStep } from '../../lib/island/pill-stops';
  import { posed } from '../../lib/island/posed.svelte';
  import { fitWords, pillText, pillView } from '../../lib/island/pill-view';
  import { QuotaWatch } from '../../lib/island/quotas.svelte';
  import { requestQueue } from '../../lib/island/requests';
  import { isLive } from '../../lib/island/sessions';
  import type { Sessions } from '../../lib/island/sessions.svelte';
  import { rowDoing } from '../../lib/island/session-text';
  import { pressureRed, type Pressure } from '../../lib/island/pressure';
  import { islandStatus } from '../../lib/island/status';
  import { fill, strings } from '../../lib/strings';
  import CompanionCharacter from '../companion/CompanionCharacter.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    move: IslandMove;
    sessions: Sessions;
    /** A thread that just ended, or a pull request's CI, told while the island peeks for it. */
    told: (FinishLine & { threadId?: string }) | null;
    /** The memory guard's warning, when the pill tells it (`alertPlan`). */
    memory: Pressure | null;
    cheering: boolean;
    reduced: boolean;
    /** The size the pill wants; the island's spring goes there. */
    want?: { w: number; h: number };
    /** The line tells the timer: its drop beside the island leaves the time out. */
    timerInLine?: boolean;
  }

  let { companion, frame, move, sessions, told, memory, cheering, reduced, want = $bindable(), timerInLine = $bindable(false) }: Props = $props();

  const copy = strings.island;
  const card = strings.island.sessions.card;
  const SIZES = { collapsed: { w: 200, h: 32 }, peek: { w: 360, h: 40 } };
  /** With a request to answer: the line, then what is asked and the three answers. */
  const ASK = { w: 480, h: 78 };
  const PEEK = { min: 240, max: 420, chrome: 82 };
  /** The pill at rest: its words, the face, the gap and the padding. */
  const VIEW = { min: 150, max: 420, chrome: 68 };
  /** The longest detail the hover tells, cut on a word. */
  const DETAIL_MAX = 54;
  /** Each dot's hover target: wider than the dot. */
  const DOT_STEP = 12;
  /** How long the answers take no click once a request shows. */
  const ARM_MS = 400;

  let barFace = $state<HTMLElement | null>(null);
  let statusWidth = $state(0);
  let viewWidth = $state(0);

  const lead = $derived(companion.members[0]!);
  /** The conversations at work, and the one the wheel picked among them. */
  /** Home's session rows; a capture pose (`sessions=none`, `pose.ts`) shows none, in the dev bundle only. */
  const rows = $derived(import.meta.env.DEV && posed.idle ? [] : sessions.rows);
  const liveRows = $derived(rows.filter(isLive));
  let picked = $state<string | null>(null);
  const leadSession = $derived(liveRows.find((row) => row.id === picked) ?? sessions.lead);
  /** The thread followed from Home keeps the line whatever else starts (`followed.ts`). */
  const shown = $derived(sessions.followedRow ?? leadSession);
  const session = $derived(shown ? sessionLine(shown, (shown.projectId && companion.projects.get(shown.projectId)) || '') : null);
  /** What the pill shows at rest, as Settings chose (`pill-rest.ts`); null for the robot alone. */
  const rest = $derived(companion.prefs.pillRest);
  const quotas = new QuotaWatch(() => ({ shown: companion.prefs.quotas, hidden: companion.prefs.hiddenQuotas }));
  /** The timer while one runs: its line counts the time left, or so far for a stopwatch. */
  const timerSource = $derived.by((): TimerSource | null => {
    const { current, elapsed, left, paused } = companion.timer;
    return current ? { kind: current.kind, phase: current.phase, label: current.label, ms: current.kind === 'stopwatch' ? elapsed : left, paused } : null;
  });
  const live = $derived(restLine(rest, { live: session, media: companion.media, quota: quotas.headroom, timer: timerSource }));
  /** The views the wheel goes through (`pill-stops.ts`). */
  const stops = $derived(
    pillStops({
      live: liveRows.map((row) => row.id),
      followed: sessions.followedRow?.id ?? null,
      quota: quotas.headroom !== null,
      music: Boolean(companion.media?.playing && companion.media.title),
      timer: timerSource !== null
    })
  );
  const status = $derived(
    islandStatus({
      blocking: companion.blocking,
      finished: frame.flashing,
      talking: companion.talking ? (companion.members.find((member) => member.talk.thinking)?.name ?? '') : null,
      busy: companion.busy.length,
      lead: leadSession ? { title: leadSession.title, step: rowDoing(leadSession) } : null
    })
  );

  // The pick lasts while its conversation works.
  $effect(() => {
    if (picked !== null && !liveRows.some((row) => row.id === picked)) picked = null;
  });

  const dots = $derived(pillDots(rows, companion.blocking));
  /** The pointer is over the dots' strip, and over which dot. */
  let onDots = $state(false);
  let hoveredKey = $state<string | null>(null);
  const hoveredDot = $derived(dots.find((dot) => dot.key === hoveredKey) ?? null);

  /** The first request waiting, when it is a permission: the pill answers it. */
  const queue = $derived(requestQueue(companion.permissions, companion.questions));
  const ask = $derived(queue[0]?.kind === 'permission' ? queue[0] : null);
  const asking = $derived(ask !== null);
  const origin = $derived(ask ? threadLabel(companion.threads, companion.projects, ask.request.threadId) : null);
  const said = $derived(ask ? describePermission(ask.request) : null);
  let armed = $state<string | null>(null);
  let sending = $state<string | null>(null);
  let failure = $state<{ id: string; message: string } | null>(null);
  /** The request whose "Always…" was picked: its row offers the rule's scope. */
  let scoping = $state<string | null>(null);
  /** What a rule made from the request would cover; null when none can be made. */
  const target = $derived(ask ? ruleTarget(ask.request) : null);
  const ruleTitle = $derived(target ? fill(copy.allow.alwaysTitle, { rule: ruleText(target) }) : copy.allow.cannot);
  const inProject = $derived(ask ? companion.threads.some((thread) => thread.id === ask.request.threadId && thread.projectId) : false);
  /** Each row of answers arms on its own: the scope's too. */
  const armKey = $derived(ask ? (scoping === ask.id ? `scope:${ask.id}` : ask.id) : null);
  /** The last request a rule answered: told in the line a few seconds, its shield before it. */
  const trace = $derived(companion.rules.trace);
  const traceLine = $derived(trace ? { text: fill(copy.allow.traced, { rule: trace.text }), tone: 'done' as const } : null);

  /** The first request's thread, when Bots knows it. */
  const asker = $derived.by(() => {
    const first = queue[0];
    const thread = first ? companion.threads.find((entry) => entry.id === first.request.threadId) : undefined;
    return thread ? thread.title || strings.companion.untitled : null;
  });
  /** The row the pill follows alone: followed from Home, else picked with the wheel. */
  const focusRow = $derived(sessions.followedRow ?? (picked !== null ? (liveRows.find((row) => row.id === picked) ?? null) : null));
  /** What the pill says at rest (`pill-view.ts`). With a request to answer, the asking thread is named and the queue counted aside. */
  const view = $derived(
    pillView({
      waiting: asking ? { count: 1, from: origin?.title ?? null } : { count: companion.blocking, from: asker },
      told: told && frame.flashing ? { text: told.text, tone: told.tone } : null,
      rule: traceLine?.text ?? null,
      memory: memory ? { pressure: memory, red: pressureRed(memory) } : null,
      rest: live && live.kind !== 'live' ? live : null,
      robot: rest === 'robot',
      focus: focusRow ? sessionLine(focusRow, (focusRow.projectId && companion.projects.get(focusRow.projectId)) || '') : null,
      working: { count: liveRows.length, first: liveRows[0] ? liveRows[0].title || strings.companion.untitled : null },
      goal: (focusRow ?? liveRows.find((row) => row.progress && row.progress.total > 0))?.progress ?? null
    })
  );
  const viewText = $derived(pillText(view));
  const meta = $derived(asking && queue.length > 1 ? fill(card.of, { index: '1', count: String(queue.length) }) : view.meta);

  /** The pill is focused from the keyboard: it tells the hover's detail. */
  let focused = $state(false);
  /** While the wheel turns, the hover's detail gives way to where the wheel lands. */
  let wheeling = $state(false);
  /** Hovered or focused: the detail and the dots. */
  const hovered = $derived(((frame.hovering && !wheeling) || focused || onDots) && !companion.dropped);
  /** The hover's detail replaces the rest's words; a request, a thing just told and a dot's name keep theirs. */
  const detail = $derived(hoveredDot !== null || (hovered && (view.state === 'rest' || view.state === 'working' || view.state === 'idle')));
  /** The line the detail shows: a hovered dot, else the status with the lead's step. */
  const line = $derived(hoveredDot ? dotLine(hoveredDot) : { text: fitWords(status.text, DETAIL_MAX), tone: status.tone });
  const peeking = $derived(detail || asking);

  const dotsWidth = $derived(hovered ? dots.length * DOT_STEP : 0);
  const peekWidth = $derived(Math.round(Math.min(PEEK.max, Math.max(PEEK.min, statusWidth + PEEK.chrome + dotsWidth))));
  const restWidth = $derived(viewText ? Math.round(Math.min(VIEW.max, Math.max(VIEW.min, viewWidth + VIEW.chrome + dotsWidth))) : robotWidth(dotsWidth));
  const wanted = $derived(asking ? ASK : detail ? { ...SIZES.peek, w: peekWidth } : { ...SIZES.collapsed, w: restWidth });
  // Over the dots the width holds: a dot's name is longer or shorter than the line, and the dots would slide from under the pointer.
  $effect(() => {
    const next = wanted;
    const held = onDots;
    untrack(() => {
      const w = held && want ? want.w : next.w;
      if (want?.w !== w || want?.h !== next.h) want = { w, h: next.h };
    });
  });

  // A request in the pill, or a dot's name, is being read: a hover does not open the island over it.
  $effect(() => {
    if (!asking) return;
    untrack(() => frame.hush('ask', true));
    return () => frame.hush('ask', false);
  });
  $effect(() => {
    if (!onDots) return;
    untrack(() => frame.hush('dot', true));
    return () => frame.hush('dot', false);
  });

  // The quota, at rest or as a stop of the wheel: read as the pill shows, then as the core pushes it. No clock of its own.
  $effect(() => {
    const client = companion.client;
    if (!(rest === 'quota' || companion.prefs.quotas) || !client) return;
    return untrack(() => {
      void quotas.refresh(client);
      return client.on('quotas.updated', (rows) => quotas.accept(rows));
    });
  });

  // The timer's drop leaves its time to the line while the line tells it.
  $effect(() => {
    const inLine = !peeking && view.glyph === 'timer';
    untrack(() => (timerInLine = inLine));
  });
  $effect(() => () => (timerInLine = false));

  // The answers wake `ARM_MS` after their request shows, and the scopes after "Always…".
  $effect(() => {
    const key = armKey;
    if (!key) return;
    const arm = setTimeout(() => (armed = key), ARM_MS);
    return () => clearTimeout(arm);
  });

  async function answer(kind: 'allow' | 'deny', scope?: RuleScope) {
    const current = ask;
    if (!current || armed !== armKey || sending) return;
    sending = current.id;
    failure = null;
    try {
      await companion.act(scope ? { kind: 'always', request: current.request, scope } : { kind, request: current.request });
    } catch (error) {
      failure = { id: current.id, message: error instanceof Error ? error.message : String(error) };
    } finally {
      sending = null;
    }
  }

  let pace = WHEEL_STILL;
  /** The wheel turned back: the line rolls down, for a moment. */
  let back = $state(false);
  let backTimer: ReturnType<typeof setTimeout> | undefined;
  /** How long the pill keeps showing the wheel's stop after the last turn, the hover's opening held meanwhile. */
  const WHEEL_SHOW_MS = 1500;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => {
    clearTimeout(backTimer);
    clearTimeout(wheelTimer);
  });
  // The island does not open under a pointer that is turning the wheel.
  $effect(() => {
    if (!wheeling) return;
    untrack(() => frame.hush('wheel', true));
    return () => frame.hush('wheel', false);
  });
  /** The wheel on the pill goes through its views; where it lands becomes the setting. Not over a request, a flash or a dot's name. */
  function wheel(event: WheelEvent) {
    if (asking || hoveredDot !== null || trace !== null || frame.flashing) return;
    wheeling = true;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => (wheeling = false), WHEEL_SHOW_MS);
    const turned = wheelStep(pace, event.deltaY, event.deltaMode, performance.now());
    pace = turned.pace;
    if (turned.step === 0) return;
    const stop = stepStop(stops, stopAt(stops, rest, shown?.id ?? null), turned.step);
    if (!stop) return;
    back = turned.step < 0;
    clearTimeout(backTimer);
    backTimer = setTimeout(() => (back = false), ROLL_MS);
    if (stop.view === 'live' && stop.threadId !== null && !sessions.followedRow) picked = stop.threadId;
    if (stop.view !== rest) companion.prefs = writeCompanionPrefs({ pillRest: stop.view });
  }

  /** The dot under the pointer, if any: its hover target is the column it stands in. */
  function pointerMove(event: PointerEvent) {
    companion.onmove(event);
    const target = event.target instanceof Element ? event.target : null;
    onDots = target?.closest('.dots') != null;
    hoveredKey = target?.closest<HTMLElement>('[data-dot]')?.dataset.dot ?? null;
  }

  function leave() {
    onDots = false;
    hoveredKey = null;
  }

  /** The pill shows the robot alone at rest: its face is nearly all of it, so a drag carries the island and a long press pulls the robot. */
  const robotOnly = $derived(!asking && !viewText);
  // Held long enough: the island stays, the drag that follows pulls the robot out.
  const hold = new LongPress((event) => {
    move.abort();
    companion.onpress(event, true);
  });
  $effect(() => () => hold.dispose());

  /** On the robot, the press may pull it out; elsewhere on the pill, it may carry the island. */
  function press(event: PointerEvent) {
    const route = pressRoute(event.target instanceof Node && barFace?.contains(event.target) === true, robotOnly);
    if (route === 'pull') return companion.onpress(event, true);
    move.press(event);
    if (route === 'hold') hold.press(event);
  }

  function barClick() {
    if (companion.dropped || move.moved || hold.held) return;
    if (told?.threadId && frame.flashing) return void showMain(told.threadId);
    frame.click();
  }
</script>

<div class="pill" class:asking in:bloom={{ reduced }} out:blurAway={{ reduced }}>
  <span class="measure" aria-hidden="true" bind:offsetWidth={statusWidth}>{line.text}</span>
  {#if viewText}<span class="measure say-measure" aria-hidden="true" data-state={view.state} bind:offsetWidth={viewWidth}>{#if view.glyph}<i class="glyph"></i>{/if}{view.before}<b>{view.strong}</b>{view.after}{#if meta}<span class="meta">{meta}</span>{/if}</span>{/if}
  <button
    class="bar"
    data-testid="island-bar"
    data-state={view.state}
    aria-expanded="false"
    aria-label={[detail ? line.text : viewText || line.text, meta].filter(Boolean).join(', ')}
    onclick={barClick}
    onpointerdown={press}
    onpointermove={pointerMove}
    onpointerleave={leave}
    onpointerup={companion.onrelease}
    onwheel={wheel}
    onfocus={(event) => (focused = event.currentTarget.matches(':focus-visible'))}
    onblur={() => (focused = false)}
  >
    <span class="face" class:held={hold.armed && !companion.dragging} bind:this={barFace}>
      <CompanionCharacter
        mood={moodOf(companion, lead.talk.thinking, true)}
        busy={companion.mood.busy}
        alarm={companion.notes.alarms.length > 0}
        cheer={cheering}
        boing={companion.boings[lead.id] ?? 0}
        dizzy={companion.dizzy[lead.id] ?? false}
        gaze={gazeOf(companion, barFace)}
        skin={lead.skin}
        size={peeking ? 34 : 28}
        {...companion.look}
      />
    </span>
    {#if detail}
      <span class="status roll" in:bloom={{ reduced }} data-tone={line.tone} data-testid="island-status">
        {#key line.text}<span class="line" in:rollIn={{ reduced }} out:rollOut={{ reduced }}>{line.text}</span>{/key}
      </span>
    {:else if viewText}
      <!-- The timer's clock ticks in place: only its name rolls the line. -->
      <span class="say roll" in:bloom={{ reduced }} data-tone={view.tone} data-paused={view.paused || undefined} data-testid="island-live">
        {#key view.glyph === 'timer' ? `timer\n${view.strong}` : viewText}<span class="line" in:rollIn={{ reduced, back }} out:rollOut={{ reduced, back }}
            >{#if view.glyph}<span class="glyph" data-tone={view.glyphTone} data-testid={view.glyph === 'rule' ? 'island-rule-trace' : undefined}
                >{#if view.glyph === 'quota'}<Gauge size={14} strokeWidth={2.2} aria-hidden="true" />{:else if view.glyph === 'music'}<Music size={14} strokeWidth={2.2} aria-hidden="true" />{:else if view.glyph === 'memory'}<MemoryStick size={14} strokeWidth={2.2} aria-hidden="true" />{:else if view.glyph === 'timer'}<Timer
                    size={14}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />{:else}<ShieldCheck size={14} strokeWidth={2.2} aria-hidden="true" />{/if}</span
              >{/if}{view.before}{#if view.strong}<b>{view.strong}</b>{/if}<span class="after">{view.after}</span></span
          >{/key}
      </span>
    {/if}
    {#if meta && !detail}<span class="meta" data-tone={view.tone} data-testid="island-meta">{meta}</span>{/if}
    {#if hovered && dots.length > 0}
      <span class="dots" aria-hidden="true" in:bloom={{ reduced }}>
        {#each dots as dot (dot.key)}<span class="dot" class:on={dot.key === hoveredKey} data-dot={dot.key}><i data-tone={dot.tone}></i></span>{/each}
      </span>
    {/if}
    {#if view.progress !== null && !peeking}<span class="lip" aria-hidden="true"><i style:transform="scaleX({view.progress.toFixed(3)})"></i></span>{/if}
  </button>
  {#if ask && said}
    {@const request = ask.request}
    {@const waiting = sending === ask.id}
    {@const ready = armed === armKey && !waiting}
    <div class="ask" role="group" aria-label={copy.ask} data-testid="island-ask">
      {#if failure?.id === ask.id}
        <p class="what failure" role="alert">{failure.message}</p>
      {:else if scoping === ask.id}
        <p class="what hint">{copy.allow.hint}</p>
      {:else}
        <p class="what">{said.verb}{#if said.target}&nbsp;<code>{said.target}</code>{/if}</p>
      {/if}
      {#if scoping === ask.id}
        <button class="answer ghost back" aria-label={copy.allow.back} title={copy.allow.back} disabled={waiting} data-testid="island-ask-back" onclick={() => (scoping = null)}>
          <X size={13} />
        </button>
        <button class="answer scope" aria-disabled={!ready} disabled={waiting} title={ruleTitle} data-testid="island-ask-thread" onclick={() => answer('allow', 'thread')}>{copy.allow.thread}</button>
        <button class="answer scope" aria-disabled={!ready} disabled={waiting || !inProject} title={ruleTitle} data-testid="island-ask-project" onclick={() => answer('allow', 'project')}>
          {copy.allow.project}
        </button>
      {:else}
        <button class="answer ghost" aria-disabled={!ready} disabled={waiting} data-testid="island-ask-deny" onclick={() => answer('deny')}>{card.deny}</button>
        <button class="answer ghost" aria-disabled={!ready || !target} disabled={waiting} title={ruleTitle} data-testid="island-ask-always" onclick={() => ready && target && (scoping = ask.id)}>
          {copy.allow.always}
        </button>
        <button class="answer primary" aria-disabled={!ready} disabled={waiting} data-testid="island-ask-allow" onclick={() => answer('allow')}>
          {card.allowOnce}
        </button>
      {/if}
      {#if request.description}<span class="sr">{request.description}</span>{/if}
    </div>
  {/if}
  {#if traceLine}<span class="sr" role="status">{traceLine.text}</span>{/if}
</div>

<style>
  .pill {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .bar {
    position: relative;
    flex: 1 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 0;
    padding: 0 14px 0 12px;
    border: none;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    touch-action: none;
  }
  .asking .bar {
    flex: none;
    height: 40px;
  }
  :global([data-island-edge='bottom']) .pill {
    flex-direction: column-reverse;
  }
  :global([data-island-edge='bottom']) .lip {
    top: 3px;
    bottom: auto;
  }
  :global([data-island-edge='bottom']) .ask {
    padding: 6px 10px 0 14px;
    animation-name: ask-rise;
  }
  .bar:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: -2px;
  }
  .face {
    display: grid;
    place-items: center;
    flex: none;
    height: 100%;
    transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* A long press armed: the robot grows a little, ready to come out. */
  .face.held {
    transform: scale(1.14);
  }
  /* A line that rolls: the old one and the new one share the cell while they pass. */
  .roll {
    display: grid;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
  }
  .line {
    grid-area: 1 / 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    font-weight: 500;
  }
  .status[data-tone='attention'] { color: var(--island-attention); }
  .status[data-tone='done'] { color: var(--island-done); }
  .status[data-tone='failed'] { color: var(--island-danger); }
  .status[data-tone='talking'] { color: #b9aefb; }
  .status[data-tone='idle'] { color: var(--island-muted); }
  /*
   * The pill at rest: one line, larger than the hover's detail, the name or
   * the count in bold. Only someone waiting on the user turns the words amber;
   * the quota's and the timer's marks keep their own tint.
   */
  .say,
  .say-measure {
    font-size: 14px;
    letter-spacing: -0.005em;
  }
  .say {
    --say: var(--island-text);
    color: var(--say);
  }
  .say b,
  .say-measure b {
    font-weight: 650;
  }
  .say .after {
    color: color-mix(in srgb, var(--say) 80%, transparent);
  }
  .say[data-tone='attention'] { --say: var(--island-attention); }
  .say[data-tone='done'] { --say: var(--island-done); }
  .say[data-tone='failed'] { --say: var(--island-danger); }
  /* A told line is one piece: it reads at full strength. */
  .bar[data-state='told'] .say .after {
    color: var(--say);
    font-weight: 550;
  }
  .glyph,
  .say-measure .glyph {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    margin-right: 7px;
    vertical-align: -2px;
  }
  .glyph[data-tone='amber'] { color: var(--island-attention); }
  .glyph[data-tone='red'] { color: var(--island-danger); }
  .glyph[data-tone='done'] { color: var(--island-done); }
  /* The timer's clock: its digits keep their width, so the pill does not twitch each second. */
  .say .after,
  .say-measure {
    font-variant-numeric: tabular-nums;
  }
  .say[data-paused] .after {
    opacity: 0.55;
  }
  /* The count beside the words: the task list's, or the requests'. */
  .meta {
    flex: none;
    color: var(--island-muted);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .meta[data-tone='attention'] {
    color: color-mix(in srgb, var(--island-attention) 80%, transparent);
  }
  .say-measure .meta {
    margin-left: 10px;
  }
  /*
   * The task list's progress, a hairline along the pill's lower lip, under
   * the words. It moves only when the list does.
   */
  .lip {
    position: absolute;
    right: 18px;
    bottom: 3px;
    left: 50px;
    height: 2px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--island-line-strong);
    pointer-events: none;
  }
  .lip i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--island-working);
    transform-origin: left center;
    transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .dots {
    display: flex;
    align-self: stretch;
    margin-left: auto;
  }
  /* Each dot's hover target is its whole column. */
  .dot {
    display: grid;
    place-items: center;
    width: 12px;
  }
  .dot i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-working);
    transition: transform 160ms ease;
  }
  .dot i[data-tone='working'],
  .dot i[data-tone='attention'] {
    animation: pulse 1.6s ease-in-out infinite;
  }
  .dot i[data-tone='attention'] {
    background: var(--island-attention);
  }
  .dot i[data-tone='done'] {
    background: var(--island-done);
  }
  .dot i[data-tone='failed'] {
    background: var(--island-danger);
  }
  .dot.on i {
    transform: scale(1.4);
  }

  /* The request: what is asked, then the two answers. */
  .ask {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px 6px 14px;
    animation: ask-in 260ms ease-out;
  }
  .what {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--island-text);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what code {
    font-size: 11.5px;
  }
  .failure {
    color: var(--island-danger);
  }
  .answer {
    flex: none;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 160ms ease;
  }
  .answer.primary {
    border-color: transparent;
    background: var(--island-attention);
    color: var(--island-attention-ink);
  }
  .answer.ghost:hover:not([aria-disabled='true'], :disabled) {
    background: var(--island-card-hover);
  }
  /* Where the rule holds: allowing, quieter than "Allow once". */
  .answer.scope {
    border-color: var(--island-attention);
    color: var(--island-attention);
  }
  .answer.scope:hover:not([aria-disabled='true'], :disabled) {
    background: var(--island-card-hover);
  }
  .answer.back {
    display: grid;
    place-items: center;
    width: 26px;
    padding: 0;
  }
  .hint {
    color: var(--island-muted);
  }
  /* Asleep for a moment after the request shows: seen, not yet clickable. */
  .answer[aria-disabled='true'],
  .answer:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .answer:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }

  /* Sizes the line; never seen. */
  .measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    white-space: nowrap;
    font-weight: 500;
    pointer-events: none;
  }
  .say-measure {
    font-weight: 400;
  }
  .say-measure[data-state='told'] {
    font-weight: 550;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
  @keyframes ask-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @keyframes ask-rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @keyframes ask-fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .face {
      transition: none;
    }
    .dot i {
      animation: none !important;
      transition: none;
    }
    .lip i {
      transition: none;
    }
    .ask {
      animation: ask-fade 200ms ease-out;
    }
    :global([data-island-edge='bottom']) .ask {
      animation-name: ask-fade;
    }
  }
</style>
