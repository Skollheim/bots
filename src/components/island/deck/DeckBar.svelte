<!--
  The deck's bar: the robot on the left (a poke, a drag to set it loose, the
  count of requests waiting on it), the things the user keeps in the bar
  (`lib/island/bar.ts`: the deck's tabs, an app or a web link) as a tablist
  whose focus moves with the arrows, Home and End, and the island's controls
  on the right: the quotas, the pin, Settings (the panel under the bar,
  `settings/SettingsPanel.svelte`) and the sound.

  Each tab is its icon (`DECK_TAB_ICONS`); the tab shown also unrolls its
  name from it, on a soft pill, as an app the user named shows its name and
  a link its host (`nameShown`). The others name themselves in a tooltip
  under the bar, on hover or focus (`barTip`), which glides from one thing
  to the next while the pointer moves along the bar.

  In edit mode (`frame.editing`, asked from Settings or by a right-click on
  the bar), each thing wiggles a little: a drag moves it along its row
  (`RowSorter`), a click renames it in place, × takes it out (the last tab
  stays). Settings gives way to Done. What can be added shows under the bar
  (`BarPalette.svelte`).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { Check, Gauge, Globe, Pin, PinOff, Settings, Volume2, VolumeX, X } from '@lucide/svelte';
  import type { Companion, Member } from '../../../lib/companion/companion.svelte';
  import { writeCompanionPrefs } from '../../../lib/companion/prefs';
  import { barTabs, barTip, canRemove, LABEL_MAX, linkHost, moveItem, moveTool, nameShown, removeItem, removeTool, renameItem, shownTab, tipLeft, writeBarEdit, type BarItem, type BarTool } from '../../../lib/island/bar';
  import { appIcons as icons, type Bar } from '../../../lib/island/bar.svelte';
  import { RowSorter } from '../../../lib/island/bar-sort.svelte';
  import { DECK_TAB_ICONS, tabKey, type DeckTab } from '../../../lib/island/deck-tabs';
  import { gazeOf, moodOf } from '../../../lib/island/face';
  import type { IslandFrame } from '../../../lib/island/frame.svelte';
  import { settingsPanel } from '../../../lib/island/settings-panel.svelte';
  import { openApp, openLink } from '../../../lib/windows/native';
  import { fill, strings } from '../../../lib/strings';
  import CompanionCharacter from '../../companion/CompanionCharacter.svelte';
  import QuotasPill from '../assistant/QuotasPill.svelte';

  interface Props {
    companion: Companion;
    frame: IslandFrame;
    bar: Bar;
    lead: Member;
    cheering: boolean;
    reduced: boolean;
    /** The tab shown under the bar. */
    tab: DeckTab;
    onpick: (tab: DeckTab) => void;
  }

  let { companion, frame, bar, lead, cheering, reduced, tab, onpick }: Props = $props();

  const copy = strings.island;
  const editing = $derived(frame.editing);
  const layout = $derived(bar.layout);
  const tabs = $derived(barTabs(layout));

  let robotButton = $state<HTMLButtonElement | null>(null);
  let itemsRow = $state<HTMLElement | null>(null);
  let toolsRow = $state<HTMLElement | null>(null);
  const tabButtons = $state<Partial<Record<DeckTab, HTMLButtonElement>>>({});
  const items = new RowSorter((from, to) => bar.set(moveItem(bar.layout, from, to)), () => reduced);
  const tools = new RowSorter((from, to) => bar.set(moveTool(bar.layout, from, to)), () => reduced);
  $effect(() => () => {
    items.dispose();
    tools.dispose();
  });
  /** The thing being renamed, by key. */
  let renaming = $state<string | null>(null);
  /** The press that just ended was a drag: the click it ends with is no click. */
  let dragged = false;

  // Edit mode ended: a name being typed is kept as it stands.
  $effect(() => {
    if (!editing) renaming = null;
  });

  const defaultName = (item: BarItem): string => (item.kind === 'tab' ? copy.deck.tabs[item.tab] : item.kind === 'app' ? item.name : linkHost(item.url));
  const nameOf = (item: BarItem): string => item.label ?? defaultName(item);
  const toolName = (tool: BarTool): string => copy.deck.bar.tools[tool];

  function robotClick() {
    if (companion.dropped) return;
    companion.poke(companion.active.id);
  }

  function toggleSounds() {
    companion.prefs = writeCompanionPrefs({ sounds: !companion.prefs.sounds });
  }

  function tabKeys(event: KeyboardEvent, from: DeckTab) {
    const next = tabKey(event.key, from, tabs);
    if (!next) return;
    event.preventDefault();
    onpick(next);
    tabButtons[next]?.focus();
  }

  async function launch(item: BarItem) {
    try {
      if (item.kind === 'app') await openApp(item.app);
      else if (item.kind === 'link') await openLink(item.url);
      companion.close();
    } catch {
      companion.notice = fill(copy.deck.bar.failed, { name: nameOf(item) });
    }
  }

  /** The thing at `key` of a row has the focus again, once drawn. */
  async function focusThing(row: HTMLElement | null, key: string) {
    await tick();
    row?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] .thing`)?.focus();
  }

  /** Takes a thing out; from the keyboard, the focus goes to its neighbour. */
  function remove(item: BarItem, byKey = false) {
    const at = layout.items.findIndex((known) => known.key === item.key);
    const next = removeItem(layout, item.key);
    if (next === layout) return;
    bar.set(next);
    // The tab shown went: the deck turns to the bar's first.
    if (item.kind === 'tab' && item.tab === tab) onpick(shownTab(next, tab));
    const neighbour = next.items[Math.min(at, next.items.length - 1)];
    if (byKey && neighbour) void focusThing(itemsRow, neighbour.key);
  }

  /** Keeps the name typed. Enter gives the focus back to the thing; a click elsewhere leaves it where it went. */
  function rename(item: BarItem, value: string, byKey = false) {
    if (renaming !== item.key) return;
    renaming = null;
    bar.set(renameItem(bar.layout, item.key, value));
    if (byKey) void focusThing(itemsRow, item.key);
  }

  function renameKeys(event: KeyboardEvent & { currentTarget: HTMLInputElement }, item: BarItem) {
    if (event.key === 'Enter') {
      event.preventDefault();
      rename(item, event.currentTarget.value, true);
    } else if (event.key === 'Escape') {
      // The name stays as it was, and the island stays in edit mode.
      event.preventDefault();
      event.stopPropagation();
      renaming = null;
      void focusThing(itemsRow, item.key);
    }
  }

  /** The field has the focus and its text selected as it shows. */
  function focusField(element: HTMLInputElement) {
    element.focus({ preventScroll: true });
    element.select();
  }

  /** In edit mode: Delete takes a thing out, Alt with an arrow moves it, F2 renames it. */
  function editKeys(event: KeyboardEvent, index: number, key: string, row: 'items' | 'tools') {
    const length = row === 'items' ? layout.items.length : layout.tools.length;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (row === 'items') remove(layout.items[index]!, true);
      else {
        const next = removeTool(layout, layout.tools[index]!);
        bar.set(next);
        const neighbour = next.tools[Math.min(index, next.tools.length - 1)];
        if (neighbour) void focusThing(toolsRow, neighbour);
      }
    } else if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (to < 0 || to >= length) return;
      bar.set(row === 'items' ? moveItem(layout, index, to) : moveTool(layout, index, to));
      void focusThing(row === 'items' ? itemsRow : toolsRow, key);
    } else if (event.key === 'F2' && row === 'items') {
      event.preventDefault();
      renaming = key;
    }
  }

  function editClick(item: BarItem) {
    if (dragged) return void (dragged = false);
    renaming = item.key;
  }

  /** Bar things come and go with a small pop; a fade alone with reduced motion. */
  function pop(_node: Element) {
    if (reduced) return { duration: 120, css: (t: number) => `opacity: ${t}` };
    return { duration: 180, easing: cubicOut, css: (t: number) => `opacity: ${t}; scale: ${0.6 + 0.4 * t}` };
  }

  /** A wheel turned over a bar wider than the deck scrolls it sideways. */
  function wheel(event: WheelEvent & { currentTarget: HTMLElement }) {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
  }

  /** A right-click on the bar starts its edit mode; in the name being typed, the field keeps its own menu. */
  function startEditing(event: MouseEvent) {
    if ((event.target as Element | null)?.closest('input')) return;
    event.preventDefault();
    if (companion.prefs.robots === 'island') writeBarEdit(true);
  }

  const waitingSaid = $derived(fill(copy.sessions.waitingCount, { count: String(companion.blocking) }));

  /** How long the pointer rests on a thing before its tooltip shows, and how long it lingers once left. */
  const TIP_DELAY_MS = 320;
  const TIP_LINGER_MS = 90;
  /** A tooltip just closed: the next one shows at once, as the pointer runs along the bar. */
  const TIP_WARM_MS = 500;

  let barRow = $state<HTMLElement | null>(null);
  let tipBox = $state<HTMLElement | null>(null);
  /** The thing whose tooltip shows, by key, and where the tooltip sits. */
  let tip = $state<{ key: string; left: number } | null>(null);
  /** The tooltip moves from a thing to its neighbour: it glides rather than appearing there. */
  let gliding = $state(false);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  let warmUntil = 0;
  $effect(() => () => clearTimeout(tipTimer));

  const tipItem = $derived(tip ? layout.items.find((item) => item.key === tip!.key) : undefined);
  const tipSays = $derived(tipItem && renaming !== tipItem.key && items.carried === null ? barTip(tipItem, tab, editing) : null);

  /** The tooltip goes under `node`, kept inside the bar; the deck's zoom while it blooms in left out. */
  async function placeTip(node: HTMLElement, key: string) {
    if (!barRow || !node.isConnected) return;
    const outer = barRow.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const zoom = barRow.offsetWidth > 0 ? outer.width / barRow.offsetWidth : 1;
    const centre = (box.left + box.width / 2 - outer.left) / zoom;
    gliding = tip !== null && tip.key !== key;
    tip = { key, left: tip?.left ?? 0 };
    // Its new words drawn, its width is known.
    await tick();
    if (tip?.key === key && barRow) tip.left = tipLeft(centre, tipBox?.offsetWidth ?? 0, barRow.offsetWidth);
  }

  function openTip(node: HTMLElement, key: string, now: boolean) {
    clearTimeout(tipTimer);
    if (now || tip !== null || performance.now() < warmUntil) void placeTip(node, key);
    else tipTimer = setTimeout(() => void placeTip(node, key), TIP_DELAY_MS);
  }

  function closeTip(key: string, now = false) {
    clearTimeout(tipTimer);
    if (tip?.key !== key) return;
    const close = () => {
      tip = null;
      warmUntil = performance.now() + TIP_WARM_MS;
    };
    if (now) close();
    else tipTimer = setTimeout(close, TIP_LINGER_MS);
  }

  /** A thing of the bar names itself in the tooltip: on hover after a moment, on keyboard focus at once; a press puts it away. */
  const tipped = (key: string) => (node: HTMLElement) => {
    const hover = () => openTip(node, key, false);
    const focus = () => node.matches(':focus-visible') && openTip(node, key, true);
    const leave = () => closeTip(key);
    const press = () => closeTip(key, true);
    node.addEventListener('pointerenter', hover);
    node.addEventListener('focus', focus);
    node.addEventListener('pointerleave', leave);
    node.addEventListener('blur', leave);
    node.addEventListener('pointerdown', press);
    return () => {
      node.removeEventListener('pointerenter', hover);
      node.removeEventListener('focus', focus);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('blur', leave);
      node.removeEventListener('pointerdown', press);
      closeTip(key, true);
    };
  };
</script>

{#snippet face(item: BarItem)}
  {#if item.kind === 'app'}
    {@const icon = icons.get(item.app)}
    <span class="glyph" {@attach icons.when(item.app)}>
      {#if icon}<img src={icon} alt="" width="18" height="18" draggable="false" />{:else}<span class="letter" aria-hidden="true">{item.name.charAt(0)}</span>{/if}
    </span>
    {#if item.label}<span class="label">{item.label}</span>{/if}
  {:else if item.kind === 'link'}
    <Globe size={13} strokeWidth={2} />
    <span class="label">{nameOf(item)}</span>
  {:else}
    {@const Icon = DECK_TAB_ICONS[item.tab]}
    <span class="icon">
      <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
      {#if item.tab === 'music' && companion.media?.playing && !editing}<span class="playing" aria-hidden="true"></span>{/if}
    </span>
    <!-- The name unrolls from the icon: its track opens to the name's width, the name slides in on a spring. -->
    <span class="name" class:shown={nameShown(item, tab)} aria-hidden="true"><span class="clip"><span class="label">{nameOf(item)}</span></span></span>
  {/if}
{/snippet}

{#snippet toolFace(tool: BarTool)}
  {#if tool === 'quotas'}<Gauge size={15} strokeWidth={1.9} />{:else if tool === 'pin'}<Pin size={15} strokeWidth={1.9} />{:else}<Volume2 size={15} strokeWidth={1.9} />{/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={barRow} class="tabbar" class:editing oncontextmenu={startEditing} data-testid="deck-bar">
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

  <div
    bind:this={itemsRow}
    class="items"
    class:settling={items.settling}
    role={editing ? 'list' : 'tablist'}
    aria-label={editing ? copy.deck.bar.editing : copy.deck.tablist}
    onwheel={wheel}
    onscroll={() => tip && closeTip(tip.key, true)}
    data-testid="deck-bar-items"
  >
    {#each layout.items as item, index (item.key)}
      <div
        class="slot"
        class:carried={items.carried === index}
        class:landing={items.landing}
        role={editing ? 'listitem' : 'none'}
        data-sort
        data-key={item.key}
        data-kind={item.kind}
        style:transform={items.carried === null ? undefined : `translateX(${items.offset(index)}px)`}
        style:--wiggle-delay="{(index % 4) * -70}ms"
        in:pop
        out:pop
        animate:flip={{ duration: reduced ? 0 : 180, easing: cubicOut }}
      >
        {#if editing && renaming === item.key}
          <input
            class="rename"
            value={item.label ?? ''}
            placeholder={defaultName(item)}
            maxlength={LABEL_MAX}
            spellcheck="false"
            autocomplete="off"
            aria-label={fill(copy.deck.bar.renameField, { name: defaultName(item) })}
            {@attach focusField}
            onkeydown={(event) => renameKeys(event, item)}
            onblur={(event) => rename(item, event.currentTarget.value)}
            data-testid="bar-rename"
          />
        {:else if editing}
          <button
            class="thing"
            data-kind={item.kind}
            aria-label={fill(copy.deck.bar.rename, { name: nameOf(item) })}
            {@attach tipped(item.key)}
            onpointerdown={(event) => items.press(event, index, itemsRow)}
            onpointermove={(event) => items.move(event)}
            onpointerup={(event) => (dragged = items.release(event))}
            onpointercancel={() => items.cancel()}
            onclick={() => editClick(item)}
            onkeydown={(event) => editKeys(event, index, item.key, 'items')}
            data-testid="bar-item"
          >
            {@render face(item)}
          </button>
        {:else if item.kind === 'tab'}
          {@const each = item.tab}
          <button
            bind:this={tabButtons[each]}
            id="deck-tab-{each}"
            class="thing tab"
            role="tab"
            aria-selected={tab === each}
            aria-controls="deck-panel"
            aria-label={each === 'music' && companion.media?.playing ? `${nameOf(item)}, ${copy.deck.playing}` : nameOf(item)}
            tabindex={tab === each ? 0 : -1}
            data-testid="deck-tab-button-{each}"
            onclick={() => onpick(each)}
            onkeydown={(event) => tabKeys(event, each)}
            {@attach tipped(item.key)}
          >
            {@render face(item)}
          </button>
        {:else}
          <button
            class="thing shortcut"
            data-kind={item.kind}
            title={item.kind === 'link' ? item.url : undefined}
            aria-label={fill(copy.deck.bar.open, { name: nameOf(item) })}
            onclick={() => void launch(item)}
            data-testid="bar-shortcut"
            {@attach tipped(item.key)}
          >
            {@render face(item)}
          </button>
        {/if}
        {#if editing && renaming !== item.key && canRemove(layout, item.key)}
          <button class="remove" aria-label={fill(copy.deck.bar.remove, { name: nameOf(item) })} title={fill(copy.deck.bar.remove, { name: nameOf(item) })} tabindex="-1" onpointerdown={(event) => event.stopPropagation()} onclick={() => remove(item)} transition:pop data-testid="bar-remove">
            <X size={10} strokeWidth={2.8} />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="tools">
    <div bind:this={toolsRow} class="tool-row" class:settling={tools.settling} role={editing ? 'list' : undefined} aria-label={editing ? copy.deck.bar.toolsHeading : undefined}>
      {#each layout.tools as tool, index (tool)}
        <div
          class="slot"
          class:carried={tools.carried === index}
          class:landing={tools.landing}
          role={editing ? 'listitem' : undefined}
          data-sort
          data-key={tool}
          style:transform={tools.carried === null ? undefined : `translateX(${tools.offset(index)}px)`}
          style:--wiggle-delay="{(index % 4) * -70 - 35}ms"
          in:pop
          out:pop
          animate:flip={{ duration: reduced ? 0 : 180, easing: cubicOut }}
        >
          {#if editing}
            <button
              class="thing tool"
              title={copy.deck.bar.moveTitle}
              aria-label={toolName(tool)}
              onpointerdown={(event) => tools.press(event, index, toolsRow)}
              onpointermove={(event) => tools.move(event)}
              onpointerup={(event) => (dragged = tools.release(event))}
              onpointercancel={() => tools.cancel()}
              onclick={() => (dragged = false)}
              onkeydown={(event) => editKeys(event, index, tool, 'tools')}
              data-testid="bar-tool"
            >
              {@render toolFace(tool)}
            </button>
            <button class="remove" aria-label={fill(copy.deck.bar.remove, { name: toolName(tool) })} title={fill(copy.deck.bar.remove, { name: toolName(tool) })} tabindex="-1" onpointerdown={(event) => event.stopPropagation()} onclick={() => bar.set(removeTool(layout, tool))} transition:pop data-testid="bar-remove">
              <X size={10} strokeWidth={2.8} />
            </button>
          {:else if tool === 'quotas'}
            <QuotasPill compact />
          {:else if tool === 'pin'}
            <button class="tool" class:on={frame.pinned} aria-pressed={frame.pinned} aria-label={frame.pinned ? copy.unpin : copy.pin} title={frame.pinned ? copy.unpin : copy.pin} onclick={() => frame.togglePin()}>
              {#if frame.pinned}<PinOff size={15} strokeWidth={1.9} />{:else}<Pin size={15} strokeWidth={1.9} />{/if}
            </button>
          {:else}
            <button class="tool" aria-pressed={!companion.prefs.sounds} aria-label={companion.prefs.sounds ? copy.mute : copy.unmute} title={companion.prefs.sounds ? copy.mute : copy.unmute} data-testid="island-sound" onclick={toggleSounds}>
              {#if companion.prefs.sounds}<Volume2 size={15} strokeWidth={1.9} />{:else}<VolumeX size={15} strokeWidth={1.9} />{/if}
            </button>
          {/if}
        </div>
      {/each}
    </div>
    {#if editing}
      <button class="done" title={copy.deck.bar.doneTitle} onclick={() => writeBarEdit(false)} data-testid="bar-done">
        <Check size={14} strokeWidth={2.4} />{copy.deck.bar.done}
      </button>
    {:else}
      <button class="tool" class:on={settingsPanel.open} aria-pressed={settingsPanel.open} aria-label={copy.settings} title={copy.settings} data-settings-toggle data-testid="island-settings" onclick={() => settingsPanel.toggle()}>
        <Settings size={15} strokeWidth={1.9} />
      </button>
    {/if}
  </div>

  <!-- The things' names as the eye reads them; their buttons carry the same names for assistive tech. -->
  <div bind:this={tipBox} class="tip" class:on={tipSays !== null} class:gliding style:translate="{tip?.left ?? 0}px 0" aria-hidden="true" data-testid="bar-tip">
    {#if tipItem && tipSays}
      <span class="tip-name">{nameOf(tipItem)}</span>
      {#if tipSays === 'edit'}<span class="tip-more">{copy.deck.bar.moveTitle}</span>{/if}
    {/if}
  </div>
</div>

<style>
  /* The app's global button (a fixed height, a border, a glaze and a shadow) is not the bar's look. */
  button {
    box-shadow: none;
  }
  .tabbar {
    position: relative;
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
  .thing:focus-visible,
  .tool:focus-visible,
  .done:focus-visible {
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

  /* The things kept in the bar, centred, scrolling sideways past the deck's width. Room above them for the × of edit mode. */
  .items {
    display: flex;
    flex: 1;
    justify-content: safe center;
    gap: 4px;
    min-width: 0;
    padding: 8px 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .items::-webkit-scrollbar {
    display: none;
  }
  /* Edit mode: room between the things for their ×. */
  .editing .items,
  .editing .tool-row {
    gap: 6px;
  }
  .slot {
    position: relative;
    flex: none;
    display: flex;
    transition: transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .slot.carried {
    z-index: 2;
  }
  /* Carried, it follows the pointer at once; dropped, it glides to its place. */
  .slot.carried:not(.landing) {
    transition: none;
  }
  .settling > .slot {
    transition: none;
  }
  .thing {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
      color 160ms ease,
      scale 160ms ease,
      box-shadow 160ms ease;
  }
  /* The island's own hover, whatever Boite's theme gives buttons. */
  .thing:hover:not(:disabled),
  .tool:hover:not(:disabled) {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .tab[aria-selected='true'],
  .tab[aria-selected='true']:hover:not(:disabled) {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  /* An app alone is its icon. */
  .thing[data-kind='app'] {
    padding: 0 6px;
  }
  .thing[data-kind='app']:has(.label) {
    padding: 0 9px 0 6px;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
  }
  .glyph img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .letter {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: var(--island-pill);
    color: var(--island-text);
    font-size: 11px;
    font-weight: 700;
  }
  /* Music playing: a still dot on the note's corner. */
  .playing {
    position: absolute;
    top: -3px;
    right: -4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--deck-accent);
  }

  /*
   * A tab: its icon, then its name, folded away unless the deck shows it.
   * The name's track opens from nothing to the name's width (a one-off
   * width change, the pill growing with it) while the name slides in on a
   * spring that overshoots a little; the room around the icon stays the same.
   */
  .thing.tab {
    --bar-spring: linear(0, 0.099, 0.313, 0.552, 0.762, 0.918, 1.017, 1.068, 1.083, 1.077, 1.059, 1.039, 1.022, 1.008, 0.999, 0.995, 0.993, 0.993, 0.995, 0.997, 1);
    gap: 0;
    padding: 0 8px;
  }
  .icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
  }
  .name {
    display: grid;
    grid-template-columns: 0fr;
    transition: grid-template-columns 260ms cubic-bezier(0.2, 0.85, 0.25, 1);
  }
  .name.shown {
    grid-template-columns: 1fr;
  }
  .clip {
    min-width: 0;
    overflow: hidden;
  }
  .name .label {
    display: block;
    padding: 0 3px 0 6px;
    opacity: 0;
    translate: -8px 0;
    transition:
      opacity 120ms ease,
      translate 120ms ease;
  }
  .name.shown .label {
    opacity: 1;
    translate: 0 0;
    transition:
      opacity 180ms ease 40ms,
      translate 380ms var(--bar-spring);
  }
  .editing .thing.tab {
    padding: 0 7px;
  }

  /*
   * The tooltip under the bar: a small black pill like the island, its
   * words on two lines in edit mode. It shows at once and leaves at once;
   * from one thing to the next it glides.
   */
  .tip {
    position: absolute;
    top: 46px;
    left: 0;
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    max-width: 260px;
    padding: 5px 10px 6px;
    border: 1px solid var(--island-line-strong);
    border-radius: 10px;
    background: var(--island-bg);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--island-bg) 70%, transparent);
    color: var(--island-text);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-3px);
  }
  .tip.on {
    opacity: 1;
    transform: none;
    transition:
      opacity 120ms ease,
      transform 160ms ease;
  }
  .tip.on.gliding {
    transition:
      opacity 120ms ease,
      transform 160ms ease,
      translate 240ms cubic-bezier(0.2, 0.85, 0.25, 1);
  }
  .tip-more {
    color: var(--island-muted);
    font-size: 11px;
    font-weight: 400;
  }

  /* Edit mode: every thing outlined, a little restless, ready to be carried. */
  .editing .thing {
    box-shadow: inset 0 0 0 1px var(--island-line-strong);
    color: var(--island-text);
    cursor: grab;
    animation: bots-bar-wiggle 280ms ease-in-out infinite alternate;
    animation-delay: var(--wiggle-delay, 0ms);
    touch-action: none;
  }
  .editing .carried .thing {
    animation: none;
    cursor: grabbing;
    scale: 1.08;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    box-shadow:
      inset 0 0 0 1px var(--deck-accent),
      0 8px 18px color-mix(in srgb, var(--island-bg) 70%, transparent);
  }
  @keyframes bots-bar-wiggle {
    from {
      rotate: -1.4deg;
    }
    to {
      rotate: 1.4deg;
    }
  }
  .rename {
    height: 28px;
    min-width: 6ch;
    max-width: 20ch;
    padding: 0 10px;
    border: 1px solid var(--deck-accent);
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    field-sizing: content;
    outline: none;
  }
  .rename::placeholder {
    color: var(--island-faint);
  }
  .remove {
    position: absolute;
    top: -6px;
    right: -5px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    min-height: 0;
    padding: 0;
    border: 1.5px solid var(--island-bg);
    border-radius: 50%;
    background: var(--island-card-hover);
    color: var(--island-text);
    cursor: pointer;
    transition:
      background 140ms ease,
      color 140ms ease;
  }
  .remove:hover:not(:disabled) {
    background: var(--island-danger);
    color: var(--island-bg);
  }
  .carried .remove {
    opacity: 0;
  }

  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }
  .tool-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 0;
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
  .tool.on {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .thing.tool {
    display: grid;
    padding: 0;
  }
  .done {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    min-height: 0;
    margin-left: 4px;
    padding: 0 12px 0 9px;
    border: none;
    border-radius: 999px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .done:hover:not(:disabled) {
    background: color-mix(in srgb, var(--deck-accent) 32%, transparent);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .thing,
    .tool,
    .slot,
    .remove,
    .done,
    .name,
    .name .label,
    .name.shown .label,
    .tip.on,
    .tip.on.gliding {
      transition: none;
    }
    .name .label {
      translate: 0 0;
    }
    .tip {
      transform: none;
    }
    .editing .thing {
      animation: none;
    }
  }
</style>
