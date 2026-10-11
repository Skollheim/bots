<!--
  The island's assistant (`lib/island/assistant.svelte.ts`): one of the
  user's Boite agents, chosen in a menu, with its model and effort, a way to
  its page in Boite, the conversation scrolled to its end (older messages as
  the reader scrolls up), its edges fading where more is hidden, the answer as it streams with the tool at work on
  one quiet line, the files that go with the next message, and the field.
  Enter sends, also while the agent works (a follow-up), Shift+Enter breaks
  the line, Escape leaves the field. While the field has the keyboard, the
  island stays. With no agent yet, one button leads to where one is made.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowUp, SquareArrowOutUpRight, Square } from '@lucide/svelte';
  import { installExternalLinks } from '@boite/ui/lib/links';
  import { openSettings, showAgent } from '../../../lib/companion/shell';
  import { useView } from '../../../lib/island/contract';
  import { fill, strings } from '../../../lib/strings';
  import CompanionAttachments from '../../companion/CompanionAttachments.svelte';
  import ShotChip from '../views/ShotChip.svelte';
  import AgentMenu from './AgentMenu.svelte';
  import AssistantMessage from './AssistantMessage.svelte';
  import ModelMenu from './ModelMenu.svelte';

  let { menuOpen = $bindable(false), agentsOpen = $bindable(false) }: { menuOpen?: boolean; agentsOpen?: boolean } = $props();

  const view = useView();
  const companion = $derived(view.companion);
  const assistant = $derived(companion.assistant);
  const copy = strings.island.assistant;

  let list = $state<HTMLElement | null>(null);
  let field = $state<HTMLTextAreaElement | null>(null);
  /** The reader is at the end: what streams in keeps it there. */
  let pinned = true;

  const agent = $derived(assistant.agent);
  const name = $derived(agent?.name ?? '');
  /** The agents are read and none is active: nobody to talk to yet. */
  const nobody = $derived(assistant.snapshot !== null && agent === null);
  const last = $derived(assistant.bubbles.at(-1));
  /** Working, and nothing of the answer to read yet. */
  const waiting = $derived(assistant.running && !(last?.role === 'assistant' && last.streaming && last.text));
  const canSend = $derived(agent !== null && (assistant.draft.trim() !== '' || companion.attached.held.length > 0 || companion.shot !== null));
  const notice = $derived(assistant.problem || assistant.failure);

  $effect(() => () => view.hold('chat', false));

  $effect(() => {
    if (!list) return;
    return installExternalLinks(list);
  });

  // New content keeps the end in view while the reader is there. Scrolled in
  // the frame, before it is drawn: read any earlier, the height would lay the
  // chat out a first time at the island's old size.
  let follow = 0;
  $effect(() => {
    void [assistant.bubbles.length, last?.text, assistant.tool, waiting, notice];
    if (!pinned || !list || follow) return;
    follow = requestAnimationFrame(() => {
      follow = 0;
      if (list) list.scrollTop = list.scrollHeight;
    });
  });
  $effect(() => () => cancelAnimationFrame(follow));

  async function scrolled() {
    if (!list) return;
    pinned = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    if (list.scrollTop > 40 || !assistant.hasOlder || assistant.loadingOlder) return;
    const from = list.scrollHeight - list.scrollTop;
    await assistant.loadOlder();
    await tick();
    // The page above keeps what the reader looked at in place.
    if (list) list.scrollTop = list.scrollHeight - from;
  }

  function send() {
    if (!canSend) return;
    pinned = true;
    void assistant.send();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      field?.blur();
    }
  }

  /**
   * The field grows with its text, up to five lines. Where the engine sizes
   * a field to its text (`field-sizing`), the style does it; measuring it here
   * would lay the whole page out twice as the chat opens.
   */
  const sizesItself = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');
  function grow(element: HTMLTextAreaElement) {
    if (sizesItself) return;
    $effect(() => {
      void assistant.draft;
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 110)}px`;
    });
  }
</script>

<div class="assistant" data-testid="island-chat">
  {#if nobody}
    <div class="nobody" data-testid="assistant-no-agent">
      <p>{copy.noAgent}</p>
      <button class="primary small" onclick={() => void openSettings().catch(() => {})}>{copy.makeAgent}</button>
    </div>
  {:else}
    <header class="head">
      <AgentMenu {assistant} bind:open={agentsOpen} />
      {#if agent}
        <ModelMenu {assistant} bind:open={menuOpen} />
        <button
          class="ghost icon reveal"
          aria-label={fill(copy.openAgent, { name })}
          title={fill(copy.openAgent, { name })}
          onclick={() => agent && void showAgent(agent.id).catch(() => {})}
          data-testid="assistant-reveal"
        >
          <SquareArrowOutUpRight size={13} />
        </button>
      {/if}
    </header>

    <div class="list island-fade" bind:this={list} onscroll={() => void scrolled()} role="log" aria-live="polite" aria-busy={assistant.running} data-testid="assistant-log">
      {#if assistant.loadingOlder}<p class="older">{copy.older}</p>{/if}
      {#if agent && assistant.bubbles.length === 0 && !assistant.running}
        <p class="empty">{fill(copy.empty, { name })}</p>
      {/if}
      {#each assistant.bubbles as bubble (bubble.id)}
        <AssistantMessage {bubble} />
      {/each}
      {#if notice}<p class="problem" role="alert">{notice}</p>{/if}
    </div>

    {#if assistant.running}
      <p class="working" data-testid="assistant-working">{assistant.tool ?? fill(copy.working, { name })}</p>
    {/if}

    <div
      class="island-card composer"
      role="group"
      onfocusin={() => view.hold('chat', true)}
      onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) view.hold('chat', false);
      }}
    >
      {#if companion.attached.held.length || companion.attached.reading || companion.attached.problem || companion.shot}
        <div class="chips">
          <CompanionAttachments dropped={companion.attached} />
          {#if companion.shot}<ShotChip />{/if}
        </div>
      {/if}
      <div class="row">
        <textarea
          bind:this={field}
          bind:value={assistant.draft}
          class="assistant-input"
          rows="1"
          placeholder={fill(copy.placeholder, { name })}
          aria-label={fill(copy.placeholder, { name })}
          disabled={!agent}
          onkeydown={keydown}
          {@attach grow}
          data-testid="assistant-input"
        ></textarea>
        {#if assistant.running}
          <button class="round stop" aria-label={copy.stop} title={copy.stop} disabled={assistant.stopping} onclick={() => void assistant.stop()} data-testid="assistant-stop">
            <Square size={12} fill="currentColor" />
          </button>
        {/if}
        {#if canSend || !assistant.running}
          <button class="round send" class:ready={canSend} aria-label={copy.send} title={copy.send} disabled={!canSend} onclick={send} data-testid="assistant-send">
            <ArrowUp size={15} strokeWidth={2.2} />
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .assistant {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .reveal {
    flex: none;
    margin-left: auto;
    color: var(--island-muted);
  }
  .nobody {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 2px;
  }
  .nobody p {
    margin: 0;
    color: var(--island-muted);
    font-size: 12.5px;
    line-height: 1.45;
  }
  /* Its edges fade where more is hidden, as Home's do (`bots.css`, `.island-fade`): the gap is its own. */
  .list {
    --island-fade-gap: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 214px;
    padding: 2px 2px 2px 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .older,
  .empty,
  .working {
    margin: 0;
    color: var(--island-muted);
    font-size: 12.5px;
  }
  .older {
    align-self: center;
    font-size: 11.5px;
  }
  .working {
    margin: -2px 0 -2px 2px;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .problem {
    margin: 0;
    color: var(--island-danger);
    font-size: 12.5px;
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 6px 6px 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  textarea {
    flex: 1;
    min-height: 28px;
    max-height: 110px;
    field-sizing: content;
    padding: 5px 0;
    border: 0;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 13px;
    line-height: 18px;
    resize: none;
    outline: none;
  }
  textarea::placeholder {
    color: var(--island-subtle);
    opacity: 1;
  }
  .round {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }
  .send {
    background: var(--island-pill);
    color: var(--island-muted);
  }
  .send.ready {
    background: var(--island-text);
    color: var(--island-bg);
  }
  .send:disabled {
    opacity: 1;
    cursor: default;
  }
  .stop {
    border: 1px solid var(--island-line-strong);
    background: none;
    color: var(--island-text);
  }
  .stop:hover {
    background: var(--island-card-hover);
  }
</style>
