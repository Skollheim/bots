<!--
  The island: a black shape hanging from the top of a screen, rounded at the
  bottom only, in three sizes that one spring moves between
  (`lib/island/frame.svelte.ts`):

  - collapsed, a pill with the lead robot and a dot per session, and, while
    a conversation works, its project and step with its task list's progress
    under it (the wheel goes through the ones at work);
  - peek, on hover or when a thread ended, one line of status; a permission
    waiting is answered from the pill (`IslandBar.svelte`);
  - open, the deck (`deck/Deck.svelte`): a tab bar with the robot, the
    deck's tabs and the island's controls, and the tab chosen under it, the
    requests waiting and the memory warning laid above it.

  Open, the settings grow out of the deck under its bar
  (`settings/SettingsPanel.svelte`), over the tab, longer than the deck.

  Beside the pill and the peek hang two drops: the timer on the left while
  one runs, the music on the right (`music/MusicBubble.svelte`). Each is born
  from the island's edge on a black neck that snaps, and is taken back the
  same way (`lib/island/motion.ts`). Open, the music has its own tab.

  A halo behind it breathes amber while the user is waited on, flashes green
  once when a turn finished (red when a thread failed), and stays a calm blue-violet while a reply
  comes. A soft shadow under it keeps it apart from light wallpapers. As it
  changes size, the content coming in blooms from a light blur to sharp.

  The views read what they need from the
  view contract (`lib/island/contract.ts`). A press on a robot that moves
  sets it loose on the desktop (`Companion.onpress`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { FrameSpring } from '../../lib/island/spring.svelte';
  import type { Absence } from '../../lib/companion/absence';
  import type { Companion } from '../../lib/companion/companion.svelte';
  import { showMain } from '../../lib/companion/shell';
  import { waitingOnUser } from '../../lib/companion/watch';
  import { Bar } from '../../lib/island/bar.svelte';
  import { awayLines, awaySpan, awayWorth, type AwayEvent, type AwayFacts, type AwayLine, type AwaySpan } from '../../lib/island/away';
  import { AwayWatch } from '../../lib/island/away.svelte';
  import { provideView } from '../../lib/island/contract';
  import { HOVER_OPEN_MS, type IslandFrame, type IslandGlow } from '../../lib/island/frame.svelte';
  import { bloom, blurAway, GOO_FILTER } from '../../lib/island/motion';
  import { threadLabel } from '../../lib/companion/describe';
  import { FinishWatch } from '../../lib/island/finished.svelte';
  import { posed } from '../../lib/island/posed.svelte';
  import { PrWatch } from '../../lib/island/pr-watch.svelte';
  import { MemoryWatch } from '../../lib/island/pressure.svelte';
  import { QuotaWatch } from '../../lib/island/quotas.svelte';
  import { RecapReader } from '../../lib/island/recap.svelte';
  import { panelHeight, settingsPanel } from '../../lib/island/settings-panel.svelte';
  import { Sessions } from '../../lib/island/sessions.svelte';
  import { UpdateWatch } from '../../lib/island/update.svelte';
  import { strings } from '../../lib/strings';
  import Deck from './deck/Deck.svelte';
  import IslandBar from './IslandBar.svelte';
  import IslandDrop from './IslandDrop.svelte';
  import SettingsPanel from './settings/SettingsPanel.svelte';
  import MusicBubble from './music/MusicBubble.svelte';
  import TimerBubble from './TimerBubble.svelte';
  import AwayCard from './views/AwayCard.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    /** The shape moved: the page sends its hit areas again. */
    onresize: () => void;
  }

  let { companion, frame, onresize }: Props = $props();

  const copy = strings.island;
  /** The deck's width (`--deck-width`), and the most it takes before its tab scrolls. */
  const OPEN_WIDTH = 860;
  const OPEN_MAX = 470;
  /** The deck's tab bar above the tab. */
  const TABS_HEIGHT = 52;
  const COLLAPSED = { w: 200, h: 32 };
  const RADIUS = 22;
  /** The deck's corners, bigger than the pill's (`--deck-radius`). */
  const DECK_RADIUS = 28;
  const CHEER_MS = 1200;

  let measured = $state(0);
  let windowWidth = $state(0);
  /** The pointer is on a drop beside the island: the island itself does not peek for it. */
  let onSide = $state(false);
  let cheering = $state(false);
  /** The size the pill wants (`IslandBar`). */
  let pill = $state({ ...COLLAPSED });
  /** The pill's line tells the timer: its drop shows the ring alone. */
  let timerInLine = $state(false);

  const lead = $derived(companion.members[0]!);
  /** The deck's bar as the user arranged it, followed as Settings or the edit mode change it. */
  const bar = new Bar();
  $effect(() => bar.start());
  const sessions = new Sessions({ client: () => companion.client, threads: () => companion.threads, own: () => companion.ownThreads, held: () => companion.notes.notices.map((notice) => notice.threadId) });
  $effect(() => sessions.start());
  /** A thread that ended is told in the pill, which peeks for it; red for a failure. */
  const finishes = new FinishWatch({ client: () => companion.client, rows: () => sessions.rows, announce: (failed) => frame.flash(failed) });
  $effect(() => finishes.start());
  $effect(() => {
    if (!frame.flashing)
      untrack(() => {
        finishes.clear();
        prs.clear();
      });
  });
  /** A pull request a Home thread opened: its CI is followed, and told once settled (fast in the `pr=` demo). */
  const prDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('pr');
  const prs = new PrWatch({
    client: () => companion.client,
    rows: () => sessions.rows,
    threads: () => companion.threads,
    announce: (failed) => {
      frame.flash(failed);
      companion.cue(failed ? 'error' : 'done');
    },
    ...(prDemo ? { first: 1_500, max: 1_500 } : {})
  });
  $effect(() => prs.start());
  /** How near Boite's memory guard is to stopping an agent, and a newer Boite out. */
  const memory = new MemoryWatch();
  const update = new UpdateWatch();
  // GitHub is not asked from the demo (`?fake=1`); a capture pose (`pose.ts`) lays its own warning and release.
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('fake') === '1';
  const posing = import.meta.env.DEV && new URLSearchParams(location.search).has('pose');
  $effect(() => {
    const client = companion.client;
    if (!client || posing) return;
    return untrack(() => memory.follow(client, (threadId) => threadLabel(companion.threads, companion.projects, threadId).title));
  });
  if (posing) {
    $effect(() => {
      memory.pose(posed.pressure, posed.stopped, posed.memory);
      update.pose(posed.release);
    });
  }
  $effect(() => {
    const client = companion.client;
    if (!client || demo) return;
    return untrack(() => update.follow(client));
  });
  /** The warning's cause, not its numbers: a warning calls the island once, not on every read. */
  const memoryCause = $derived(memory.warning ? `${memory.warning.reason}:${memory.warning.threadId ?? ''}` : null);
  /** The day's finished threads, read for the tabs that show them, as they show. */
  const recap = new RecapReader({ client: () => companion.client, projects: () => companion.projects, leftOut: () => companion.ownThreads });
  /** The room between a drop and the island. */
  const SIDE_GAP = 8;
  // Settles within a quarter pixel: the last frames of a smaller step would move nothing one can see.
  // The same curve at 60 and 240 Hz (`spring.svelte.ts`), where Svelte's `Spring` slows on a faster screen.
  const box = new FrameSpring({ ...COLLAPSED }, { stiffness: 0.18, damping: 0.72, precision: 0.25 });
  /** The corners grow with the island, from the pill's to the deck's. */
  const opened = $derived(Math.min(1, Math.max(0, (box.current.w - COLLAPSED.w) / (OPEN_WIDTH - COLLAPSED.w))));
  const radius = $derived(Math.min(RADIUS + (DECK_RADIUS - RADIUS) * opened, box.current.h / 2));
  const target = $derived(frame.size === 'open' ? { w: OPEN_WIDTH, h: Math.min(Math.max(measured, 120), OPEN_MAX) } : pill);
  /** What the drops beside the island have, up to the window's edge. */
  const sideRoom = $derived(Math.max(0, (windowWidth - box.current.w) / 2 - SIDE_GAP));
  const sides = $derived(frame.size !== 'open');
  /** The music's drop shows: a track, or Spotify to open (`MusicBubble`'s own rule), so it is born and taken back here. */
  const musicShown = $derived(companion.media !== null || companion.music.knowsSpotify);
  const reduced = $derived(prefersReducedMotion.current);
  /** The halo keeps its last hue while it fades out. */
  let haloLast: IslandGlow = 'none';
  const haloTone = $derived.by(() => (frame.glow === 'none' ? haloLast : (haloLast = frame.glow)));

  /** Hovered with "open on hover", the pill swells a little until it opens; a moment at most, so no text rests scaled. */
  const SWELL_SPARE_MS = 150;
  let swelling = $state(false);
  $effect(() => {
    if (!frame.hovering || frame.size !== 'peek' || frame.hushed || !companion.prefs.openOnHover || companion.dropped || reduced) return;
    untrack(() => (swelling = true));
    const end = setTimeout(() => (swelling = false), HOVER_OPEN_MS + SWELL_SPARE_MS);
    return () => {
      clearTimeout(end);
      swelling = false;
    };
  });

  provideView({
    get companion() {
      return companion;
    },
    core: {
      get client() {
        return companion.client;
      },
      get reachable() {
        return companion.reachable;
      }
    },
    island: {
      get size() {
        return frame.size;
      },
      get tab() {
        return frame.tab;
      },
      get pinned() {
        return frame.pinned;
      },
      get glow() {
        return frame.glow;
      }
    },
    attention: (key, options) => {
      if (!options?.quiet) companion.cue('call');
      return frame.call(key);
    },
    hold: (key, on) => frame.hold(key, on),
    resized: () => onresize(),
    reveal: (threadId) => showMain(threadId),
    show: (tab) => frame.show(tab),
    sessions,
    memory,
    update,
    recap,
    prs
  });

  $effect(() => {
    box.set(target, { instant: prefersReducedMotion.current });
  });
  $effect(() => () => box.stop());

  // Each step of the spring moves the hit area; the page sends only what changed,
  // read once the step is drawn: reading it within the step lays the island out twice.
  $effect(() => {
    void [box.current.w, box.current.h];
    const read = setTimeout(onresize);
    return () => clearTimeout(read);
  });

  $effect(() => {
    const over = companion.hover && !onSide;
    untrack(() => frame.hover(over));
  });

  // A turn finished: the lead jumps for joy and the island peeks green.
  let seenDone = -1;
  let cheerTimer: ReturnType<typeof setTimeout> | undefined;
  function cheer() {
    companion.bounce(lead.id);
    cheering = true;
    clearTimeout(cheerTimer);
    cheerTimer = setTimeout(() => (cheering = false), CHEER_MS);
  }
  $effect(() => {
    const done = companion.done;
    untrack(() => {
      if (seenDone === -1 || done === seenDone) return void (seenDone = done);
      seenDone = done;
      frame.flash();
      cheer();
    });
    return () => clearTimeout(cheerTimer);
  });

  // A reminder rang: the island opens on the threads, where it shows, until it is dealt with.
  // Turned to for the reminder, not chosen: the deck still opens on the last tab picked next time.
  $effect(() => {
    if (companion.notes.alarms.length === 0) return;
    untrack(() => (frame.tab = 'threads'));
    return untrack(() => frame.call('alarm'));
  });

  // The memory guard comes near: the island opens on its card, amber, until it is stopped or set aside.
  $effect(() => {
    if (!memoryCause) return;
    untrack(() => companion.cue('call'));
    return untrack(() => frame.call('memory'));
  });

  /*
   * Back at the keyboard after a long absence (`lib/island/away.ts`): the deck
   * opens, on the tab last picked, with what happened meanwhile over it. The
   * requests come first, and nothing shows over a full-screen app or during
   * focus: the card waits for them.
   */
  const away = new AwayWatch({ rows: () => sessions.rows, pr: () => prs.told, warning: () => memory.warning, stopped: () => memory.stopped });
  $effect(() => away.start());
  const awayQuotas = new QuotaWatch(() => ({ shown: companion.prefs.quotas, hidden: companion.prefs.hiddenQuotas }));
  /** A return older than this was told before the island was drawn again. */
  const AWAY_FRESH_MS = 60_000;
  /** Now, for how long what waits has waited: read again each minute while the card shows. */
  let awayNow = $state(Date.now());
  let awayGreeted: AwaySpan | null = null;

  function awayFacts(span: AwaySpan, events: readonly AwayEvent[], now: number): AwayFacts {
    const pose = posing ? posed.away : null;
    const tight = awayQuotas.headroom;
    const input = { threads: companion.threads, permissions: companion.permissions, questions: companion.questions, projects: companion.projects, own: companion.ownThreads };
    return {
      from: span.from,
      back: span.back,
      now,
      events,
      waiting: pose?.waiting ?? waitingOnUser(input, new Map(), now, 0, false).map(({ threadId, title, kind, since }) => ({ threadId, title, kind, since })),
      alarms: pose?.alarms ?? companion.notes.alarms,
      quota: pose ? pose.quota : tight && { name: tight.account.name, left: tight.bar.left },
      seen: away.seen
    };
  }

  async function awayBack(absence: Absence) {
    if (!companion.prefs.awayRecap || Date.now() - absence.to > AWAY_FRESH_MS) return;
    const span = away.span(absence);
    const client = companion.client;
    if (client && companion.prefs.quotas) await awayQuotas.refresh(client);
    if (awayWorth(awayFacts(span, away.logged, Date.now()))) away.show(span);
  }

  $effect(() => {
    const absence = companion.senses.absence;
    if (absence) untrack(() => void awayBack(absence));
  });
  if (posing) {
    $effect(() => {
      const pose = posed.away;
      if (pose) untrack(() => away.pose(pose.span, pose.events));
    });
  }
  const awayList = $derived(away.pending ? awayLines(awayFacts(away.pending, away.events, awayNow)) : []);
  const awayShown = $derived(awayList.length > 0 && companion.blocking === 0 && !companion.senses.fullscreen && !companion.focus.active);
  // Everything it told was dealt with, or the recap was turned off: the card goes.
  $effect(() => {
    if (away.pending && (awayList.length === 0 || !companion.prefs.awayRecap)) untrack(() => away.dismiss());
  });
  $effect(() => {
    if (!awayShown) return;
    untrack(() => {
      awayNow = Date.now();
      frame.show(frame.tab);
      frame.hold('away', true);
      // The robot says hello once per absence told.
      if (awayGreeted !== away.pending) {
        awayGreeted = away.pending;
        cheer();
      }
    });
    const tick = setInterval(() => (awayNow = Date.now()), 60_000);
    return () => {
      clearInterval(tick);
      untrack(() => frame.hold('away', false));
    };
  });

  /** A line of the recap: its thread in Boite, or the threads tab, where the reminders and the waiting threads show. */
  function awayOpen(line: AwayLine) {
    if (line.target?.kind === 'thread') void showMain(line.target.threadId).catch(() => {});
    else if (line.target?.kind === 'home') frame.pick('threads');
    away.open(line.key);
  }

  /** Files dropped on any tab go with the next message: the deck turns to the chat. */
  function drop(event: DragEvent) {
    if (companion.dropFiles(event)) frame.pick('chat');
  }
</script>

<svelte:window bind:innerWidth={windowWidth} />

<div class="cluster island-tokens">
<!-- The goo filter melts the drops' black twins and their necks while they move; nothing uses it at rest. -->
<svg class="defs" width="0" height="0" aria-hidden="true">
  <filter id={GOO_FILTER} x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="4" />
    <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
  </filter>
</svg>
<span class="halo" data-glow={frame.glow} data-tone={haloTone} style:border-radius="0 0 {radius}px {radius}px" aria-hidden="true"></span>
{#if sides && companion.timer.current}
  <IslandDrop side="left" {reduced} {onresize} onside={(on) => (onSide = on)}>
    <TimerBubble timer={companion.timer} hover={companion.hover} compact={timerInLine} {onresize} />
  </IslandDrop>
{/if}
<div
  class="island"
  data-hit
  data-testid="island"
  data-size={frame.size}
  data-glow={frame.glow}
  data-swell={swelling || undefined}
  role="region"
  aria-label={copy.label}
  style:width="{box.current.w}px"
  style:height="{box.current.h}px"
  style:border-radius="0 0 {radius}px {radius}px"
  onpointerenter={() => {
    companion.pointerOn = true;
    onSide = false;
  }}
  onpointerleave={() => (companion.pointerOn = false)}
  ondragenter={(event) => companion.attached.dragover(event)}
  ondragover={(event) => companion.attached.dragover(event)}
  ondrop={drop}
>
  {#if frame.size !== 'open'}
    <IslandBar {companion} {frame} {sessions} told={prs.told ?? finishes.line} {cheering} {reduced} bind:want={pill} bind:timerInLine />
  {:else}
    <div class="open" in:bloom={{ reduced }} out:blurAway={{ reduced }} style:max-height="{OPEN_MAX}px" bind:offsetHeight={measured}>
      <Deck {companion} {frame} {bar} {lead} {cheering} {reduced} room={OPEN_MAX - TABS_HEIGHT}>
        {#snippet notice()}
          {#if awayShown && away.pending}
            <AwayCard lines={awayList} span={awaySpan(away.pending.back - away.pending.from)} onopen={awayOpen} ondismiss={() => away.dismiss()} />
          {/if}
        {/snippet}
      </Deck>
    </div>
  {/if}
</div>
{#if settingsPanel.open && frame.size === 'open'}
  <SettingsPanel height={panelHeight(screen.availHeight)} {reduced} late={box.current.w < OPEN_WIDTH - 4} />
{/if}
{#if sides && musicShown}
  <IslandDrop side="right" {reduced} {onresize} onside={(on) => (onSide = on)} tint={{ accent: companion.music.accent, playing: companion.media?.playing === true }}>
    <MusicBubble {companion} {onresize} room={sideRoom} />
  </IslandDrop>
{/if}
</div>

<style>
  .cluster {
    position: relative;
    flex: none;
    font: 13px/1.4 var(--island-font);
    /* Air for the glow and the shadow under it, which the window leaves room for. */
    margin-bottom: 28px;
    /* The island over its drops, the halo over its edge, kept to the cluster. */
    isolation: isolate;
    --island-shadow: 0 6px 16px color-mix(in srgb, var(--island-bg) 30%, transparent), 0 1px 3px color-mix(in srgb, var(--island-bg) 35%, transparent);
  }
  .defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
  /*
   * The halo around the island: it breathes while the user is waited on,
   * flashes once when a turn finished, and stays calm while a reply comes.
   * Over the island, or its shadow would hide it: a shadow outside its box
   * never paints on the island. It swells and gives with the island.
   */
  .halo {
    position: absolute;
    z-index: 2;
    inset: 0;
    opacity: 0;
    transition:
      opacity 360ms ease,
      transform 280ms cubic-bezier(0.34, 1.4, 0.64, 1),
      scale 90ms ease-out;
    pointer-events: none;
  }
  .halo::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--halo) 45%, transparent), 0 8px 28px color-mix(in srgb, var(--halo) 34%, transparent);
  }
  .halo[data-tone='attention'] {
    --halo: var(--island-attention);
  }
  .halo[data-tone='done'] {
    --halo: var(--island-done);
  }
  .halo[data-tone='failed'] {
    --halo: var(--island-danger);
  }
  .halo[data-tone='talking'] {
    --halo: var(--island-talking);
  }
  .halo[data-glow='attention'] {
    opacity: 1;
  }
  .halo[data-glow='attention']::before {
    animation: breathe 2.4s ease-in-out infinite;
  }
  .halo[data-glow='talking'] {
    opacity: 0.75;
  }
  .halo[data-glow='done'],
  .halo[data-glow='failed'] {
    animation: flash 900ms ease-out forwards;
  }

  .island {
    position: relative;
    z-index: 1;
    flex: none;
    overflow: hidden;
    background: var(--island-bg);
    color: var(--island-text);
    box-shadow: var(--island-shadow);
    transition:
      transform 280ms cubic-bezier(0.34, 1.4, 0.64, 1),
      scale 90ms ease-out;
  }
  .island,
  .halo {
    transform-origin: 50% 0;
  }
  /* Hovered, about to open: a small swell. Pressed: it gives a little. */
  .island[data-swell],
  .cluster:has(> .island[data-swell]) > .halo {
    transform: scale(1.03);
    transition:
      opacity 360ms ease,
      transform 620ms cubic-bezier(0.3, 0.1, 0.3, 1),
      scale 90ms ease-out;
  }
  .island:has(:global(.bar:active)),
  .cluster:has(> .island :global(.bar:active)) > .halo {
    scale: 0.98;
  }
  /* The buttons inside give under a press. */
  .island :global(button:active:not(:disabled, .bar)) {
    animation: bots-island-press 90ms ease-out forwards;
  }
  @keyframes -global-bots-island-press {
    to {
      scale: 0.96;
    }
  }

  .open {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--deck-width);
    display: flex;
    flex-direction: column;
    transform-origin: 50% 0;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes flash {
    0% {
      opacity: 0;
    }
    18% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0.8;
    }
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .island,
    .island[data-swell] {
      transform: none;
      transition: none;
    }
    /* The halo keeps its fade, without the swell. */
    .halo,
    .cluster:has(> .island[data-swell]) > .halo {
      transform: none;
      transition: opacity 360ms ease;
    }
    .island:has(:global(.bar:active)),
    .cluster:has(> .island :global(.bar:active)) > .halo {
      scale: none;
    }
    .island :global(button:active:not(:disabled, .bar)) {
      animation: none;
    }
    /* A soft glow that stays while waited on, a fade when a turn finished. */
    .halo[data-glow='attention']::before {
      animation: none;
      opacity: 0.75;
    }
    .halo[data-glow='done'],
    .halo[data-glow='failed'] {
      animation: fade 1.2s ease-out forwards;
    }
  }
</style>
