<!--
  The open island, the deck: a tab bar, then the tab chosen.

  The bar holds the robot on the left (a poke, a drag to set it loose, the
  count of requests waiting on it), the tabs (`deck-tabs.ts`) as a tablist
  whose focus moves with the arrows, Home and End, and the island's own
  controls on the right: the quotas, the pin, Settings and the sound.

  Under it, what calls the user comes first, over any tab: the memory
  guard's warning, the requests waiting (`MemoryCard`, `AttentionCard`),
  the missions a reply asks to schedule (`CompanionMissionCards`) and, back
  after a long absence, what happened meanwhile (`AwayCard`).
  Then the tab, alone mounted; another one cross-fades in with a short slide
  the way the bar was travelled. Files dragged over the deck show where they
  go on top of any tab; dropped, the deck turns to the chat (`Island.svelte`).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { FilePlus, Pin, PinOff, Settings, Volume2, VolumeX } from '@lucide/svelte';
  import type { Companion, Member } from '../../../lib/companion/companion.svelte';
  import { writeCompanionPrefs } from '../../../lib/companion/prefs';
  import { openSettings } from '../../../lib/companion/shell';
  import { DECK_TABS, tabKey, travel, type DeckTab } from '../../../lib/island/deck-tabs';
  import { gazeOf, moodOf } from '../../../lib/island/face';
  import type { IslandFrame } from '../../../lib/island/frame.svelte';
  import { fill, strings } from '../../../lib/strings';
  import CompanionCharacter from '../../companion/CompanionCharacter.svelte';
  import CompanionMissionCards from '../../companion/CompanionMissionCards.svelte';
  import QuotasPill from '../assistant/QuotasPill.svelte';
  import AttentionCard from '../views/AttentionCard.svelte';
  import MemoryCard from '../views/MemoryCard.svelte';
  import AppsTab from './tabs/AppsTab.svelte';
  import ChatTab from './tabs/ChatTab.svelte';
  import ClipboardTab from './tabs/ClipboardTab.svelte';
  import MusicTab from './tabs/MusicTab.svelte';
  import StatsTab from './tabs/StatsTab.svelte';
  import SystemTab from './tabs/SystemTab.svelte';
  import ThreadsTab from './tabs/ThreadsTab.svelte';
  import TodayTab from './tabs/TodayTab.svelte';
  import WallpaperTab from './tabs/WallpaperTab.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    lead: Member;
    cheering: boolean;
    reduced: boolean;
    /** The most the tab below the bar takes before it scrolls. */
    room: number;
    /** Shown under the requests, over the tab: the recap of an absence. */
    notice?: Snippet;
  }

  let { companion, frame, lead, cheering, reduced, room, notice }: Props = $props();

  const copy = strings.island;
  const PANES = { threads: ThreadsTab, today: TodayTab, chat: ChatTab, stats: StatsTab, music: MusicTab, apps: AppsTab, clipboard: ClipboardTab, wallpaper: WallpaperTab, system: SystemTab } as const;
  /** The slide between two tabs, and its length. */
  const SLIDE_PX = 8;
  const SLIDE_MS = 200;

  let robotButton = $state<HTMLButtonElement | null>(null);
  const tabButtons: Partial<Record<DeckTab, HTMLButtonElement>> = {};

  // Which way the bar was travelled, read by the panes coming and going.
  let shown: DeckTab | null = null;
  let way: -1 | 0 | 1 = 0;
  const tab = $derived.by(() => {
    const next = frame.tab;
    way = shown === null ? 0 : travel(shown, next);
    shown = next;
    return next;
  });

  /** Coming in from the side the bar went to, leaving to the other; a plain fade with reduced motion. */
  function shift(_node: Element, { away }: { away: boolean }) {
    if (reduced) return { duration: 160, css: (t: number) => `opacity: ${t}` };
    const from = (away ? -way : way) * SLIDE_PX;
    return { duration: SLIDE_MS, easing: cubicOut, css: (t: number, u: number) => `opacity: ${t}; transform: translateX(${(u * from).toFixed(2)}px)` };
  }

  function pick(next: DeckTab) {
    frame.pick(next);
    if (next === 'chat') void companion.focusInput();
  }

  function keys(event: KeyboardEvent, from: DeckTab) {
    const next = tabKey(event.key, from);
    if (!next) return;
    event.preventDefault();
    pick(next);
    tabButtons[next]?.focus();
  }

  function robotClick() {
    if (companion.dropped) return;
    companion.poke(companion.active.id);
  }

  function toggleSounds() {
    companion.prefs = writeCompanionPrefs({ sounds: !companion.prefs.sounds });
  }

  const waitingSaid = $derived(fill(copy.sessions.waitingCount, { count: String(companion.blocking) }));
</script>

<div class="tabbar">
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
    <!-- Its eyes follow the pointer while it is on the island, and it cheers when any thread finishes. -->
    <CompanionCharacter
      mood={moodOf(companion, companion.active.talk.thinking, companion.active.id === lead.id)}
      busy={companion.active.id === lead.id && companion.mood.busy}
      alarm={companion.notes.alarms.length > 0}
      cheer={cheering}
      boing={companion.boings[companion.active.id] ?? 0}
      dizzy={companion.dizzy[companion.active.id] ?? false}
      gaze={companion.pointerOn ? gazeOf(companion, robotButton) : null}
      skin={companion.active.skin}
      size={34}
      {...companion.look}
    />
    {#if companion.blocking > 0}
      <span class="badge" role="status" title={waitingSaid} data-testid="island-waiting">
        <span aria-hidden="true">{companion.blocking}</span>
        <span class="sr">{waitingSaid}</span>
      </span>
    {/if}
  </button>

  <div class="tabs" role="tablist" aria-label={copy.deck.tablist}>
    {#each DECK_TABS as each (each)}
      <button
        bind:this={tabButtons[each]}
        id="deck-tab-{each}"
        class="tab"
        role="tab"
        aria-selected={tab === each}
        aria-controls="deck-panel"
        tabindex={tab === each ? 0 : -1}
        data-testid="deck-tab-button-{each}"
        onclick={() => pick(each)}
        onkeydown={(event) => keys(event, each)}
      >
        {copy.deck.tabs[each]}
        {#if each === 'music' && companion.media?.playing}<span class="playing" title={copy.deck.playing}><span class="sr">{copy.deck.playing}</span></span>{/if}
      </button>
    {/each}
  </div>

  <div class="tools">
    <QuotasPill compact />
    <button class="tool" class:on={frame.pinned} aria-pressed={frame.pinned} aria-label={frame.pinned ? copy.unpin : copy.pin} title={frame.pinned ? copy.unpin : copy.pin} onclick={() => frame.togglePin()}>
      {#if frame.pinned}<PinOff size={15} strokeWidth={1.9} />{:else}<Pin size={15} strokeWidth={1.9} />{/if}
    </button>
    <button class="tool" aria-label={copy.settings} title={copy.settings} data-testid="island-settings" onclick={() => void openSettings().catch(() => {})}>
      <Settings size={15} strokeWidth={1.9} />
    </button>
    <button class="tool" aria-pressed={!companion.prefs.sounds} aria-label={companion.prefs.sounds ? copy.mute : copy.unmute} title={companion.prefs.sounds ? copy.mute : copy.unmute} data-testid="island-sound" onclick={toggleSounds}>
      {#if companion.prefs.sounds}<Volume2 size={15} strokeWidth={1.9} />{:else}<VolumeX size={15} strokeWidth={1.9} />{/if}
    </button>
  </div>
</div>

<div class="body" style:max-height="{room}px">
  <MemoryCard />
  {#if companion.blocking > 0}<AttentionCard />{/if}
  {#if companion.missions.pending.length > 0}<CompanionMissionCards missions={companion.missions} />{/if}
  {@render notice?.()}
  <div class="stage" id="deck-panel" role="tabpanel" aria-labelledby="deck-tab-{tab}" data-tab={tab} data-testid="deck-panel">
    {#each [tab] as current (current)}
      {@const Pane = PANES[current]}
      <div class="pane" in:shift={{ away: false }} out:shift={{ away: true }}><Pane /></div>
    {/each}
    {#if companion.attached.over}
      <div class="dropping" aria-hidden="true">
        <FilePlus size={26} strokeWidth={1.6} />
        <p>{copy.drop.title}</p>
        <p class="hint">{copy.deck.drop}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .tabbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 52px;
    padding: 0 12px 0 14px;
  }
  .character {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    touch-action: none;
  }
  .character:focus-visible,
  .tab:focus-visible,
  .tool:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  .character:focus-visible {
    border-radius: 12px;
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--island-attention);
    color: var(--island-attention-ink);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .tabs {
    display: flex;
    flex: 1;
    justify-content: center;
    gap: 2px;
    min-width: 0;
  }
  .tab {
    position: relative;
    flex: none;
    height: 28px;
    padding: 0 9px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease;
  }
  .tab:hover {
    color: var(--island-text);
  }
  .tab[aria-selected='true'] {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  /* Music playing: a still dot by the tab's name. */
  .playing {
    position: absolute;
    top: 6px;
    right: 3px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--deck-accent);
  }
  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }
  .tool {
    display: grid;
    place-items: center;
    width: 30px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease;
  }
  .tool:hover {
    color: var(--island-text);
  }
  .tool.on {
    background: var(--island-pill);
    color: var(--island-text);
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
    flex-direction: column;
    gap: var(--deck-gap);
    min-height: 0;
    padding: 0 12px 12px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  .stage {
    position: relative;
    display: grid;
    min-height: 0;
  }
  /* The tab coming and the one going share the place while they cross. */
  .pane {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .dropping {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1.5px dashed var(--deck-accent);
    border-radius: var(--deck-tile-radius);
    background: color-mix(in srgb, var(--island-bg) 86%, transparent);
    color: var(--deck-accent-ink);
    text-align: center;
    pointer-events: none;
  }
  .dropping p {
    margin: 0;
    font-weight: 600;
  }
  .dropping .hint {
    color: var(--island-muted);
    font-size: 12px;
    font-weight: 400;
  }
  @media (prefers-reduced-motion: reduce) {
    .tab,
    .tool {
      transition: none;
    }
  }
</style>
