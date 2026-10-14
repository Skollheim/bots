<!--
  The open island, the deck: its bar (`DeckBar.svelte`), then the tab chosen.

  The bar holds the robot, the tabs and shortcuts the user keeps there
  (`lib/island/bar.ts`) and the island's controls. In its edit mode, what
  the bar can take shows here in place of the tab (`BarPalette.svelte`).

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
  import { fade } from 'svelte/transition';
  import { FilePlus } from '@lucide/svelte';
  import type { Companion, Member } from '../../../lib/companion/companion.svelte';
  import { barTabs } from '../../../lib/island/bar';
  import type { Bar } from '../../../lib/island/bar.svelte';
  import { travel, type DeckTab } from '../../../lib/island/deck-tabs';
  import type { IslandFrame } from '../../../lib/island/frame.svelte';
  import { strings } from '../../../lib/strings';
  import CompanionMissionCards from '../../companion/CompanionMissionCards.svelte';
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
  import BarPalette from './BarPalette.svelte';
  import DeckBar from './DeckBar.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    /** What the bar holds, as the user arranged it. */
    bar: Bar;
    lead: Member;
    cheering: boolean;
    reduced: boolean;
    /** The most the tab below the bar takes before it scrolls. */
    room: number;
    /** Shown under the requests, over the tab: the recap of an absence. */
    notice?: Snippet;
  }

  let { companion, frame, bar, lead, cheering, reduced, room, notice }: Props = $props();

  const copy = strings.island;
  const PANES = { threads: ThreadsTab, today: TodayTab, chat: ChatTab, stats: StatsTab, music: MusicTab, apps: AppsTab, clipboard: ClipboardTab, wallpaper: WallpaperTab, system: SystemTab } as const;
  /** The slide between two tabs, and its length. */
  const SLIDE_PX = 8;
  const SLIDE_MS = 200;

  // Which way the bar was travelled, read by the panes coming and going.
  let shown: DeckTab | null = null;
  let way: -1 | 0 | 1 = 0;
  const tab = $derived.by(() => {
    const next = frame.tab;
    way = shown === null ? 0 : travel(shown, next, barTabs(bar.layout));
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
</script>

<DeckBar {companion} {frame} {bar} {lead} {cheering} {reduced} {tab} onpick={pick} />

<div class="body" style:max-height="{room}px">
  <MemoryCard />
  {#if companion.blocking > 0}<AttentionCard />{/if}
  {#if companion.missions.pending.length > 0}<CompanionMissionCards missions={companion.missions} />{/if}
  {@render notice?.()}
  <div class="stage" id="deck-panel" role="tabpanel" aria-labelledby="deck-tab-{tab}" data-tab={tab} data-testid="deck-panel">
    {#if frame.editing}
      <div class="pane" in:shift={{ away: false }}><BarPalette {bar} /></div>
    {:else}
      {#each [tab] as current (current)}
        {@const Pane = PANES[current]}
        <div class="pane" in:shift={{ away: false }} out:shift={{ away: true }}><Pane /></div>
      {/each}
    {/if}
    {#if companion.attached.over}
      <div class="dropping" aria-hidden="true" transition:fade={{ duration: reduced ? 0 : 140 }} data-testid="deck-dropping">
        <FilePlus size={26} strokeWidth={1.6} />
        <p>{copy.drop.title}</p>
        <p class="hint">{copy.deck.drop}</p>
      </div>
    {/if}
  </div>
</div>

<style>
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
</style>
