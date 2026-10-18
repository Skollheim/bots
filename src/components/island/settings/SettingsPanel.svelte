<!--
  The settings panel (`lib/island/settings-panel.svelte.ts`): it grows out of
  the open deck, under its bar, on the deck's black with its corners and its
  shadow. A rail of sections on the left, the section on the right, scrolling
  inside the panel. The deck's gear toggles it; Escape (`App.svelte`), a press
  elsewhere in the window and a click outside it close it.

  It reaches Boite on its own connection (`lib/core.svelte.ts`), opened the
  first time the panel shows and kept for the page's life: the agents, models
  and projects the sections offer. The preferences are this computer's
  (`lib/companion/prefs.ts`), written as each one changes.

  It opens with a reveal from the bar down (clip-path), a short slide and a
  fade, all composited: nothing animates its size. With the island at the
  bottom of the screen, the island grows up to hold it under the bar, and it
  rises from the screen's edge instead. At a side, it keeps to that side.
-->
<script module lang="ts">
  import { CoreLink } from '../../../lib/core.svelte';

  let shared: CoreLink | null = null;

  /** The panel's connection to Boite: one per page, opened when first needed. */
  function coreLink(): CoreLink {
    if (shared) return shared;
    const link = new CoreLink();
    const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('fake') === '1';
    void link.start(demo ? async () => new (await import('../../../lib/fake-client')).FakeClient() : undefined);
    return (shared = link);
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { fade, type TransitionConfig } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { Bell, Bot, Brain, CalendarClock, ClipboardList, LayoutPanelTop, ShieldCheck, SlidersHorizontal, Timer, Users } from '@lucide/svelte';
  import InfoTip from '@boite/ui/components/InfoTip.svelte';
  import { fill, strings } from '../../../lib/strings';
  import { CREW_MAX, readCompanionPrefs, subscribeCompanionPrefs, writeCompanionPrefs, type CompanionPrefs } from '../../../lib/companion/prefs';
  import { listenShell } from '../../../lib/companion/shell';
  import { readWindowsPrefs, subscribeWindowsPrefs, writeWindowsPrefs } from '../../../lib/windows/prefs';
  import { SETTINGS_SECTIONS, settingsPanel, stepSection, type SettingsSection } from '../../../lib/island/settings-panel.svelte';
  import CompanionAllowRules from '../../companion/CompanionAllowRules.svelte';
  import CompanionCrewSettings from '../../companion/CompanionCrewSettings.svelte';
  import CompanionMissions from '../../companion/CompanionMissions.svelte';
  import CompanionReminders from '../../companion/CompanionReminders.svelte';
  import BrainSettings from './BrainSettings.svelte';
  import FocusSection from './FocusSection.svelte';
  import IslandSection from './IslandSection.svelte';
  import MascotSection from './MascotSection.svelte';
  import PlaceSection from './PlaceSection.svelte';
  import SettingSwitch from './SettingSwitch.svelte';

  interface Props {
    /** The panel's height, decided before it shows (`panelHeight`). */
    height: number;
    reduced: boolean;
    /** The island is still opening: the panel waits for it to reach the deck's width. */
    late: boolean;
    /** The island stands on the bottom edge of the screen. */
    bottom: boolean;
    side: 'left' | 'center' | 'right';
  }

  let { height, reduced, late, bottom, side }: Props = $props();

  const ICONS = { place: LayoutPanelTop, mascot: Bot, crew: Users, brain: Brain, island: SlidersHorizontal, clipboard: ClipboardList, focus: Timer, reminders: Bell, missions: CalendarClock, permissions: ShieldCheck } as const;
  /** How long the island takes to reach the deck's width once it opens. */
  const LATE_MS = 160;

  const copy = $derived(strings.island.settingsPanel);
  const sets = $derived(strings.companion.settings);
  const store = coreLink();

  let prefs = $state<CompanionPrefs>(readCompanionPrefs());
  $effect(() => subscribeCompanionPrefs((next) => (prefs = next)));
  // The deck's computer tabs keep their own prefs (`lib/windows/prefs.ts`).
  let windowsPrefs = $state(readWindowsPrefs());
  $effect(() => subscribeWindowsPrefs((next) => (windowsPrefs = next)));

  function save(patch: Partial<CompanionPrefs>) {
    prefs = writeCompanionPrefs(patch);
  }

  /** What a section says behind its title's "i", when it says more than its rows. */
  const hints = $derived<Partial<Record<SettingsSection, string>>>({
    mascot: sets.mascotHint,
    crew: fill(sets.crew.hint, { count: String(CREW_MAX) }),
    brain: sets.brainHint,
    focus: sets.pomodoroHint,
    missions: sets.missionsHint,
    permissions: strings.island.allow.lead
  });
  const section = $derived(settingsPanel.section);
  const hint = $derived(hints[section] ?? null);

  let panel = $state<HTMLElement>();
  let pane = $state<HTMLElement>();
  const tabs = $state<Partial<Record<SettingsSection, HTMLButtonElement>>>({});

  // Opened: the keyboard comes to the panel, so Escape works at once; Tab reaches the rail.
  $effect(() => {
    void tick().then(() => panel?.focus({ preventScroll: true }));
  });

  // A press elsewhere in the window, the gear aside (it toggles), or a click outside it closes the panel.
  $effect(() => {
    const press = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || panel?.contains(target) || target.closest('[data-settings-toggle]')) return;
      settingsPanel.close();
    };
    document.addEventListener('pointerdown', press, true);
    let stopOutside: (() => void) | null = null;
    let gone = false;
    void listenShell('outside', () => settingsPanel.close()).then((stop) => (gone ? stop() : (stopOutside = stop)));
    return () => {
      gone = true;
      document.removeEventListener('pointerdown', press, true);
      stopOutside?.();
    };
  });

  function pick(next: SettingsSection) {
    if (next === settingsPanel.section) return;
    settingsPanel.pick(next);
    if (pane) pane.scrollTop = 0;
  }

  function railKey(event: KeyboardEvent) {
    const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    const to = by !== 0 ? stepSection(settingsPanel.section, by) : event.key === 'Home' ? SETTINGS_SECTIONS[0] : event.key === 'End' ? SETTINGS_SECTIONS.at(-1)! : null;
    if (!to) return;
    event.preventDefault();
    pick(to);
    tabs[to]?.focus({ preventScroll: true });
  }

  /** The panel unfolds from the bar down, or up from the screen's bottom edge: a clip-path reveal, a short slide, a fade. */
  function unfold(_node: Element, { leaving = false } = {}): TransitionConfig {
    if (reduced) return { duration: 120, css: (t) => `opacity: ${t}` };
    return {
      delay: leaving || !late ? 0 : LATE_MS,
      duration: leaving ? 170 : 280,
      easing: leaving ? cubicIn : cubicOut,
      css: (t, u) =>
        bottom
          ? `opacity: ${Math.min(1, t * 1.8)}; transform: translateY(${(12 * u).toFixed(2)}px); clip-path: inset(${(u * 100).toFixed(2)}% 0 0 0);`
          : `opacity: ${Math.min(1, t * 1.8)}; transform: translateY(${(-12 * u).toFixed(2)}px); clip-path: inset(0 0 ${(u * 100).toFixed(2)}% 0 round 0 0 var(--deck-radius) var(--deck-radius));`
    };
  }
</script>

<div
  class="settings-panel"
  class:bottom
  data-side={side}
  bind:this={panel}
  data-hit
  data-testid="island-settings-panel"
  role="dialog"
  aria-label={strings.island.settings}
  tabindex="-1"
  style:height="{height}px"
  in:unfold
  out:unfold={{ leaving: true }}
>
  <div class="rail" role="tablist" aria-orientation="vertical" aria-label={copy.sections} tabindex="-1" onkeydown={railKey}>
    {#each SETTINGS_SECTIONS as id (id)}
      {@const Icon = ICONS[id]}
      <button
        type="button"
        role="tab"
        id="settings-tab-{id}"
        aria-selected={section === id}
        aria-controls="settings-pane"
        tabindex={section === id ? 0 : -1}
        class:on={section === id}
        bind:this={tabs[id]}
        onclick={() => pick(id)}
        data-testid="settings-section-{id}"
      >
        <Icon size={15} strokeWidth={1.9} aria-hidden="true" /><span>{copy.names[id]}</span>
      </button>
    {/each}
  </div>
  <div class="pane" id="settings-pane" role="tabpanel" aria-labelledby="settings-tab-{section}" bind:this={pane} data-testid="companion-settings">
    {#key section}
      <div class="section" in:fade={{ duration: reduced ? 0 : 140 }}>
        <header>
          <h2 class="ui-label-box"><span class="ui-label">{copy.names[section]}</span>{#if hint}<InfoTip topic={copy.names[section]} text={hint} />{/if}</h2>
        </header>
        {#if store.waiting && (section === 'crew' || section === 'brain' || section === 'missions')}
          <p class="hint">{strings.bots.waiting}</p>
        {/if}
        {#if section === 'place'}
          <PlaceSection {prefs} {save} />
        {:else if section === 'mascot'}
          <MascotSection {prefs} {save} />
        {:else if section === 'crew'}
          <div class="crew"><CompanionCrewSettings {store} {prefs} /></div>
        {:else if section === 'brain'}
          <BrainSettings {store} {prefs} {save} />
        {:else if section === 'island'}
          <IslandSection {store} {prefs} {save} />
        {:else if section === 'clipboard'}
          <div class="card">
            <SettingSwitch label={sets.clipboardHistory} hint={sets.clipboardHistoryHint} checked={windowsPrefs.clipboard} onchange={(clipboard) => writeWindowsPrefs({ clipboard })} testid="companion-clipboard-history" />
          </div>
        {:else if section === 'focus'}
          <FocusSection {prefs} {save} />
        {:else if section === 'reminders'}
          <CompanionReminders />
        {:else if section === 'missions'}
          <CompanionMissions {store} />
        {:else}
          <CompanionAllowRules />
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  /*
   * Under the deck's bar, the deck's width, its black, its lower corners and
   * its shadow: the island grown longer. Centred without a transform, which
   * the reveal animates.
   */
  .settings-panel {
    position: absolute;
    z-index: 3;
    top: 52px;
    left: 50%;
    width: var(--deck-width);
    margin-left: calc(var(--deck-width) / -2);
    display: grid;
    grid-template-columns: 188px minmax(0, 1fr);
    background: var(--island-bg);
    color: var(--island-text);
    border-radius: 0 0 var(--deck-radius) var(--deck-radius);
    border-top: 1px solid var(--island-line);
    box-shadow: var(--island-shadow);
    font: 13px/1.4 var(--island-font);
    outline: none;
    /* Boite's controls on the deck's black: flat fields, no glaze. */
    --control-glaze: none;
    --color-control-surface: var(--deck-field);
    --color-control-hover: color-mix(in srgb, var(--deck-field) 88%, var(--island-text));
    --color-edge: var(--island-line);
  }
  /* Inside the island, which stands on the screen's bottom edge: under the bar, down to the edge. */
  .settings-panel.bottom {
    top: auto;
    bottom: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .settings-panel[data-side='left'] {
    left: 0;
    margin-left: 0;
  }
  .settings-panel[data-side='right'] {
    left: auto;
    right: 0;
    margin-left: 0;
  }
  .settings-panel :global(button) {
    box-shadow: none;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 10px 16px 14px;
    overflow-y: auto;
    scrollbar-width: none;
    outline: none;
  }
  .rail button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    min-height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--island-muted);
    font-size: 13px;
    font-weight: 500;
    text-align: start;
    transition:
      background-color 140ms ease,
      color 140ms ease;
  }
  .rail button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail button:hover {
    background: var(--deck-tile);
    color: var(--island-text);
  }
  .rail button.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .rail button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: -2px;
  }

  .pane {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 18px 18px 6px;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--deck-gap);
  }
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    min-height: 50px;
    padding-top: 2px;
    background: var(--island-bg);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* The sections' cards: the deck's tiles, one row per setting. */
  .pane :global(.card) {
    margin: 0;
    padding: 2px 16px;
    border: none;
    border-radius: var(--deck-tile-radius);
    background: var(--deck-tile);
    box-shadow: var(--island-card-edge);
  }
  .pane :global(.switch-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    padding: 8px 0;
  }
  .pane :global(.switch-row + .switch-row) {
    border-top: 1px solid var(--island-line);
  }
  .pane :global(.switch-row .text) {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--island-text);
    font-size: 13px;
    font-weight: 500;
  }
  .pane :global(.hint) {
    margin: 0;
    color: var(--island-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  /* A card that is a list, or a picker, keeps some air at its edges. */
  .pane :global(.card:has(> .list)) {
    padding-block: 6px;
  }
  .pane :global(.card.mascot) {
    padding-block: 14px;
  }
  .pane > .section > .hint {
    padding: 0 4px;
  }
  /* The crew's own title is the section's. */
  .crew :global([data-testid='companion-crew'] > h2) {
    display: none;
  }
  .crew :global([data-testid='companion-crew']) {
    padding-block: 12px 14px;
  }

  @media (prefers-reduced-motion: reduce) {
    .rail button {
      transition: none;
    }
  }
</style>
