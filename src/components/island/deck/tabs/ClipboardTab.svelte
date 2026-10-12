<!--
  The deck's "clipboard" tab: the last copies, text and images, newest
  first. A click copies one again; it can also go to the chat's field, or be
  deleted. "Pause" stops recording for the session, "Clear all" asks first.
  The list lives in the shell's memory alone (`lib/windows/clipboard.svelte.ts`):
  nothing here keeps or sends an entry unless the user clicks to send it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { ClipboardList, Copy, MessageSquarePlus, Pause, Play, Trash2, Check } from '@lucide/svelte';
  import { fill, strings } from '../../../../lib/strings';
  import { useView } from '../../../../lib/island/contract';
  import { clipboardHistory as history } from '../../../../lib/windows/clipboard.svelte';
  import { ageOf, fileOfDataUrl, preview } from '../../../../lib/windows/clipboard';
  import { InlineConfirm } from '../../../../lib/windows/confirm.svelte';
  import type { ClipEntry } from '../../../../lib/windows/native';
  import Tile from '../computer/Tile.svelte';

  const COPIED_MS = 1_500;

  const view = useView();
  const copy = $derived(strings.island.deck.clipboard);
  const confirm = new InlineConfirm();

  let now = $state(Date.now());
  let copied = $state<number | null>(null);
  let problem = $state('');
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    void history.refresh();
    const clock = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      clearInterval(clock);
      clearTimeout(copiedTimer);
      confirm.dispose();
    };
  });

  function age(entry: ClipEntry): string {
    const value = ageOf(entry.at, now);
    return value.unit === 'now' ? copy.now : fill(copy[value.unit], { count: String(value.count) });
  }

  async function again(entry: ClipEntry) {
    problem = '';
    try {
      await history.copy(entry.id);
      copied = entry.id;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = null), COPIED_MS);
    } catch {
      problem = copy.failed;
    }
  }

  /** Into the chat's field, whole: the user adds a question and sends it. */
  async function send(entry: ClipEntry) {
    problem = '';
    const item = await history.item(entry.id).catch(() => null);
    if (!item) return void (problem = copy.failed);
    const { companion } = view;
    if (item.text !== null) {
      const draft = companion.assistant.draft.trimEnd();
      companion.assistant.draft = draft ? `${draft}\n\n${item.text}` : item.text;
    } else if (item.image) {
      const file = fileOfDataUrl(item.image, `clipboard-${entry.id}.png`);
      if (!file) return void (problem = copy.failed);
      await companion.attached.add([file]);
    }
    view.show('chat');
  }

  async function clearAll() {
    if (!confirm.confirm('clear')) return;
    await history.clear().catch(() => (problem = copy.failed));
  }

  function focusNow(element: HTMLElement) {
    element.focus();
  }
</script>

<div class="tab" data-testid="deck-tab-clipboard">
  <Tile heading={copy.heading} scroll testid="clipboard-list">
    {#snippet aside()}
      {#if history.enabled}
        <div class="tools">
          {#if history.entries.length > 0}<span class="count">{fill(copy.count, { count: String(history.entries.length) })}</span>{/if}
          <button class="tool" class:on={history.paused} aria-pressed={history.paused} onclick={() => history.setPaused(!history.paused)} data-testid="clipboard-pause">
            {#if history.paused}<Play size={14} />{copy.resume}{:else}<Pause size={14} />{copy.pause}{/if}
          </button>
          {#if confirm.is('clear')}
            <span class="ask" role="group" aria-label={copy.clearConfirm}>
              <span>{copy.clearConfirm}</span>
              <button class="yes" {@attach focusNow} onclick={clearAll} data-testid="clipboard-clear-confirm">{copy.confirm}</button>
              <button class="no" onclick={() => confirm.cancel()}>{copy.cancel}</button>
            </span>
          {:else}
            <button class="tool" disabled={history.entries.length === 0} onclick={() => confirm.arm('clear')} data-testid="clipboard-clear"><Trash2 size={14} />{copy.clear}</button>
          {/if}
        </div>
      {/if}
    {/snippet}

    {#if history.paused && history.enabled}<p class="banner" role="status">{copy.paused}</p>{/if}

    {#if !history.enabled}
      <div class="empty">
        <ClipboardList size={28} strokeWidth={1.5} />
        <p>{copy.off}</p>
        <p class="sub">{copy.offHint}</p>
      </div>
    {:else if history.entries.length === 0}
      <div class="empty" data-testid="clipboard-empty">
        <ClipboardList size={28} strokeWidth={1.5} />
        <p>{copy.empty}</p>
        <p class="sub">{copy.emptyHint}</p>
      </div>
    {:else}
      <ul class="entries">
        {#each history.entries as entry (entry.id)}
          <li>
            <button class="entry" title={copy.copy} onclick={() => again(entry)} data-testid="clipboard-entry">
              {#if entry.kind === 'image'}
                <span class="thumb">{#if entry.thumb}<img src={entry.thumb} alt="" draggable="false" />{/if}</span>
                <span class="body">
                  <span class="text">{fill(copy.image, { width: String(entry.width), height: String(entry.height) })}</span>
                  <span class="meta">{age(entry)}</span>
                </span>
              {:else}
                <span class="body">
                  <span class="text clamp">{preview(entry.text ?? '')}</span>
                  <span class="meta">{age(entry)} · {fill(copy.chars, { count: String(entry.chars) })}</span>
                </span>
              {/if}
              <span class="state" aria-hidden="true">
                {#if copied === entry.id}<Check size={15} />{:else}<Copy size={14} />{/if}
              </span>
            </button>
            <button class="act" aria-label={copy.send} title={copy.send} onclick={() => send(entry)} data-testid="clipboard-send"><MessageSquarePlus size={15} /></button>
            <button class="act" aria-label={copy.remove} title={copy.remove} onclick={() => history.remove(entry.id)} data-testid="clipboard-remove"><Trash2 size={15} /></button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if copied !== null}<p class="sr" role="status">{copy.copied}</p>{/if}
    {#if problem}<p class="note problem" role="status">{problem}</p>{/if}
  </Tile>
</div>

<style>
  /* The app's global button (a fixed height, a border, a glaze and a shadow) is not the deck's look. */
  button {
    height: auto;
    border: none;
    box-shadow: none;
  }
  .yes:hover:not(:disabled) {
    background: var(--deck-accent);
  }
  .tab {
    /* The hover of a button without its own: the deck's, not the app's glaze. */
    --control-glaze: none;
    --color-control-hover: var(--deck-tile-hover);
    display: grid;
    height: 380px;
    color: var(--island-text);
    font-family: var(--island-font);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .count {
    margin-right: 4px;
    color: var(--island-muted);
    font-family: var(--deck-numeral-font);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border: none;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .tool:hover:not(:disabled) {
    background: var(--deck-tile-hover);
  }
  .tool.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .tool:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ask {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 2px 2px 10px;
    border-radius: 999px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 12px;
    font-weight: 600;
  }
  .yes,
  .no {
    padding: 4px 10px;
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
    background: transparent;
    color: var(--island-muted);
  }
  .banner {
    margin: 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font-size: 12px;
  }
  .empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--island-faint);
    text-align: center;
  }
  .empty p {
    margin: 0;
    color: var(--island-text);
    font-size: 14px;
  }
  .empty .sub {
    max-width: 380px;
    color: var(--island-muted);
    font-size: 12px;
  }
  .entries {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    border-radius: 12px;
    background: var(--deck-field);
  }
  .entry {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 9px 12px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--island-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  li:hover {
    background: var(--deck-tile-hover);
  }
  .entry:active,
  .tool:active,
  .act:active {
    transform: scale(0.98);
  }
  .thumb {
    display: grid;
    flex: none;
    place-items: center;
    width: 64px;
    height: 40px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--island-pill);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .text {
    font-size: 13px;
    line-height: 1.35;
    white-space: normal;
    word-break: break-word;
  }
  .clamp {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .meta {
    color: var(--island-muted);
    font-size: 11px;
  }
  .state {
    display: grid;
    flex: none;
    place-items: center;
    width: 20px;
    color: var(--island-faint);
  }
  .entry:hover .state {
    color: var(--deck-accent-ink);
  }
  .act {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--island-muted);
    cursor: pointer;
  }
  .act:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .note {
    margin: 0;
    font-size: 12px;
  }
  .problem {
    color: var(--island-danger);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .entry,
    .tool,
    .act {
      transition: none;
    }
    button:active {
      transform: none !important;
    }
  }
</style>
