<!--
  The companion's window (`companion_window.rs`): transparent and frameless,
  on a screen. Only the areas marked `data-hit` take clicks; the rest of the
  window lets them through to what is under it.

  It draws one companion (`lib/companion/companion.svelte.ts`) in one of two
  ways, as the user chose: the island at the top or the bottom of the screen
  (`components/island/`), or the robots loose on the desktop
  (`components/desktop/`). Dragging a robot out of the island sets it loose;
  dragging it back near the island, or "Back to the island", returns it.
  The shell places the window for either (`island_place`, `companion_place`).
  Dragging the pill moves the island to another of its six places
  (`lib/island/move.svelte.ts`), on its screen or another: the window spans
  the screen under the pointer meanwhile.

  The settings are a panel of the island (`island/settings/SettingsPanel.svelte`):
  asked for from the tray, a gear or "Make an agent", the island opens for
  them, drawn for them even while the robots are loose, and held open while
  they show.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { startTheme } from '@boite/ui/lib/theme';
  import { strings } from './lib/strings';
  import BotsNotice from './components/BotsNotice.svelte';
  import { writeStatus } from './lib/companion/memory';
  import { captureZone, type ScreenShot } from './lib/companion/screen';
  import { companionHitRects, configureCompanion, coverScreen, inShell, layoutOf, listenShell, placeCompanion, placeIsland, spanIsland, type CompanionLayout, type HitRect, type IslandPlaced } from './lib/companion/shell';
  import { writeCompanionPrefs } from './lib/companion/prefs';
  import { Companion } from './lib/companion/companion.svelte';
  import { IslandFrame } from './lib/island/frame.svelte';
  import { IslandMove } from './lib/island/move.svelte';
  import { PLACE_MARGIN, placeLayout } from './lib/island/place';
  import { readBar, readBarEdit, shownTab, subscribeBarEdit, writeBarEdit } from './lib/island/bar';
  import { readDeckTab, writeDeckTab } from './lib/island/deck-tabs';
  import { answerSettings, panelWindowHeight, requestSettings, settingsPanel } from './lib/island/settings-panel.svelte';
  import CompanionZone from './components/companion/CompanionZone.svelte';
  import DesktopCompanion from './components/desktop/DesktopCompanion.svelte';
  import Island from './components/island/Island.svelte';
  import { clipboardHistory } from './lib/windows/clipboard.svelte';

  const HIT_PAD = 6;
  /** The island's window: the open island, the deck (860 × 470 at most), its glow, a notice under it, and the drops on its sides (the music player, up to 276 wide). */
  const ISLAND_WINDOW = { width: 940, open: 530, closed: 150 };
  /** The window shrinks once the island's spring has closed it. */
  const SHRINK_AFTER = 450;

  /** The window covers a screen while the user picks what to show. */
  let picking = $state(false);
  let pickDone: ((area: HitRect | null) => void) | null = null;

  const companion = new Companion({
    pickZone,
    // Once the frame is drawn, and without scrolling: focusing a field lays the page out, which earlier would come twice.
    focusInput: () =>
      requestAnimationFrame(() => setTimeout(() => document.querySelector<HTMLElement>('.assistant-input, .askbar input')?.focus({ preventScroll: true }))),
    summoned: () => frame.show('chat'),
    // A click elsewhere leaves a pinned island open, and one being edited.
    pinned: () => frame.pinned || frame.editing
  });
  const frame = new IslandFrame({
    isOpen: () => companion.open,
    setOpen: (open) => (open ? companion.show() : companion.close()),
    openOnHover: () => companion.prefs.openOnHover,
    waiting: () => companion.blocking > 0,
    talking: () => companion.talking,
    // The last tab used, unless the bar left it out since.
    lastTab: () => shownTab(readBar(), readDeckTab(localStorage)),
    keepTab: (tab) => writeDeckTab(localStorage, tab)
  });
  const move = new IslandMove({
    place: () => companion.prefs.islandPlace,
    island: () => document.querySelector('[data-testid=island]')?.getBoundingClientRect() ?? null,
    span: async () => (await spanIsland(true).catch(() => null))?.monitor ?? null,
    land: (patch) => (companion.prefs = writeCompanionPrefs(patch)),
    reduced: () => prefersReducedMotion.current
  });

  const island = $derived(companion.prefs.robots === 'island');
  /** The island is drawn: the robots live in it, or the settings panel is open over loose ones. */
  const shown = $derived(island || settingsPanel.open);

  // The settings, asked for: the island opens on its tab, then the panel on the section asked.
  $effect(() =>
    answerSettings((section) => {
      if (frame.editing) writeBarEdit(false);
      frame.show(frame.tab);
      settingsPanel.show(section);
    })
  );
  // While the panel shows it holds the island open; closed over loose robots, it takes the island away.
  $effect(() => {
    if (!settingsPanel.open) return;
    untrack(() => frame.hold('settings', true));
    return () =>
      untrack(() => {
        frame.hold('settings', false);
        if (!island) companion.close();
      });
  });
  // The island closing, or its bar being edited, closes the panel.
  $effect(() => {
    if (!companion.open || frame.editing) untrack(() => settingsPanel.close());
  });

  /** The system says the page is out of sight. */
  let pageHidden = $state(document.hidden);
  /**
   * Nobody sees the window: hidden by the system, or by the shell under a
   * full-screen app (`hideFullscreen`), which the page hears without being
   * told it is hidden. The endless animations then wait (`bots.css`).
   */
  const dormant = $derived(pageHidden || companion.senses.fullscreen);
  $effect(() => {
    document.documentElement.toggleAttribute('data-dormant', dormant);
  });

  // The bar's edit mode (`lib/island/bar.ts`), asked from Settings or by a right-click on the bar, ended by
  // Done, Escape or Settings. It is the island's: the robots set loose, or the island closed, end it.
  $effect(() => subscribeBarEdit((on) => frame.edit(on && untrack(() => island))));
  $effect(() => {
    if (frame.editing && (!island || !companion.open)) untrack(() => writeBarEdit(false));
  });
  let layout = $state<CompanionLayout>(layoutOf(companion.prefs.anchor, companion.prefs.spot));
  let islandHeight = $state(ISLAND_WINDOW.closed);

  /**
   * The window covers the screen under the pointer and the user drags over
   * what to show (`CompanionZone`). Afterwards the placement effect puts the
   * window back where it was.
   */
  async function pickZone(): Promise<ScreenShot | null | 'cancelled'> {
    picking = true;
    try {
      await coverScreen(true);
      const area = await new Promise<HitRect | null>((resolve) => (pickDone = resolve));
      return area ? await captureZone(area) : 'cancelled';
    } finally {
      pickDone = null;
      // Uncovered before placed: the shell would carry the cover along otherwise.
      await coverScreen(false).catch(() => {});
      picking = false;
    }
  }

  /** The shell reads the hit areas every 40 ms (`WATCH_EVERY`, `companion_window.rs`): sent more often, a send is never read. */
  const RECTS_EVERY = 40;
  let rectsTimer: ReturnType<typeof setTimeout> | undefined;
  let rectsAt = 0;
  /**
   * Sends the hit areas soon, once for a burst of changes: a spring moving
   * the island asks on every frame, 240 times a second on a 240 Hz screen.
   * The send reads them when it runs, so the last change is always in it.
   */
  function requestRects() {
    if (rectsTimer !== undefined) return;
    rectsTimer = setTimeout(
      () => {
        rectsTimer = undefined;
        rectsAt = performance.now();
        sendRects();
      },
      Math.max(0, rectsAt + RECTS_EVERY - performance.now())
    );
  }

  let lastRects = '';
  function sendRects() {
    const rects: HitRect[] = [...document.querySelectorAll<HTMLElement>('[data-hit]')].map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x - HIT_PAD, y: box.y - HIT_PAD, w: box.width + HIT_PAD * 2, h: box.height + HIT_PAD * 2 };
    });
    const key = JSON.stringify(rects);
    if (key === lastRects) return;
    lastRects = key;
    void companionHitRects(rects).catch(() => {
      lastRects = '';
    });
  }

  $effect(() => {
    void [shown, companion.open, picking, move.moving, frame.size, frame.tab, frame.editing, settingsPanel.open, settingsPanel.section, companion.notice, companion.waiting, companion.blocking];
    // Measured once the frame is drawn, when its layout is done: measuring before would lay it out twice.
    void tick().then(() => requestAnimationFrame(requestRects));
  });

  // The island's window grows at once when it opens, longer for the settings
  // panel, and shrinks once the island's spring or the panel has followed.
  $effect(() => {
    const wanted = settingsPanel.open ? Math.max(ISLAND_WINDOW.open, panelWindowHeight(screen.availHeight)) : companion.open ? ISLAND_WINDOW.open : ISLAND_WINDOW.closed;
    if (wanted >= untrack(() => islandHeight)) {
      islandHeight = wanted;
      return;
    }
    const shrink = setTimeout(() => (islandHeight = wanted), SHRINK_AFTER);
    return () => clearTimeout(shrink);
  });

  // Covering a screen or carried, the window stays put; otherwise it goes to
  // its place: the island's on its screen, where it was left for the loose robots.
  $effect(() => {
    const [onIsland, monitor, place, anchor, spot, height] = [shown, companion.prefs.monitor, companion.prefs.islandPlace, companion.prefs.anchor, companion.prefs.spot, islandHeight];
    if (picking || companion.dragging || move.moving) return;
    if (onIsland) void placeIsland(monitor, placeLayout(place), ISLAND_WINDOW.width, height).catch(() => {});
    else
      void placeCompanion(monitor, anchor, spot)
        .then((next) => (layout = next))
        .catch(() => {});
  });

  // Hiding for full-screen apps and the shortcut live in the shell; how the
  // shortcut fared goes to the settings panel (`writeStatus`).
  $effect(() => {
    const [hideFullscreen, hotkey] = [companion.prefs.hideFullscreen, companion.prefs.hotkey];
    if (!inShell()) return;
    void configureCompanion(hideFullscreen, hotkey)
      .then(() => writeStatus({ hotkeyError: null }))
      .catch(() => writeStatus({ hotkeyError: hotkey }));
  });

  onMount(() => {
    document.documentElement.dataset.companion = '';
    // An edit mode a closed Bots left behind is over: Settings shows its button again.
    if (readBarEdit()) writeBarEdit(false);
    // The clipboard history records while the setting is on, deck open or not.
    const off: (() => void)[] = [startTheme(), companion.start(), () => frame.dispose(), () => move.dispose(), clipboardHistory.start()];
    // The tray's Settings, and the companion's own request, come back from the shell (`bots_settings`).
    let gone = false;
    void listenShell<string | null>('settings', (section) => requestSettings(section)).then((stop) => (gone ? stop() : off.push(stop)));
    // The carried island's span follows the pointer to another screen, or is given up after a release the page missed (`island.rs`).
    void listenShell<IslandPlaced>('span', (placed) => move.spanned(placed.monitor)).then((stop) => (gone ? stop() : off.push(stop)));
    void listenShell('span-lost', () => move.abort()).then((stop) => (gone ? stop() : off.push(stop)));
    off.push(() => (gone = true));
    // Hidden, nothing can be clicked: the areas wait until the window shows again.
    const rects = setInterval(() => !dormant && requestRects(), 500);
    const seen = () => (pageHidden = document.hidden);
    document.addEventListener('visibilitychange', seen);
    // Demo poses for captures (`?fake=1&pose=…`), in the dev bundle only.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('pose')) {
      void import('./lib/island/pose').then(({ strikePose }) => strikePose(companion, frame, new URLSearchParams(location.search)));
    }
    return () => {
      clearInterval(rects);
      clearTimeout(rectsTimer);
      document.removeEventListener('visibilitychange', seen);
      off.forEach((stop) => stop());
    };
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (picking) pickDone?.(null);
    else if (settingsPanel.open) settingsPanel.close();
    else if (frame.editing) writeBarEdit(false);
    else if (companion.open) companion.close();
    else companion.talks.forEach((talk) => talk.hide());
  }

  // Files dragged over the loose robots' window; the island takes its own.
  function dragover(event: DragEvent) {
    if (!shown) companion.attached.dragover(event);
  }
  function drop(event: DragEvent) {
    if (!shown) companion.dropFiles(event);
  }
</script>

<svelte:window {onkeydown} />

<main
  class="stage"
  class:picking
  class:island={shown}
  data-align={layout.align}
  data-edge={layout.edge}
  data-place={companion.prefs.islandPlace}
  style:--place-margin="{PLACE_MARGIN}px"
  data-testid="companion" ondragenter={dragover} ondragover={dragover} ondrop={drop}>
  <div class="companion">
    {#if shown}
      <Island {companion} {frame} {move} onresize={requestRects} />
    {:else}
      <DesktopCompanion {companion} {layout} onresize={requestRects} />
    {/if}
    <div class="notice">
      <BotsNotice
        text={companion.waiting ? strings.bots.waiting : companion.notice}
        hint={companion.waiting ? strings.bots.waitingHint : null}
        sticky={companion.waiting}
        ondismiss={() => (companion.notice = null)}
      />
    </div>
  </div>

  {#if picking}
    <CompanionZone screens={companion.screens} onpick={(area) => pickDone?.(area)} oncancel={() => pickDone?.(null)} />
  {/if}
</main>

<style>
  /* The window is transparent: only what the companion draws shows. */
  :global(html[data-companion]),
  :global(html[data-companion] body),
  :global(html[data-companion] #app) {
    background: transparent !important;
    overflow: hidden;
  }
  :global(html[data-companion] body::before),
  :global(html[data-companion] body::after) {
    display: none;
  }

  /* The window is narrow, which app.css reads as a phone and gives touch
     sizes to: the companion is on a desktop, under a mouse. The paddings put
     the loose character's centre where the shell expects it (`CHARACTER_TOP`,
     `CHARACTER_BOTTOM`, `CHARACTER_SIDE`). */
  .stage {
    --control: 30px;
    --control-sm: 26px;
    --control-lg: 36px;
    --input: 34px;
    --row: 34px;
    --touch-target: 30px;
    display: flex;
    flex-direction: column;
    height: 100dvh;
    /* Room above the lid and the headphones: drawn flush, they seem cut by the screen's edge. */
    padding: 24px 16px 6px;
  }
  .stage[data-edge='bottom']:not(.island) {
    justify-content: flex-end;
    padding: 6px 16px 12px;
  }
  /* The island hangs from its edge of the window, in the middle or a margin from its side; at the bottom, the notice shows above it. */
  .stage.island {
    align-items: center;
    padding: 0;
  }
  .stage.island[data-place$='left'] {
    align-items: flex-start;
    padding-left: var(--place-margin);
  }
  .stage.island[data-place$='right'] {
    align-items: flex-end;
    padding-right: var(--place-margin);
  }
  .stage.island[data-place^='bottom'] .companion {
    flex-direction: column-reverse;
  }
  /* The companion steps aside while the user picks what to show it. */
  .stage.picking .companion {
    visibility: hidden;
  }
  .stage :global(input) {
    font-size: var(--text-sm);
  }
  .companion {
    display: flex;
    flex-direction: column;
    align-items: inherit;
    justify-content: inherit;
    min-height: 0;
    flex: 1;
  }
  .notice {
    display: flex;
    justify-content: center;
  }
  .stage.island .notice {
    margin-top: -18px;
  }
  .stage.island[data-place^='bottom'] .notice {
    margin: 0 0 -18px;
  }
</style>
