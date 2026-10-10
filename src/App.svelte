<!--
  The companion's window (`companion_window.rs`): transparent and frameless,
  on a screen. Only the areas marked `data-hit` take clicks; the rest of the
  window lets them through to what is under it.

  It draws one companion (`lib/companion/companion.svelte.ts`) in one of two
  ways, as the user chose: the island at the top of the screen
  (`components/island/`), or the robots loose on the desktop
  (`components/desktop/`). Dragging a robot out of the island sets it loose;
  dragging it back against the top edge, or "Back to the island", returns it.
  The shell places the window for either (`island_place`, `companion_place`).
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { startTheme } from '@boite/ui/lib/theme';
  import { strings } from './lib/strings';
  import BotsNotice from './components/BotsNotice.svelte';
  import { writeStatus } from './lib/companion/memory';
  import { captureZone, type ScreenShot } from './lib/companion/screen';
  import { companionHitRects, configureCompanion, coverScreen, inShell, layoutOf, placeCompanion, placeIsland, type CompanionLayout, type HitRect } from './lib/companion/shell';
  import { Companion } from './lib/companion/companion.svelte';
  import { IslandFrame } from './lib/island/frame.svelte';
  import CompanionZone from './components/companion/CompanionZone.svelte';
  import DesktopCompanion from './components/desktop/DesktopCompanion.svelte';
  import Island from './components/island/Island.svelte';

  const HIT_PAD = 6;
  /** The island's window: the open island (640 × 440 at most, 640 tall for a diff), its glow, a notice under it, and the drops on its sides (the music player, up to 276 wide). */
  const ISLAND_WINDOW = { width: 920, open: 500, tall: 700, closed: 150 };
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
    summoned: () => frame.show('chat')
  });
  const frame = new IslandFrame({
    isOpen: () => companion.open,
    setOpen: (open) => (open ? companion.show() : companion.close()),
    openOnHover: () => companion.prefs.openOnHover,
    waiting: () => companion.blocking > 0,
    talking: () => companion.talking
  });

  const island = $derived(companion.prefs.robots === 'island');
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
    void [island, companion.open, picking, frame.size, frame.tab, companion.notice, companion.waiting, companion.blocking];
    // Measured once the frame is drawn, when its layout is done: measuring before would lay it out twice.
    void tick().then(() => requestAnimationFrame(() => setTimeout(sendRects)));
  });

  // The island's window grows at once (open, or taller for a diff), and
  // shrinks once the island's spring has followed.
  $effect(() => {
    const wanted = companion.open ? (frame.tall ? ISLAND_WINDOW.tall : ISLAND_WINDOW.open) : ISLAND_WINDOW.closed;
    if (wanted >= untrack(() => islandHeight)) {
      islandHeight = wanted;
      return;
    }
    const shrink = setTimeout(() => (islandHeight = wanted), SHRINK_AFTER);
    return () => clearTimeout(shrink);
  });

  // Covering a screen or carried, the window stays put; otherwise it goes to
  // its place: the top of its screen for the island, where it was left for
  // the loose robots.
  $effect(() => {
    const [onIsland, monitor, anchor, spot, height] = [island, companion.prefs.monitor, companion.prefs.anchor, companion.prefs.spot, islandHeight];
    if (picking || companion.dragging) return;
    if (onIsland) void placeIsland(monitor, ISLAND_WINDOW.width, height).catch(() => {});
    else
      void placeCompanion(monitor, anchor, spot)
        .then((next) => (layout = next))
        .catch(() => {});
  });

  // Hiding for full-screen apps and the shortcut live in the shell; how the
  // shortcut fared goes to Settings, in the other window.
  $effect(() => {
    const [hideFullscreen, hotkey] = [companion.prefs.hideFullscreen, companion.prefs.hotkey];
    if (!inShell()) return;
    void configureCompanion(hideFullscreen, hotkey)
      .then(() => writeStatus({ hotkeyError: null }))
      .catch(() => writeStatus({ hotkeyError: hotkey }));
  });

  onMount(() => {
    document.documentElement.dataset.companion = '';
    const off: (() => void)[] = [startTheme(), companion.start(), () => frame.dispose()];
    const rects = setInterval(sendRects, 500);
    // Demo poses for captures (`?fake=1&pose=…`), in the dev bundle only.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('pose')) {
      void import('./lib/island/pose').then(({ strikePose }) => strikePose(companion, frame, new URLSearchParams(location.search)));
    }
    return () => {
      clearInterval(rects);
      off.forEach((stop) => stop());
    };
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (picking) pickDone?.(null);
    else if (companion.open) companion.close();
    else companion.talks.forEach((talk) => talk.hide());
  }

  // Files dragged over the loose robots' window; the island takes its own.
  function dragover(event: DragEvent) {
    if (!island) companion.attached.dragover(event);
  }
  function drop(event: DragEvent) {
    if (!island) companion.dropFiles(event);
  }
</script>

<svelte:window {onkeydown} />

<main class="stage" class:picking class:island data-align={layout.align} data-edge={layout.edge} data-testid="companion" ondragenter={dragover} ondragover={dragover} ondrop={drop}>
  <div class="companion">
    {#if island}
      <Island {companion} {frame} onresize={sendRects} />
    {:else}
      <DesktopCompanion {companion} {layout} onresize={sendRects} />
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
  /* The island hangs from the top edge, in the middle of the window. */
  .stage.island {
    align-items: center;
    padding: 0;
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
</style>
