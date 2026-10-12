<!--
  The deck's "wallpaper" tab. Its sources: Wallpaper Engine's wallpapers
  when it is installed, the recent wallpapers Windows keeps, and a folder the
  user picks. Small thumbnails only, made and cached by the shell, for the
  tiles on screen. A click asks first, inline, then sets the wallpaper on
  every screen (or opens the Wallpaper Engine one on the screen chosen) and
  marks it current. Wallpaper Engine's own controls sit beside its source.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, FolderOpen, Pause, Play, Search, SkipForward, Volume2, VolumeX } from '@lucide/svelte';
  import { fill, strings } from '../../../../lib/strings';
  import {
    engineApply,
    engineControl,
    engineCurrent,
    engineInfo,
    engineThumb,
    listWallpapers,
    pickWallpaperFolder,
    setWallpaper,
    wallpaperFolder,
    wallpaperThumb,
    type Engine,
    type EngineControl,
    type Folder,
    type Wallpapers
  } from '../../../../lib/windows/native';
  import { LazyImages } from '../../../../lib/windows/images.svelte';
  import { InlineConfirm } from '../../../../lib/windows/confirm.svelte';
  import { readWindowsPrefs, writeWindowsPrefs, type WallpaperSource } from '../../../../lib/windows/prefs';
  import { engineIsCurrent, fileLabel, filterEngine, folderLabel, kindsOf, samePath, type KindFilter } from '../../../../lib/windows/wallpaper';
  import Tile from '../computer/Tile.svelte';

  /** Wallpaper Engine takes a moment to come up once started. */
  const STARTED_MS = 4_000;
  const CONTROLS: { control: EngineControl; icon: typeof Play; label: 'play' | 'pause' | 'mute' | 'unmute' | 'next' }[] = [
    { control: 'play', icon: Play, label: 'play' },
    { control: 'pause', icon: Pause, label: 'pause' },
    { control: 'unmute', icon: Volume2, label: 'unmute' },
    { control: 'mute', icon: VolumeX, label: 'mute' },
    { control: 'next', icon: SkipForward, label: 'next' }
  ];

  const copy = $derived(strings.island.deck.wallpaper);
  const confirm = new InlineConfirm();
  const thumbs = new LazyImages(wallpaperThumb);
  const liveThumbs = new LazyImages(engineThumb);

  const saved = readWindowsPrefs();
  let chosen = $state<WallpaperSource | null>(saved.wallpaperSource);
  let monitor = $state<number | null>(saved.engineMonitor);
  let walls = $state.raw<Wallpapers | null>(null);
  let folder = $state.raw<Folder | null>(null);
  let folderPath = $state<string | null>(saved.wallpaperFolder);
  /** Undefined while asked, null when Wallpaper Engine is not installed. */
  let engine = $state.raw<Engine | null | undefined>(undefined);
  let live = $state.raw<string[]>([]);
  let query = $state('');
  let kind = $state<KindFilter>('all');
  let problem = $state('');
  let busy = $state(false);
  let alive = true;
  let startTimer: ReturnType<typeof setTimeout> | undefined;

  const source = $derived<WallpaperSource>(chosen === 'engine' && engine === null ? 'recent' : (chosen ?? (engine ? 'engine' : 'recent')));
  const screen = $derived(engine && monitor !== null && monitor < engine.monitors ? monitor : null);
  const kinds = $derived(engine ? kindsOf(engine.wallpapers) : []);
  const liveShown = $derived(engine ? filterEngine(engine.wallpapers, query, kind) : []);
  const images = $derived(source === 'folder' ? (folder?.images ?? []) : (walls?.recent ?? []));

  onMount(() => {
    void listWallpapers()
      .then((next) => alive && (walls = next))
      .catch(() => alive && (walls = { recent: [], current: null }));
    void readEngine();
    if (folderPath) void openFolder(folderPath);
    return () => {
      alive = false;
      clearTimeout(startTimer);
      confirm.dispose();
      thumbs.drop();
      liveThumbs.drop();
    };
  });

  async function readEngine() {
    const next = await engineInfo().catch(() => null);
    if (!alive) return;
    engine = next;
    live = next?.running ? await engineCurrent().catch(() => []) : [];
  }

  async function openFolder(path: string) {
    const next = await wallpaperFolder(path).catch(() => null);
    if (alive) folder = next;
  }

  function pickSource(next: WallpaperSource) {
    chosen = next;
    confirm.cancel();
    writeWindowsPrefs({ wallpaperSource: next });
  }

  async function pickFolder() {
    const path = await pickWallpaperFolder().catch(() => null);
    if (!path || !alive) return;
    folderPath = path;
    writeWindowsPrefs({ wallpaperFolder: path, wallpaperSource: 'folder' });
    chosen = 'folder';
    await openFolder(path);
  }

  function pickScreen(next: number | null) {
    monitor = next;
    writeWindowsPrefs({ engineMonitor: next });
  }

  async function useImage(path: string) {
    if (!confirm.confirm(`image:${path}`)) return;
    problem = '';
    busy = true;
    try {
      const current = await setWallpaper(path);
      const next = await listWallpapers().catch(() => walls);
      if (alive) walls = { recent: next?.recent ?? [], current: current ?? path };
    } catch {
      problem = copy.failed;
    } finally {
      busy = false;
    }
  }

  async function useLive(id: string) {
    if (!confirm.confirm(`live:${id}`) || !engine) return;
    problem = '';
    busy = true;
    try {
      await engineApply(id, screen);
      live = screen === null ? Array.from({ length: engine.monitors }, () => id) : Object.assign([...live], { [screen]: id });
      const read = await engineCurrent().catch(() => null);
      if (alive && read && read.length > 0) live = read;
    } catch {
      problem = copy.failed;
    } finally {
      busy = false;
    }
  }

  async function control(next: EngineControl) {
    problem = '';
    try {
      await engineControl(next);
    } catch {
      problem = copy.failed;
      return;
    }
    if (next === 'start') {
      clearTimeout(startTimer);
      startTimer = setTimeout(() => void readEngine(), STARTED_MS);
    }
  }

  function focusNow(element: HTMLElement) {
    element.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && confirm.armed) {
      event.stopPropagation();
      confirm.cancel();
    }
  }
</script>

{#snippet shot(key: string, label: string, image: string | null | undefined, current: boolean, use: () => void, disabled: boolean, attach: ReturnType<LazyImages['when']>)}
  <li class="shot" class:current {@attach attach}>
    {#if confirm.is(key)}
      <div class="frame armed" role="group" aria-label={fill(copy.setOn, { name: label })}>
        {#if image}<img src={image} alt="" draggable="false" />{/if}
        <div class="veil">
          <button class="yes" {@attach focusNow} onclick={use} data-testid="wallpaper-confirm">{copy.confirm}</button>
          <button class="no" onclick={() => confirm.cancel()}>{copy.cancel}</button>
        </div>
      </div>
    {:else}
      <button class="frame" aria-label={fill(copy.setOn, { name: label })} title={label} disabled={disabled || busy} aria-current={current ? 'true' : undefined} onclick={() => confirm.arm(key)} data-testid="wallpaper-shot">
        {#if image}<img src={image} alt="" draggable="false" />{:else}<span class="blank"></span>{/if}
        {#if current}<span class="badge"><Check size={12} strokeWidth={3} />{copy.current}</span>{/if}
      </button>
    {/if}
    <span class="caption" title={label}>{label}</span>
  </li>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tab" data-testid="deck-tab-wallpaper" {onkeydown}>
  <Tile area="bar" testid="wallpaper-sources">
    <div class="bar">
      <div class="sources" role="group" aria-label={copy.sources}>
        {#if engine}
          <button aria-pressed={source === 'engine'} class:on={source === 'engine'} onclick={() => pickSource('engine')} data-testid="wallpaper-source-engine">
            {copy.engine}<span class="n">{engine.wallpapers.length}</span>
          </button>
        {/if}
        <button aria-pressed={source === 'recent'} class:on={source === 'recent'} onclick={() => pickSource('recent')} data-testid="wallpaper-source-recent">
          {copy.recent}{#if walls}<span class="n">{walls.recent.length}</span>{/if}
        </button>
        <button aria-pressed={source === 'folder'} class:on={source === 'folder'} onclick={() => pickSource('folder')} data-testid="wallpaper-source-folder">
          {copy.folder}{#if folder}<span class="n">{folder.count}</span>{/if}
        </button>
      </div>

      <div class="tools">
        {#if source === 'engine' && engine?.running}
          {#if engine.monitors > 1}
            <div class="screens" role="group" aria-label={copy.screens}>
              <span class="label">{copy.screens}</span>
              <button class:on={screen === null} aria-pressed={screen === null} onclick={() => pickScreen(null)}>{copy.everyScreen}</button>
              {#each Array.from({ length: engine.monitors }, (_, index) => index) as index (index)}
                <button class:on={screen === index} aria-pressed={screen === index} aria-label={fill(copy.screen, { n: String(index + 1) })} onclick={() => pickScreen(index)}>{index + 1}</button>
              {/each}
            </div>
          {/if}
          <div class="controls">
            {#each CONTROLS as { control: name, icon: Icon, label } (name)}
              <button class="icon" aria-label={copy[label]} title={copy[label]} onclick={() => control(name)} data-testid="engine-{name}"><Icon size={15} /></button>
            {/each}
          </div>
        {:else if source === 'folder' && folderPath}
          <span class="path" title={folderPath}>{folderLabel(folderPath)}</span>
          <button class="tool" onclick={pickFolder}><FolderOpen size={14} />{copy.changeFolder}</button>
        {/if}
      </div>
    </div>
  </Tile>

  <Tile area="grid" scroll testid="wallpaper-grid">
    {#if source === 'engine' && engine}
      {#if !engine.running}
        <div class="banner" role="status">
          <span>{copy.notRunning}</span>
          <button class="tool accent" onclick={() => control('start')} data-testid="engine-start"><Play size={14} />{copy.start}</button>
        </div>
      {/if}
      <div class="filters">
        <label class="search">
          <Search size={14} />
          <input bind:value={query} type="search" placeholder={copy.search} aria-label={copy.search} spellcheck="false" autocomplete="off" />
        </label>
        {#if kinds.length > 1}
          <div class="kinds" role="group" aria-label={copy.kind}>
            <button class:on={kind === 'all'} aria-pressed={kind === 'all'} onclick={() => (kind = 'all')}>{copy.all}</button>
            {#each kinds as each (each)}
              <button class:on={kind === each} aria-pressed={kind === each} onclick={() => (kind = each)}>{copy.kinds[each]}</button>
            {/each}
          </div>
        {/if}
      </div>
      {#if engine.wallpapers.length === 0}
        <p class="note">{copy.emptyEngine}</p>
      {:else if liveShown.length === 0}
        <p class="note">{copy.none}</p>
      {:else}
        <ul class="grid">
          {#each liveShown as wallpaper (wallpaper.id)}
            {@render shot(`live:${wallpaper.id}`, wallpaper.title, liveThumbs.get(wallpaper.id), engineIsCurrent(wallpaper.id, live, screen), () => useLive(wallpaper.id), !engine.running, wallpaper.preview ? liveThumbs.when(wallpaper.id) : () => {})}
          {/each}
        </ul>
      {/if}
    {:else if source === 'folder' && !folderPath}
      <div class="empty">
        <p>{copy.noFolder}</p>
        <button class="tool accent" onclick={pickFolder} data-testid="wallpaper-pick"><FolderOpen size={14} />{copy.pickFolder}</button>
      </div>
    {:else if images.length === 0}
      <p class="note">{source === 'folder' ? copy.emptyFolder : walls ? copy.emptyRecent : ''}</p>
    {:else}
      <ul class="grid">
        {#each images as path (path)}
          {@render shot(`image:${path}`, fileLabel(path), thumbs.get(path), samePath(path, walls?.current), () => useImage(path), false, thumbs.when(path))}
        {/each}
      </ul>
    {/if}
    {#if problem}<p class="note problem" role="status">{problem}</p>{/if}
  </Tile>
</div>

<style>
  .tab {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'bar' 'grid';
    gap: var(--deck-gap);
    height: 380px;
    color: var(--island-text);
    font-family: var(--island-font);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
  }
  .sources,
  .kinds,
  .screens {
    display: flex;
    gap: 4px;
  }
  .sources button,
  .kinds button,
  .screens button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--island-muted);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .kinds button,
  .screens button {
    height: 26px;
    padding: 0 10px;
    font-size: 12px;
  }
  .sources button:hover,
  .kinds button:hover,
  .screens button:hover {
    color: var(--island-text);
  }
  .sources button.on,
  .kinds button.on,
  .screens button.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .n {
    color: inherit;
    font-family: var(--deck-numeral-font);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .screens {
    align-items: center;
    padding: 2px;
    border-radius: 999px;
    background: var(--deck-field);
  }
  .label {
    padding: 0 6px 0 8px;
    color: var(--island-muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .controls {
    display: flex;
    gap: 2px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--island-muted);
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .icon:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .path {
    max-width: 200px;
    overflow: hidden;
    color: var(--island-muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .tool:hover {
    background: var(--deck-tile-hover);
  }
  .tool.accent {
    background: var(--deck-accent);
    color: var(--island-bg);
    font-weight: 600;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 8px 8px 14px;
    border-radius: 12px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 13px;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    max-width: 280px;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-muted);
  }
  .search:focus-within {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--island-text);
    font: inherit;
    font-size: 13px;
  }
  input::placeholder {
    color: var(--island-faint);
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px 10px;
    margin: 0;
    padding: 2px;
    list-style: none;
  }
  .shot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .frame {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 12px;
    background: var(--deck-field);
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  button.frame:hover:not(:disabled) {
    transform: translateY(-2px);
  }
  button.frame:active:not(:disabled) {
    transform: scale(0.98);
  }
  .frame:disabled {
    cursor: default;
  }
  .frame:disabled img {
    opacity: 0.55;
  }
  .frame img,
  .blank {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .current .frame {
    box-shadow: 0 0 0 2px var(--deck-accent);
  }
  .badge {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 6px;
    border-radius: 999px;
    background: var(--deck-accent);
    color: var(--island-bg);
    font-size: 11px;
    font-weight: 600;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: color-mix(in srgb, var(--island-bg) 62%, transparent);
  }
  .armed {
    box-shadow: 0 0 0 2px var(--deck-accent);
    cursor: default;
  }
  .yes,
  .no {
    min-width: 96px;
    padding: 5px 12px;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .yes {
    background: var(--deck-accent);
    color: var(--island-bg);
    font-weight: 600;
  }
  .no {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .caption {
    overflow: hidden;
    color: var(--island-muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .current .caption {
    color: var(--island-text);
  }
  .empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .empty p,
  .note {
    margin: 0;
    color: var(--island-muted);
    font-size: 13px;
  }
  .problem {
    color: var(--island-danger);
  }
  button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .frame,
    .tool,
    .icon,
    .sources button,
    .kinds button,
    .screens button {
      transition: none;
    }
    button.frame:hover:not(:disabled),
    button:active {
      transform: none !important;
    }
  }
</style>
