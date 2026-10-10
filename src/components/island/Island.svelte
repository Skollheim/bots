<!--
  The island: a black shape hanging from the top of a screen, rounded at the
  bottom only, in three sizes that one spring moves between
  (`lib/island/frame.svelte.ts`):

  - collapsed, a pill with the lead robot and a dot per agent at work;
  - peek, on hover or when a turn finished, one line of status;
  - open, the tab bar (Home, Chat, Drop; pin, Settings, sound), the robot the
    view talks about on the left, and the view, with the requests waiting
    laid over it.

  It glows amber while the user is waited on, green when a turn finished,
  blue-violet while a reply comes. The views read what they need from the
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
  import { ISLAND_TABS, type IslandFrame, type IslandTab } from '../../lib/island/frame.svelte';
  import { currentStep } from '../../lib/island/sessions';
  import { Sessions } from '../../lib/island/sessions.svelte';
  import { stepText } from '../../lib/island/session-text';
  import { islandStatus } from '../../lib/island/status';
  import { fill, strings } from '../../lib/strings';
  import CompanionCharacter, { type Gaze } from '../companion/CompanionCharacter.svelte';
  import AttentionCard from './views/AttentionCard.svelte';
  import ChatView from './views/ChatView.svelte';
  import DropView from './views/DropView.svelte';
  import HomeView from './views/HomeView.svelte';

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
  const SIZES = { collapsed: { w: 200, h: 32 }, peek: { w: 360, h: 40 } };
  const RADIUS = 22;
  const CHEER_MS = 1200;
  const GAZE_REACH = { x: 240, y: 180 };
  const ICONS = { home: House, chat: MessageCircle, drop: Plus } as const;

  let measured = $state(0);
  let cheering = $state(false);
  let robotButton = $state<HTMLButtonElement | null>(null);
  let barFace = $state<HTMLElement | null>(null);

  const lead = $derived(companion.members[0]!);
  const sessions = new Sessions({ client: () => companion.client, threads: () => companion.threads, own: () => companion.ownThreads });
  $effect(() => sessions.start());
  const leadSession = $derived(sessions.lead);
  const leadStep = $derived(leadSession ? currentStep(leadSession) : null);
  const PEEK = { min: 240, max: 420, chrome: 82 };
  let statusWidth = $state(0);
  const box = new Spring({ ...SIZES.collapsed }, { stiffness: 0.18, damping: 0.72 });
  const radius = $derived(Math.min(RADIUS, box.current.h / 2));
  const status = $derived(
    islandStatus({
      blocking: companion.blocking,
      finished: frame.flashing,
      talking: companion.talking ? (companion.members.find((member) => member.talk.thinking)?.name ?? '') : null,
      busy: companion.busy.length,
      lead: leadSession ? { title: leadSession.title, step: leadStep ? stepText(leadStep) : (leadSession.task ?? leadSession.detail) } : null
    })
  );
  /** One dot per agent at work, amber first while one waits on the user. */
  const dots = $derived([...(companion.blocking > 0 ? ['attention'] : []), ...companion.busy.slice(0, 5).map(() => 'working')]);
  /** The peek fits its line: the status's own width (`measure`) plus the face, the gaps and the padding, and the dots. */
  const peekWidth = $derived(Math.round(Math.min(PEEK.max, Math.max(PEEK.min, statusWidth + PEEK.chrome + Math.max(0, dots.length * 12 - 5)))));
  const target = $derived(frame.size === 'open' ? { w: OPEN_WIDTH, h: Math.min(Math.max(measured, 120), OPEN_MAX) } : frame.size === 'peek' ? { ...SIZES.peek, w: peekWidth } : SIZES[frame.size]);

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
    sessions
  });

  $effect(() => {
    void box.set(target, { instant: prefersReducedMotion.current });
  });

  // Each step of the spring moves the hit area; the page sends only what changed.
  $effect(() => {
    void [box.current.w, box.current.h];
    untrack(onresize);
  });

  $effect(() => {
    const over = companion.hover;
    untrack(() => frame.hover(over));
  });

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

  function gazeOf(element: HTMLElement | null): Gaze | null {
    const pointer = companion.senses.pointer;
    if (!pointer || !element || companion.dragging) return null;
    const rect = element.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    return { x: clamp((pointer.x - rect.x - rect.width / 2) / GAZE_REACH.x), y: clamp((pointer.y - rect.y - rect.height / 2) / GAZE_REACH.y) };
  }

  function moodOf(talking: boolean, leader: boolean) {
    return talking ? 'working' : leader ? companion.mood.mood : 'idle';
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

<div
  class="island island-tokens"
  data-hit
  data-testid="island"
  data-size={frame.size}
  data-glow={frame.glow}
  role="region"
  aria-label={copy.label}
  style:width="{box.current.w}px"
  style:height="{box.current.h}px"
  style:border-radius="0 0 {radius}px {radius}px"
  onpointerenter={() => (companion.pointerOn = true)}
  onpointerleave={() => (companion.pointerOn = false)}
  ondragenter={(event) => companion.attached.dragover(event)}
  ondragover={(event) => companion.attached.dragover(event)}
  ondrop={drop}
>
  <span class="measure" aria-hidden="true" bind:offsetWidth={statusWidth}>{status.text}</span>
  {#if frame.size !== 'open'}
    <button
      class="bar"
      data-testid="island-bar"
      aria-expanded="false"
      aria-label={status.text}
      onclick={barClick}
      onpointerdown={(event) => companion.onpress(event, true)}
      onpointermove={companion.onmove}
      onpointerup={companion.onrelease}
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
        <span class="status" data-tone={status.tone} data-testid="island-status">{status.text}</span>
      {/if}
      <span class="dots" aria-hidden="true">
        {#each dots as tone, index (index)}<i data-tone={tone}></i>{/each}
      </span>
    </button>
  {:else}
    <div class="open" bind:offsetHeight={measured}>
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
        <div class="group">
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
        <div class="view" data-tab={frame.tab}>
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

<style>
  .island {
    position: relative;
    flex: none;
    overflow: hidden;
    background: var(--island-bg);
    color: var(--island-text);
    font: 13px/1.4 var(--island-font);
    transition: box-shadow 360ms ease;
    /* Air for the glow under it, which the window leaves room for. */
    margin-bottom: 28px;
  }
  .island[data-glow='attention'] {
    box-shadow: 0 0 0 1px rgb(245 165 36 / 0.45), 0 8px 28px rgb(245 165 36 / 0.32);
  }
  .island[data-glow='done'] {
    box-shadow: 0 0 0 1px rgb(52 211 153 / 0.4), 0 8px 26px rgb(52 211 153 / 0.28);
  }
  .island[data-glow='talking'] {
    box-shadow: 0 0 0 1px rgb(139 124 246 / 0.4), 0 8px 26px rgb(139 124 246 / 0.3);
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
    animation: appear 220ms ease-out;
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
    max-height: 440px;
    display: flex;
    flex-direction: column;
    animation: appear 260ms ease-out;
  }
  .tabs {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px 6px;
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
    max-height: 392px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.15) transparent;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar,
    .open,
    .dots i {
      animation: none;
    }
  }
</style>
