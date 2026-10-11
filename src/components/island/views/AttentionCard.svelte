<!--
  What the island lays over its view while an agent waits on the user: one
  amber card at a time, with "1 of 3" and previous / next when several wait.
  A permission: Deny (Escape), Always… and Allow once (Enter). Always… opens
  a row for where the rule holds, this thread or this project, which takes no
  click for `ARM_MS`; Escape closes it. A question: its choices
  (keys 1 to 9) and a free answer when it takes one. A request answered
  elsewhere leaves at once (`Companion.settled`).
-->
<script lang="ts">
  import { BellRing, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import type { QuestionRequest } from '@boite/contracts';
  import type { RequestAction } from '../../../lib/companion/companion.svelte';
  import { describePermission, threadLabel } from '../../../lib/companion/describe';
  import { ruleTarget, ruleText } from '../../../lib/island/allow-rules';
  import { useView } from '../../../lib/island/contract';
  import { keyAction, placeIn, requestQueue, step, type PendingRequest } from '../../../lib/island/requests';
  import { fill, strings } from '../../../lib/strings';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.sessions.card;
  const allow = strings.island.allow;
  /** How long the scopes take no click once they show, as the pill's answers. */
  const ARM_MS = 400;

  const queue = $derived(requestQueue(companion.permissions, companion.questions));
  let index = $state(0);
  let shownId = $state<string | null>(null);
  const at = $derived(placeIn(queue, shownId, index));
  const current = $derived<PendingRequest | null>(queue[at] ?? null);
  const origin = $derived(current ? threadLabel(companion.threads, companion.projects, current.request.threadId) : null);

  // The card keeps to the request it shows while others come and go.
  $effect(() => {
    shownId = current?.id ?? null;
    index = at;
  });

  let busy = $state<string | null>(null);
  let failure = $state<{ id: string; message: string } | null>(null);
  let picked = $state<string[]>([]);
  let draft = $state('');
  /** The permission whose "Always…" is open, and once its scopes take a click. */
  let scoping = $state<string | null>(null);
  let armedScope = $state<string | null>(null);

  $effect(() => {
    const id = scoping;
    if (!id) return;
    const arm = setTimeout(() => (armedScope = id), ARM_MS);
    return () => clearTimeout(arm);
  });

  function openScopes(id: string) {
    armedScope = null;
    scoping = scoping === id ? null : id;
  }

  // Another request in view starts with no pick and an empty field.
  $effect(() => {
    void current?.id;
    picked = [];
    draft = '';
    scoping = null;
  });

  function go(by: -1 | 1) {
    const next = step(at, queue.length, by);
    index = next;
    shownId = queue[next]?.id ?? null;
  }

  async function act(id: string, action: RequestAction) {
    if (busy) return;
    busy = id;
    failure = null;
    try {
      await companion.act(action);
    } catch (error) {
      failure = { id, message: error instanceof Error ? error.message : String(error) };
    } finally {
      busy = null;
    }
  }

  function pick(question: QuestionRequest, optionId: string) {
    if (question.multiple) picked = picked.includes(optionId) ? picked.filter((entry) => entry !== optionId) : [...picked, optionId];
    else void act(question.id, { kind: 'answer', question, optionIds: [optionId] });
  }

  function sendText(question: QuestionRequest) {
    const text = draft.trim();
    if (text) void act(question.id, { kind: 'answer', question, optionIds: picked, text });
  }

  function onkey(event: KeyboardEvent) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    const control = !!target?.closest('button, a, [role="button"], [role="tab"]');
    // Escape closes the scopes first: it would deny otherwise.
    if (event.key === 'Escape' && scoping && scoping === current?.id) {
      event.preventDefault();
      event.stopPropagation();
      scoping = null;
      return;
    }
    const action = keyAction(current, { key: event.key, modified: event.ctrlKey || event.altKey || event.metaKey, typing, control });
    if (!action || !current || busy) return;
    // The island's own Escape (it closes) waits behind the card's.
    event.preventDefault();
    event.stopPropagation();
    if (current.kind === 'permission') {
      const request = current.request;
      void act(request.id, { kind: action.kind === 'deny' ? 'deny' : 'allow', request });
    } else if (action.kind === 'pick') pick(current.request, action.optionId);
  }
</script>

<svelte:window onkeydowncapture={onkey} />

{#snippet hint(key: string)}<kbd aria-hidden="true">{key}</kbd>{/snippet}

<section class="attention" role="alert" data-testid="island-attention">
  <header>
    <BellRing size={14} aria-hidden="true" />
    <span class="title">{strings.island.attention.title}</span>
    {#if queue.length > 1}
      <span class="pager">
        <button class="nav" aria-label={copy.previous} title={copy.previous} onclick={() => go(-1)}><ChevronLeft size={14} strokeWidth={2} /></button>
        <span class="of" data-testid="attention-of">{fill(copy.of, { index: String(at + 1), count: String(queue.length) })}</span>
        <button class="nav" aria-label={copy.next} title={copy.next} onclick={() => go(1)}><ChevronRight size={14} strokeWidth={2} /></button>
      </span>
    {/if}
  </header>

  {#if current && origin}
    {@const waiting = busy === current.id}
    {#key current.id}
      <div class="request" class:waiting>
        <p class="origin"><span class="thread">{origin.title}</span>{#if origin.project}<span class="project">&nbsp;· {origin.project}</span>{/if}</p>
        {#if current.kind === 'permission'}
          {@const request = current.request}
          {@const said = describePermission(request)}
          {@const target = ruleTarget(request)}
          {@const ruleTitle = target ? fill(allow.alwaysTitle, { rule: ruleText(target) }) : allow.cannot}
          {@const inProject = companion.threads.some((thread) => thread.id === request.threadId && thread.projectId)}
          {@const armed = armedScope === request.id && !waiting}
          <p class="ask">{said.verb}{#if said.target}&nbsp;<code>{said.target}</code>{/if}</p>
          {#if request.description}<p class="hint">{request.description}</p>{/if}
          <div class="actions">
            <button class="button ghost" disabled={waiting} data-testid="attention-deny" onclick={() => act(request.id, { kind: 'deny', request })}>
              {copy.deny}{@render hint(copy.keyEscape)}
            </button>
            <button
              class="button ghost"
              disabled={waiting || !target}
              title={ruleTitle}
              aria-expanded={scoping === request.id}
              data-testid="attention-always"
              onclick={() => openScopes(request.id)}
            >
              {allow.always}
            </button>
            <button class="button primary" disabled={waiting} data-testid="attention-allow" onclick={() => act(request.id, { kind: 'allow', request })}>
              {copy.allowOnce}{@render hint(copy.keyEnter)}
            </button>
          </div>
          {#if scoping === request.id}
            <div class="scopes" role="group" aria-label={allow.always} data-testid="attention-scopes">
              <span class="hint">{allow.hint}</span>
              <button
                class="button scope"
                aria-disabled={!armed}
                disabled={waiting}
                title={ruleTitle}
                data-testid="attention-always-thread"
                onclick={() => armed && act(request.id, { kind: 'always', request, scope: 'thread' })}
              >
                {allow.threadLong}
              </button>
              <button
                class="button scope"
                aria-disabled={!armed}
                disabled={waiting || !inProject}
                title={ruleTitle}
                data-testid="attention-always-project"
                onclick={() => armed && act(request.id, { kind: 'always', request, scope: 'project' })}
              >
                {allow.projectLong}
              </button>
            </div>
          {/if}
        {:else}
          {@const question = current.request}
          <p class="ask">{question.text}</p>
          {#if question.options.length > 0}
            <div class="choices">
              {#each question.options as option, number (option.id)}
                <button
                  class="button choice"
                  title={option.description}
                  aria-pressed={question.multiple ? picked.includes(option.id) : undefined}
                  disabled={waiting}
                  onclick={() => pick(question, option.id)}
                >
                  {#if number < 9}{@render hint(String(number + 1))}{/if}{option.label}
                </button>
              {/each}
            </div>
          {/if}
          {#if question.allowText}
            <form class="free" onsubmit={(event) => { event.preventDefault(); sendText(question); }}>
              <input type="text" placeholder={copy.answer} aria-label={copy.answer} disabled={waiting} bind:value={draft} />
              <button class="button primary" type="submit" disabled={waiting || !draft.trim()}>{copy.send}</button>
            </form>
          {/if}
          <div class="actions">
            <button class="button ghost" disabled={waiting} onclick={() => act(question.id, { kind: 'skip', question })}>{copy.skip}</button>
            {#if question.multiple}
              <button class="button primary" disabled={waiting || picked.length === 0} onclick={() => act(question.id, { kind: 'answer', question, optionIds: picked })}>
                {strings.companion.confirm}
              </button>
            {/if}
          </div>
        {/if}
        {#if failure?.id === current.id}<p class="failure" role="alert">{failure.message}</p>{/if}
      </div>
    {/key}
  {/if}
</section>

<style>
  .attention {
    flex: none;
    border: 1px solid rgb(245 165 36 / 0.45);
    border-radius: 14px;
    background: linear-gradient(rgb(245 165 36 / 0.1), rgb(245 165 36 / 0.03) 64px), var(--island-card);
    box-shadow: var(--island-card-edge);
    overflow: hidden;
    animation: arrive 320ms ease-out;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 6px 8px 0 12px;
    color: var(--island-attention);
    font-weight: 600;
  }
  .title {
    flex: 1;
    min-width: 0;
  }
  .pager {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--island-muted);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .nav {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .nav:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .request {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 12px 12px;
    animation: turn 180ms ease-out;
  }
  .request.waiting {
    opacity: 0.6;
  }
  .origin,
  .ask,
  .hint,
  .failure {
    margin: 0;
  }
  .origin {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .thread {
    font-weight: 500;
  }
  .project,
  .hint {
    color: var(--island-muted);
  }
  .hint {
    font-size: 12px;
  }
  .ask code {
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .failure {
    color: var(--island-danger);
    font-size: 12px;
  }
  .actions,
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions {
    justify-content: flex-end;
  }
  .button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: var(--island-pill);
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .button:hover:not(:disabled) {
    background: var(--island-card-hover);
  }
  .button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .button.ghost {
    background: none;
  }
  .button.primary {
    border-color: transparent;
    background: var(--island-attention);
    color: var(--island-attention-ink);
  }
  .button.primary:hover:not(:disabled) {
    background: var(--island-attention);
    filter: brightness(1.08);
  }
  .button.choice[aria-pressed='true'] {
    border-color: var(--island-attention);
  }
  /* "Always…": where the rule holds, and that it holds while Bots runs. */
  .scopes {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    animation: turn 180ms ease-out;
  }
  .scopes .hint {
    flex: 1 1 160px;
    min-width: 0;
  }
  .button.scope {
    border-color: var(--island-attention);
    background: none;
    color: var(--island-attention);
  }
  .button.scope:hover:not(:disabled, [aria-disabled='true']) {
    background: var(--island-card-hover);
  }
  .button.scope[aria-disabled='true'] {
    cursor: default;
    opacity: 0.55;
  }
  .button:focus-visible,
  .nav:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  kbd {
    padding: 0 4px;
    border-radius: 4px;
    background: var(--island-key);
    color: inherit;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    opacity: 0.8;
  }
  .button.primary kbd {
    background: rgb(0 0 0 / 0.14);
  }
  .free {
    display: flex;
    gap: 6px;
  }
  .free input {
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: var(--island-bg);
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
  }
  .free input:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 0;
  }
  .free input::placeholder {
    color: var(--island-muted);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @keyframes turn {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .attention,
    .request,
    .scopes {
      animation: none;
    }
  }
</style>
