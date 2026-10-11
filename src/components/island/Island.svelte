<!--
  The island: a black shape hanging from the top of a screen, rounded at the
  bottom only, in three sizes that one spring moves between
  (`lib/island/frame.svelte.ts`):

  - collapsed, a pill with the lead robot and a dot per agent at work, and,
    while a conversation works, its project and step with its task list's
    progress under it (the wheel goes through the ones at work);
  - peek, on hover or when a turn finished, one line of status;
  - open, the tab bar (Home, Chat, Drop; pin, Settings, sound), the robot the
    view talks about on the left, and the view, with the requests waiting
    laid over it.

  Beside the pill and the peek hang two drops: the timer on the left while
  one runs, the music on the right (`music/MusicBubble.svelte`). Each is born
  from the island's edge on a black neck that snaps, and is taken back the
  same way (`lib/island/motion.ts`). Open, the music moves into the tab bar.

  A halo behind it breathes amber while the user is waited on, flashes green
  once when a turn finished, and stays a calm blue-violet while a reply
  comes. A soft shadow under it keeps it apart from light wallpapers. As it
  changes size, the content coming in blooms from a light blur to sharp.

  The views read what they need from the
  view contract (`lib/island/contract.ts`). A press on a robot that moves
  sets it loose on the desktop (`Companion.onpress`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { prefersReducedMotion, Spring } from 'svelte/motion';
  import { House, MessageCircle, Pin, PinOff, Plus, Settings, Volume2, VolumeX } from '@lucide/svelte';
  import type { Companion } from '../../lib/companion/companion.svelte';
  import { writeCompanionPrefs } from '../../lib/companion/prefs';
  import { openSettings, showMain } from '../../lib/companion/shell';
  import { provideView } from '../../lib/island/contract';
  import { HOVER_OPEN_MS, ISLAND_TABS, type IslandFrame, type IslandGlow, type IslandTab } from '../../lib/island/frame.svelte';
  import { bloom, blurAway, GOO_FILTER } from '../../lib/island/motion';
  import { threadLabel } from '../../lib/companion/describe';
  import { posed } from '../../lib/island/posed.svelte';
  import { MemoryWatch } from '../../lib/island/pressure.svelte';
  import { isLive } from '../../lib/island/sessions';
  import { Sessions } from '../../lib/island/sessions.svelte';
  import { UpdateWatch } from '../../lib/island/update.svelte';
  import { liveLine, rowDoing } from '../../lib/island/session-text';
  import { islandStatus } from '../../lib/island/status';
  import { fill, strings } from '../../lib/strings';
  import CompanionCharacter, { type Gaze } from '../companion/CompanionCharacter.svelte';
  import IslandDrop from './IslandDrop.svelte';
  import MusicBubble from './music/MusicBubble.svelte';
  import MusicStrip from './music/MusicStrip.svelte';
  import TimerBubble from './TimerBubble.svelte';
  import AttentionCard from './views/AttentionCard.svelte';
  import QuotasPill from './assistant/QuotasPill.svelte';
  import ChatView from './views/ChatView.svelte';
  import DropView from './views/DropView.svelte';
  import HomeView from './views/HomeView.svelte';
  import MemoryCard from './views/MemoryCard.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    /** The shape moved: the page sends its hit areas again. */
    onresize: () => void;
  }

  let { companion, frame, onresize }: Props = $props();

  const copy = strings.island;
  /** The open island's width, and the most its content takes before it scrolls. */
  const OPEN_WIDTH = 640;
  const OPEN_MAX = 440;
  /** With a diff open in Home: as tall as the window lets it, up to this. The window keeps 60 px under it for the glow and a notice. */
  const OPEN_TALL = 640;
  const WINDOW_SPARE = 60;
  /** The tabs above the view. */
  const TABS_HEIGHT = 48;
  const SIZES = { collapsed: { w: 200, h: 32 }, peek: { w: 360, h: 40 } };
  const RADIUS = 22;
  const CHEER_MS = 1200;
  const GAZE_REACH = { x: 240, y: 180 };
  const ICONS = { home: House, chat: MessageCircle, drop: Plus } as const;

  let measured = $state(0);
  let windowHeight = $state(0);
  let windowWidth = $state(0);
  /** The pointer is on a drop beside the island: the island itself does not peek for it. */
  let onSide = $state(false);
  let cheering = $state(false);
  let robotButton = $state<HTMLButtonElement | null>(null);
  let barFace = $state<HTMLElement | null>(null);

  const lead = $derived(companion.members[0]!);
  const sessions = new Sessions({ client: () => companion.client, threads: () => companion.threads, own: () => companion.ownThreads, held: () => companion.notes.notices.map((notice) => notice.threadId) });
  // An open diff in Home asks for a taller island; the window grows first (`App.svelte`), within the work area.
  $effect(() => {
    frame.tall = frame.size === 'open' && frame.tab === 'home' && sessions.diffShown;
  });
  const openMax = $derived(frame.tall ? Math.max(OPEN_MAX, Math.min(OPEN_TALL, windowHeight - WINDOW_SPARE)) : OPEN_MAX);
  $effect(() => sessions.start());
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
      memory.pose(posed.pressure, posed.stopped);
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
  /** The conversations at work, and the one the wheel picked among them. */
  const liveRows = $derived(sessions.rows.filter(isLive));
  let picked = $state<string | null>(null);
  const leadSession = $derived(liveRows.find((row) => row.id === picked) ?? sessions.lead);
  const live = $derived(leadSession ? liveLine(leadSession, (leadSession.projectId && companion.projects.get(leadSession.projectId)) || '') : null);
  const PEEK = { min: 240, max: 420, chrome: 82 };
  /** The collapsed pill with a conversation at work: its line, the face, the gaps and the padding, and the dots. */
  const LIVE = { min: 200, max: 360, chrome: 74 };
  const WHEEL_REST_MS = 220;
  /** The room between a drop and the island. */
  const SIDE_GAP = 8;
  let statusWidth = $state(0);
  let liveWidth = $state(0);
  // Settles within a quarter pixel: the last frames of a smaller step would move nothing one can see.
  const box = new Spring({ ...SIZES.collapsed }, { stiffness: 0.18, damping: 0.72, precision: 0.25 });
  const radius = $derived(Math.min(RADIUS, box.current.h / 2));
  const status = $derived(
    islandStatus({
      blocking: companion.blocking,
      finished: frame.flashing,
      talking: companion.talking ? (companion.members.find((member) => member.talk.thinking)?.name ?? '') : null,
      busy: companion.busy.length,
      lead: leadSession ? { title: leadSession.title, step: rowDoing(leadSession) } : null
    })
  );
  /** One dot per agent at work, amber first while one waits on the user. */
  const dots = $derived([...(companion.blocking > 0 ? ['attention'] : []), ...companion.busy.slice(0, 5).map(() => 'working')]);
  /** The peek fits its line: the status's own width (`measure`) plus the face, the gaps and the padding, and the dots. */
  const peekWidth = $derived(Math.round(Math.min(PEEK.max, Math.max(PEEK.min, statusWidth + PEEK.chrome + Math.max(0, dots.length * 12 - 5)))));
  const collapsedWidth = $derived(live ? Math.round(Math.min(LIVE.max, Math.max(LIVE.min, liveWidth + LIVE.chrome + Math.max(0, dots.length * 12 - 5)))) : SIZES.collapsed.w);
  const target = $derived(
    frame.size === 'open' ? { w: OPEN_WIDTH, h: Math.min(Math.max(measured, 120), openMax) } : frame.size === 'peek' ? { ...SIZES.peek, w: peekWidth } : { ...SIZES.collapsed, w: collapsedWidth }
  );
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
    if (!frame.hovering || frame.size !== 'peek' || !companion.prefs.openOnHover || companion.dropped || reduced) return;
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
    reveal: (threadId) => showMain(threadId),
    show: (tab) => frame.show(tab),
    sessions,
    memory,
    update
  });

  $effect(() => {
    void box.set(target, { instant: prefersReducedMotion.current });
  });

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

  // The pick lasts while its conversation works.
  $effect(() => {
    if (picked !== null && !liveRows.some((row) => row.id === picked)) picked = null;
  });

  let wheelAt = 0;
  /** The wheel on the pill goes through the conversations at work. */
  function wheel(event: WheelEvent) {
    if (liveRows.length < 2 || event.deltaY === 0) return;
    const at = performance.now();
    if (at - wheelAt < WHEEL_REST_MS) return;
    wheelAt = at;
    const index = Math.max(0, liveRows.findIndex((row) => row.id === leadSession?.id));
    const next = (index + (event.deltaY > 0 ? 1 : -1) + liveRows.length) % liveRows.length;
    picked = liveRows[next]!.id;
  }

  // A turn finished: the lead jumps for joy and the island peeks green.
  let seenDone = -1;
  let cheerTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const done = companion.done;
    untrack(() => {
      if (seenDone === -1 || done === seenDone) return void (seenDone = done);
      seenDone = done;
      frame.flash();
      companion.bounce(lead.id);
      cheering = true;
      clearTimeout(cheerTimer);
      cheerTimer = setTimeout(() => (cheering = false), CHEER_MS);
    });
    return () => clearTimeout(cheerTimer);
  });

  // A reminder rang: the island opens on Home, where it shows, until it is dealt with.
  $effect(() => {
    if (companion.notes.alarms.length === 0) return;
    untrack(() => (frame.tab = 'home'));
    return untrack(() => frame.call('alarm'));
  });

  // The memory guard comes near: the island opens on its card, amber, until it is stopped or set aside.
  $effect(() => {
    if (!memoryCause) return;
    untrack(() => companion.cue('call'));
    return untrack(() => frame.call('memory'));
  });

  function gazeOf(element: HTMLElement | null): Gaze | null {
    const pointer = companion.senses.pointer;
    if (!pointer || !element || companion.dragging) return null;
    const rect = element.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    return { x: clamp((pointer.x - rect.x - rect.width / 2) / GAZE_REACH.x), y: clamp((pointer.y - rect.y - rect.height / 2) / GAZE_REACH.y) };
  }

  function moodOf(talking: boolean, leader: boolean) {
    return talking || (leader && companion.assistant.running) ? 'working' : leader ? companion.mood.mood : 'idle';
  }

  function barClick() {
    if (companion.dropped) return;
    frame.click();
  }

  function robotClick() {
    if (companion.dropped) return;
    companion.poke(companion.active.id);
  }

  function pickTab(tab: IslandTab) {
    frame.tab = tab;
    if (tab === 'chat') void companion.focusInput();
  }

  function toggleSounds() {
    companion.prefs = writeCompanionPrefs({ sounds: !companion.prefs.sounds });
  }

  function drop(event: DragEvent) {
    if (companion.dropFiles(event)) frame.tab = 'chat';
  }
</script>

<svelte:window bind:innerHeight={windowHeight} bind:innerWidth={windowWidth} />

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
    <TimerBubble timer={companion.timer} hover={companion.hover} {onresize} />
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
  <span class="measure" aria-hidden="true" bind:offsetWidth={statusWidth}>{status.text}</span>
  {#if live}<span class="measure live-measure" aria-hidden="true" bind:offsetWidth={liveWidth}><b>{live.name}</b> {live.doing}</span>{/if}
  {#if frame.size !== 'open'}
    <button
      class="bar"
      in:bloom={{ reduced }}
      out:blurAway={{ reduced }}
      data-testid="island-bar"
      aria-expanded="false"
      aria-label={status.text}
      onclick={barClick}
      onpointerdown={(event) => companion.onpress(event, true)}
      onpointermove={companion.onmove}
      onpointerup={companion.onrelease}
      onwheel={wheel}
    >
      <span class="face" bind:this={barFace}>
        <CompanionCharacter
          mood={moodOf(lead.talk.thinking, true)}
          busy={companion.mood.busy}
          alarm={companion.notes.alarms.length > 0}
          cheer={cheering}
          boing={companion.boings[lead.id] ?? 0}
          dizzy={companion.dizzy[lead.id] ?? false}
          gaze={gazeOf(barFace)}
          skin={lead.skin}
          size={frame.size === 'peek' ? 34 : 28}
          {...companion.look}
        />
      </span>
      {#if frame.size === 'peek'}
        <span class="status" in:bloom={{ reduced }} data-tone={status.tone} data-testid="island-status">{status.text}</span>
      {:else if live}
        <span class="live" in:bloom={{ reduced }} data-state={leadSession?.state} data-testid="island-live"><b>{live.name}</b> {live.doing}</span>
      {/if}
      <span class="dots" aria-hidden="true">
        {#each dots as tone, index (index)}<i data-tone={tone}></i>{/each}
      </span>
      {#if frame.size === 'collapsed' && live?.progress}
        <span class="progress" aria-hidden="true"><i style:transform="scaleX({live.progress.toFixed(3)})"></i></span>
      {/if}
    </button>
  {:else}
    <div class="open" in:bloom={{ reduced }} out:blurAway={{ reduced }} style:max-height="{openMax}px" bind:offsetHeight={measured}>
      <nav class="tabs" aria-label={copy.label}>
        <div class="group" role="tablist">
          {#each ISLAND_TABS as tab (tab)}
            {@const Icon = ICONS[tab]}
            <button
              class="tab"
              class:on={frame.tab === tab}
              role="tab"
              aria-selected={frame.tab === tab}
              aria-label={copy.tabs[tab]}
              title={copy.tabs[tab]}
              data-testid="island-tab-{tab}"
              onclick={() => pickTab(tab)}
            >
              <Icon size={15} strokeWidth={1.9} />
            </button>
          {/each}
          {#if companion.blocking > 0}
            <span class="waiting" role="status" title={fill(copy.sessions.waitingCount, { count: String(companion.blocking) })} data-testid="island-waiting">
              <span aria-hidden="true">{companion.blocking}</span>
              <span class="sr">{fill(copy.sessions.waitingCount, { count: String(companion.blocking) })}</span>
            </span>
          {/if}
        </div>
        <div class="middle"><MusicStrip {companion} /></div>
        <div class="group">
          <QuotasPill />
          <button class="tab" class:on={frame.pinned} aria-pressed={frame.pinned} aria-label={frame.pinned ? copy.unpin : copy.pin} title={frame.pinned ? copy.unpin : copy.pin} onclick={() => frame.togglePin()}>
            {#if frame.pinned}<PinOff size={15} strokeWidth={1.9} />{:else}<Pin size={15} strokeWidth={1.9} />{/if}
          </button>
          <button class="tab" aria-label={copy.settings} title={copy.settings} data-testid="island-settings" onclick={() => void openSettings().catch(() => {})}>
            <Settings size={15} strokeWidth={1.9} />
          </button>
          <button class="tab" aria-pressed={!companion.prefs.sounds} aria-label={companion.prefs.sounds ? copy.mute : copy.unmute} title={companion.prefs.sounds ? copy.mute : copy.unmute} data-testid="island-sound" onclick={toggleSounds}>
            {#if companion.prefs.sounds}<Volume2 size={15} strokeWidth={1.9} />{:else}<VolumeX size={15} strokeWidth={1.9} />{/if}
          </button>
        </div>
      </nav>
      <div class="body">
        <div class="robot">
          <button
            bind:this={robotButton}
            class="character"
            aria-label={fill(copy.robot, { name: companion.active.name ?? copy.label })}
            title={companion.active.name ?? undefined}
            data-testid="island-robot"
            onclick={robotClick}
            onpointerdown={(event) => companion.onpress(event, true)}
            onpointermove={companion.onmove}
            onpointerup={companion.onrelease}
          >
            <CompanionCharacter
              mood={moodOf(companion.active.talk.thinking, companion.active.id === lead.id)}
              busy={companion.active.id === lead.id && companion.mood.busy}
              alarm={companion.notes.alarms.length > 0}
              cheer={cheering && companion.active.id === lead.id}
              boing={companion.boings[companion.active.id] ?? 0}
              dizzy={companion.dizzy[companion.active.id] ?? false}
              gaze={gazeOf(robotButton)}
              skin={companion.active.skin}
              size={60}
              {...companion.look}
            />
            {#if companion.blocking > 0}<span class="badge" aria-hidden="true">{companion.blocking}</span>{/if}
          </button>
        </div>
        <div class="view" data-tab={frame.tab} style:max-height="{openMax - TABS_HEIGHT}px">
          <MemoryCard />
          {#if companion.blocking > 0}<AttentionCard />{/if}
          {#if frame.tab === 'home'}
            <HomeView />
          {:else if frame.tab === 'chat'}
            <ChatView />
          {:else}
            <DropView />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
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
  .halo[data-glow='done'] {
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
  .island:has(> .bar:active),
  .cluster:has(> .island > .bar:active) > .halo {
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

  .bar {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px 0 12px;
    border: none;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    touch-action: none;
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
  }
  .status {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    text-align: left;
  }
  .status[data-tone='attention'] { color: var(--island-attention); }
  .status[data-tone='done'] { color: var(--island-done); }
  .status[data-tone='talking'] { color: #b9aefb; }
  .status[data-tone='idle'] { color: var(--island-muted); }
  /* Collapsed, the conversation at work: its project, then what it does. */
  .live {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--island-muted);
    font-size: 12px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .live b {
    color: var(--island-text);
    font-weight: 600;
  }
  .live[data-state='waiting'] b {
    color: var(--island-attention);
  }
  .progress {
    position: absolute;
    right: 16px;
    bottom: 3px;
    left: 16px;
    height: 2px;
    overflow: hidden;
    border-radius: 1px;
    background: rgb(255 255 255 / 0.1);
  }
  .progress i {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--island-working);
    transform-origin: left;
    transition: transform 400ms ease;
  }
  .dots {
    display: flex;
    gap: 5px;
    margin-left: auto;
  }
  .dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-working);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .dots i[data-tone='attention'] {
    background: var(--island-attention);
  }

  .open {
    position: absolute;
    top: 0;
    left: 0;
    width: 640px;
    display: flex;
    flex-direction: column;
    transform-origin: 50% 0;
  }
  .tabs {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 6px;
  }
  .middle {
    display: flex;
    flex: 1;
    justify-content: center;
    min-width: 0;
  }
  .group {
    display: flex;
    gap: 2px;
  }
  .tab {
    display: grid;
    place-items: center;
    width: 34px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }
  .tab:hover {
    color: var(--island-text);
  }
  .tab.on {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .tab:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  /* Requests waiting: a small amber count beside the tabs, gone at zero. */
  .waiting {
    align-self: center;
    min-width: 16px;
    height: 16px;
    margin-left: 4px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--island-attention);
    color: var(--island-attention-ink);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  /* Sizes the peek's one-line status; never seen. */
  .measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    white-space: nowrap;
    font-weight: 500;
    pointer-events: none;
  }
  .live-measure {
    font-size: 12px;
    font-weight: 400;
  }
  .live-measure b {
    font-weight: 600;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .body {
    display: flex;
    gap: 12px;
    min-height: 0;
    padding: 4px 12px 12px;
  }
  .robot {
    flex: none;
    width: 76px;
    display: flex;
    justify-content: center;
    padding-top: 10px;
  }
  .character {
    position: relative;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    touch-action: none;
  }
  .character:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 2px;
    border-radius: 12px;
  }
  .badge {
    position: absolute;
    top: -2px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--island-attention);
    color: #000;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }
  .view {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.15) transparent;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
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
    .dots i {
      animation: none;
    }
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
    .island:has(> .bar:active),
    .cluster:has(> .island > .bar:active) > .halo {
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
    .halo[data-glow='done'] {
      animation: fade 1.2s ease-out forwards;
    }
  }
</style>
