<!--
  What the bar can take, under it while it is being edited: the tabs left
  out and the controls taken away, a click putting each back at the bar's
  end; the Start menu's apps, searchable, a click adding or taking one out;
  a web link, its name and address. The bar holds `BAR_MAX` things at most.
  Below, how to arrange the bar, and its reset, which asks a second click.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Plus, RotateCcw, Search } from '@lucide/svelte';
  import { addApp, addLink, addTab, addTool, barFull, hiddenTabs, hiddenTools, isDefaultBar, LABEL_MAX, DEFAULT_BAR, removeItem, webLink, type BarTool } from '../../../lib/island/bar';
  import { appIcons as icons, type Bar } from '../../../lib/island/bar.svelte';
  import { showApps } from '../../../lib/windows/apps';
  import { InlineConfirm } from '../../../lib/windows/confirm.svelte';
  import { listApps, type App } from '../../../lib/windows/native';
  import { readWindowsPrefs } from '../../../lib/windows/prefs';
  import { fill, strings } from '../../../lib/strings';
  import DeckTile from './DeckTile.svelte';

  let { bar }: { bar: Bar } = $props();

  const copy = strings.island.deck.bar;
  const tabNames = strings.island.deck.tabs;
  const layout = $derived(bar.layout);
  const full = $derived(barFull(layout));
  const tabsOut = $derived(hiddenTabs(layout));
  const toolsOut = $derived(hiddenTools(layout));
  const inBar = $derived(new Set(layout.items.flatMap((item) => (item.kind === 'app' ? [item.app] : []))));

  let apps = $state.raw<App[] | null>(null);
  let query = $state('');
  // The apps pinned in the apps tab come first here too.
  const shown = $derived(showApps(apps ?? [], readWindowsPrefs().pinned, query));
  const listed = $derived([...shown.pinned, ...shown.others]);

  let linkName = $state('');
  let linkUrl = $state('');
  let linkProblem = $state(false);
  const linkReady = $derived(webLink(linkUrl) !== null);

  const reset = new InlineConfirm();
  $effect(() => () => reset.dispose());

  onMount(() => {
    let alive = true;
    void listApps()
      .then((list) => alive && (apps = list))
      .catch(() => alive && (apps = []));
    return () => {
      alive = false;
      icons.drop();
    };
  });

  function toggleApp(app: App) {
    if (inBar.has(app.id)) bar.set(removeItem(layout, `app:${app.id}`));
    else bar.set(addApp(layout, app));
  }

  function submitLink(event: SubmitEvent) {
    event.preventDefault();
    const next = addLink(layout, linkUrl, linkName);
    if (!next) return void (linkProblem = true);
    bar.set(next);
    linkName = '';
    linkUrl = '';
    linkProblem = false;
  }

  function resetBar() {
    if (!reset.confirm('bar')) return reset.arm('bar');
    bar.set(structuredClone(DEFAULT_BAR));
  }

  const toolName = (tool: BarTool) => copy.tools[tool];
</script>

<div class="palette" data-testid="bar-palette">
  <div class="grid">
    <DeckTile heading={copy.tabs} area="tabs" testid="bar-palette-tabs">
      {#if tabsOut.length === 0}
        <p class="note">{copy.allTabs}</p>
      {:else}
        <div class="chips">
          {#each tabsOut as tab (tab)}
            <button class="chip" disabled={full} title={fill(copy.add, { name: tabNames[tab] })} onclick={() => bar.set(addTab(layout, tab))} data-testid="bar-add-tab"><Plus size={13} strokeWidth={2.4} />{tabNames[tab]}</button>
          {/each}
        </div>
      {/if}
    </DeckTile>

    <DeckTile heading={copy.toolsHeading} area="tools" testid="bar-palette-tools">
      {#if toolsOut.length === 0}
        <p class="note">{copy.allTools}</p>
      {:else}
        <div class="chips">
          {#each toolsOut as tool (tool)}
            <button class="chip" title={fill(copy.add, { name: toolName(tool) })} onclick={() => bar.set(addTool(layout, tool))} data-testid="bar-add-tool"><Plus size={13} strokeWidth={2.4} />{toolName(tool)}</button>
          {/each}
        </div>
      {/if}
    </DeckTile>

    <DeckTile heading={copy.apps} area="apps" scroll testid="bar-palette-apps">
      {#snippet aside()}
        <label class="search">
          <Search size={13} />
          <input bind:value={query} type="search" placeholder={copy.search} aria-label={copy.search} spellcheck="false" autocomplete="off" data-testid="bar-app-search" />
        </label>
      {/snippet}
      {#if apps === null}
        <p class="note">{strings.island.deck.apps.loading}</p>
      {:else if apps.length === 0}
        <p class="note">{copy.noApps}</p>
      {:else if listed.length === 0}
        <p class="note">{fill(copy.noMatch, { query: query.trim() })}</p>
      {:else}
        <ul class="apps">
          {#each listed as app (app.id)}
            {@const icon = icons.get(app.id)}
            {@const added = inBar.has(app.id)}
            <li {@attach icons.when(app.id)}>
              <button class="app" class:added disabled={!added && full} aria-pressed={added} title={fill(added ? copy.added : copy.add, { name: app.name })} onclick={() => toggleApp(app)} data-testid="bar-add-app">
                <span class="glyph">
                  {#if icon}<img src={icon} alt="" width="22" height="22" draggable="false" />{:else}<span class="letter" aria-hidden="true">{app.name.charAt(0)}</span>{/if}
                </span>
                <span class="name">{app.name}</span>
                <span class="mark" aria-hidden="true">{#if added}<Check size={13} strokeWidth={2.6} />{:else}<Plus size={13} strokeWidth={2.4} />{/if}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </DeckTile>

    <DeckTile heading={copy.link} area="link" testid="bar-palette-link">
      <form class="link" onsubmit={submitLink}>
        <label>
          <span>{copy.linkUrl}</span>
          <input bind:value={linkUrl} oninput={() => (linkProblem = false)} placeholder={copy.linkUrlHint} spellcheck="false" autocomplete="off" inputmode="url" aria-invalid={linkProblem} data-testid="bar-link-url" />
        </label>
        <label>
          <span>{copy.linkName}</span>
          <input bind:value={linkName} placeholder={copy.linkNameHint} maxlength={LABEL_MAX} spellcheck="false" autocomplete="off" data-testid="bar-link-name" />
        </label>
        {#if linkProblem}<p class="note problem" role="alert">{copy.badLink}</p>{/if}
        <button class="add" type="submit" disabled={full || !linkReady} data-testid="bar-link-add"><Plus size={14} strokeWidth={2.4} />{copy.addLink}</button>
      </form>
    </DeckTile>
  </div>

  <footer>
    <p class="hint" class:problem={full} role="status">{full ? copy.full : copy.hint}</p>
    <button class="reset" class:armed={reset.is('bar')} disabled={isDefaultBar(layout)} onclick={resetBar} data-testid="bar-reset">
      <RotateCcw size={13} strokeWidth={2.2} />{reset.is('bar') ? copy.resetConfirm : copy.reset}
    </button>
  </footer>
</div>

<style>
  /* The app's global button and input are not the deck's look. */
  button {
    height: auto;
    min-height: 0;
    border: none;
    box-shadow: none;
    font: inherit;
  }
  .palette {
    display: flex;
    flex-direction: column;
    gap: var(--deck-gap);
    color: var(--island-text);
    font-family: var(--island-font);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'tabs apps link'
      'tools apps link';
    gap: var(--deck-gap);
    height: 290px;
  }
  .note {
    margin: 0;
    color: var(--island-muted);
    font-size: 12.5px;
  }
  .problem {
    color: var(--island-danger);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px 0 8px;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-text);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }
  .chip:hover:not(:disabled) {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .chip:disabled,
  .app:disabled,
  .add:disabled,
  .reset:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 190px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-muted);
  }
  .search:focus-within,
  .link input:focus {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  input {
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
  }
  .search input {
    flex: 1;
  }
  input::placeholder {
    color: var(--island-faint);
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  .apps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .app {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px 5px 5px;
    border-radius: 10px;
    background: none;
    color: var(--island-text);
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease;
  }
  .app:hover:not(:disabled) {
    background: var(--deck-field);
  }
  .glyph {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
  }
  .glyph img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .letter {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 11px;
    font-weight: 700;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: var(--island-muted);
    transition:
      background 150ms ease,
      color 150ms ease;
  }
  .app:hover .mark {
    color: var(--deck-accent-ink);
  }
  .app.added .mark {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .link {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .link label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .link label span {
    color: var(--island-muted);
    font-size: 11.5px;
  }
  .link input {
    height: 30px;
    padding: 0 11px;
    border-radius: 10px;
    background: var(--deck-field);
  }
  .link input[aria-invalid='true'] {
    outline: 1.5px solid var(--island-danger);
  }
  .add {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 5px;
    height: 30px;
    padding: 0 14px 0 10px;
    border-radius: 999px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease;
  }
  .add:hover:not(:disabled) {
    background: color-mix(in srgb, var(--deck-accent) 32%, transparent);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 6px;
  }
  .hint {
    margin: 0;
    color: var(--island-faint);
    font-size: 12px;
  }
  .hint.problem {
    color: var(--island-attention);
  }
  .reset {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }
  .reset:hover:not(:disabled) {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .reset.armed {
    background: color-mix(in srgb, var(--island-danger) 18%, transparent);
    color: var(--island-danger);
  }
  button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .chip,
    .app,
    .mark,
    .add,
    .reset {
      transition: none;
    }
  }
</style>
