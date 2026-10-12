<!--
  The deck's "apps" tab: the Start menu's apps, pinned ones first, with a
  search field that has the focus as the tab opens. A click or Enter opens
  an app; the pin beside it keeps it first. The icons load only for the
  tiles on screen.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Pin, PinOff, Search } from '@lucide/svelte';
  import { fill, strings } from '../../../../lib/strings';
  import { useView } from '../../../../lib/island/contract';
  import { appIcon, listApps, openApp, type App } from '../../../../lib/windows/native';
  import { LazyImages } from '../../../../lib/windows/images.svelte';
  import { firstShown, showApps } from '../../../../lib/windows/apps';
  import { readWindowsPrefs, subscribeWindowsPrefs, togglePin, writeWindowsPrefs } from '../../../../lib/windows/prefs';
  import Tile from '../computer/Tile.svelte';

  const view = useView();
  const copy = $derived(strings.island.deck.apps);
  const icons = new LazyImages(appIcon);

  let apps = $state.raw<App[] | null>(null);
  let pinned = $state.raw<string[]>(readWindowsPrefs().pinned);
  let query = $state('');
  let problem = $state('');

  const shown = $derived(showApps(apps ?? [], pinned, query));
  const searching = $derived(query.trim().length > 0);
  const total = $derived(shown.pinned.length + shown.others.length);

  onMount(() => {
    let alive = true;
    void listApps()
      .then((list) => alive && (apps = list))
      .catch(() => alive && (apps = []));
    const off = subscribeWindowsPrefs((prefs) => (pinned = prefs.pinned));
    return () => {
      alive = false;
      off();
      icons.drop();
    };
  });

  async function open(app: App) {
    problem = '';
    try {
      await openApp(app.id);
      view.companion.close();
    } catch {
      problem = fill(copy.failed, { name: app.name });
    }
  }

  function pin(app: App) {
    pinned = writeWindowsPrefs({ pinned: togglePin(pinned, app.id) }).pinned;
  }

  /** The search has the focus as the tab opens. */
  function focusOnShow(element: HTMLInputElement) {
    element.focus({ preventScroll: true });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    const first = firstShown(shown);
    if (first) void open(first);
  }
</script>

{#snippet card(app: App, isPinned: boolean)}
  {@const icon = icons.get(app.id)}
  <li class="app" {@attach icons.when(app.id)}>
    <button class="launch" title={fill(copy.open, { name: app.name })} onclick={() => open(app)} data-testid="apps-open">
      <span class="glyph">
        {#if icon}<img src={icon} alt="" width="40" height="40" draggable="false" />{:else}<span class="letter" aria-hidden="true">{app.name.charAt(0)}</span>{/if}
      </span>
      <span class="name">{app.name}</span>
    </button>
    <button class="pin" class:on={isPinned} aria-pressed={isPinned} aria-label={fill(isPinned ? copy.unpin : copy.pin, { name: app.name })} title={fill(isPinned ? copy.unpin : copy.pin, { name: app.name })} onclick={() => pin(app)}>
      {#if isPinned}<PinOff size={13} />{:else}<Pin size={13} />{/if}
    </button>
  </li>
{/snippet}

<div class="tab" data-testid="deck-tab-apps">
  <Tile scroll testid="apps-list">
    {#snippet aside()}
      <label class="search">
        <Search size={15} />
        <input {@attach focusOnShow} bind:value={query} type="search" placeholder={copy.search} aria-label={copy.search} spellcheck="false" autocomplete="off" {onkeydown} data-testid="apps-search" />
        {#if searching && total > 0}<span class="hint">{copy.enterHint}</span>{/if}
      </label>
      {#if apps}<span class="count">{fill(copy.count, { count: String(searching ? total : apps.length) })}</span>{/if}
    {/snippet}

    {#if apps === null}
      <p class="note">{copy.loading}</p>
    {:else if apps.length === 0}
      <p class="note">{copy.empty}</p>
    {:else if total === 0}
      <p class="note">{fill(copy.none, { query: query.trim() })}</p>
    {:else}
      {#if shown.pinned.length > 0}
        <h4>{copy.pinned}</h4>
        <ul class="grid">
          {#each shown.pinned as app (app.id)}{@render card(app, true)}{/each}
        </ul>
      {/if}
      {#if shown.others.length > 0}
        <h4>{searching ? copy.results : copy.all}</h4>
        <ul class="grid">
          {#each shown.others as app (app.id)}{@render card(app, false)}{/each}
        </ul>
      {/if}
    {/if}
    {#if problem}<p class="note problem" role="status">{problem}</p>{/if}
  </Tile>
</div>

<style>
  .tab {
    display: grid;
    height: 380px;
    color: var(--island-text);
    font-family: var(--island-font);
  }
  .search {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    max-width: 420px;
    height: 34px;
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
    font-size: 14px;
  }
  input::placeholder {
    color: var(--island-faint);
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .hint {
    color: var(--island-faint);
    font-size: 11px;
    white-space: nowrap;
  }
  .count {
    color: var(--island-muted);
    font-family: var(--deck-numeral-font);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  h4 {
    margin: 4px 2px 0;
    color: var(--island-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .app {
    position: relative;
  }
  .launch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 6px 10px;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: var(--island-text);
    font: inherit;
    cursor: pointer;
    transition: transform 0.12s ease, background-color 0.15s ease;
  }
  .launch:hover {
    background: var(--deck-field);
  }
  .launch:active {
    transform: scale(0.96);
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
  }
  .glyph img {
    width: 40px;
    height: 40px;
    object-fit: contain;
  }
  .letter {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 16px;
    font-weight: 600;
  }
  .name {
    display: -webkit-box;
    width: 100%;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.3;
    text-align: center;
    word-break: break-word;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .pin {
    position: absolute;
    top: 4px;
    right: 4px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--deck-tile);
    color: var(--island-muted);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  .app:hover .pin,
  .pin:focus-visible {
    opacity: 1;
  }
  .pin:hover {
    color: var(--deck-accent-ink);
  }
  .note {
    margin: 8px 2px;
    color: var(--island-muted);
    font-size: 13px;
  }
  .problem {
    color: var(--island-danger);
  }
  button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .launch,
    .pin {
      transition: none;
    }
    .launch:active {
      transform: none;
    }
  }
</style>
