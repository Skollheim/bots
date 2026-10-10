<!--
  One message of the assistant's conversation: the user's on the right in a
  quiet bubble, the answer as light markdown (paragraphs, lists, code with a
  copy button, links that open in the browser through the chat's listener).
  A streaming answer is drawn as it comes; its file names show as small chips.
-->
<script lang="ts">
  import { FileText } from '@lucide/svelte';
  import { renderBlock, renderMarkdown } from '@boite/ui/lib/markdown';
  import type { Bubble } from '../../../lib/island/assistant.svelte';
  import { strings } from '../../../lib/strings';

  let { bubble }: { bubble: Bubble } = $props();
  const copy = strings.island.assistant;

  const html = $derived(bubble.role === 'assistant' && bubble.text ? (bubble.streaming ? renderMarkdown(bubble.text) : renderBlock(bubble.text)) : '');

  /** Each code block gets its copy button, again when the answer grows. */
  function codeCopy(root: HTMLElement) {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const decorate = () => {
      for (const pre of root.querySelectorAll('pre')) {
        if (pre.querySelector(':scope > button.copy')) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy';
        button.textContent = copy.copy;
        button.addEventListener('click', () => {
          const code = pre.querySelector('code')?.textContent ?? '';
          void navigator.clipboard?.writeText(code).then(() => {
            button.textContent = copy.copied;
            const timer = setTimeout(() => {
              button.textContent = copy.copy;
              timers.delete(timer);
            }, 1400);
            timers.add(timer);
          });
        });
        pre.append(button);
      }
    };
    decorate();
    const watcher = new MutationObserver(decorate);
    watcher.observe(root, { childList: true, subtree: true });
    return () => {
      watcher.disconnect();
      timers.forEach(clearTimeout);
    };
  }
</script>

<div class="message" data-role={bubble.role} data-testid="assistant-message">
  {#if bubble.role === 'user'}
    <div class="bubble">
      {#if bubble.text}<p>{bubble.text}</p>{/if}
      {#if bubble.files.length}
        <ul class="files">
          {#each bubble.files as name, index (index)}<li><FileText size={12} />{name}</li>{/each}
        </ul>
      {/if}
    </div>
  {:else}
    <div class="md" {@attach codeCopy}>{@html html}</div>
  {/if}
</div>

<style>
  .message {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .message[data-role='user'] {
    align-items: flex-end;
  }
  .bubble {
    max-width: 86%;
    padding: 7px 11px;
    border-radius: 14px 14px 4px 14px;
    background: var(--island-bubble);
    overflow-wrap: anywhere;
  }
  .bubble p {
    margin: 0;
    white-space: pre-wrap;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }
  .files li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--island-pill);
    color: var(--island-muted);
    font-size: 11.5px;
  }
  .md {
    min-width: 0;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .md :global(:is(p, ul, ol, pre, blockquote)) {
    margin: 0 0 8px;
  }
  .md :global(:is(p, ul, ol, pre, blockquote):last-child) {
    margin-bottom: 0;
  }
  .md :global(:is(ul, ol)) {
    padding-left: 20px;
  }
  .md :global(li + li) {
    margin-top: 2px;
  }
  .md :global(a) {
    color: var(--island-link);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md :global(code) {
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--island-pill);
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 0.9em;
  }
  .md :global(pre) {
    position: relative;
    padding: 10px 12px;
    border: 1px solid var(--island-line);
    border-radius: 10px;
    background: var(--island-code);
    overflow-x: auto;
  }
  .md :global(pre code) {
    padding: 0;
    background: none;
    white-space: pre;
  }
  .md :global(pre > button.copy) {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 8px;
    border: 1px solid var(--island-line-strong);
    border-radius: 6px;
    background: var(--island-card);
    color: var(--island-muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .md :global(pre:is(:hover, :focus-within) > button.copy),
  .md :global(pre > button.copy:focus-visible) {
    opacity: 1;
  }
  .md :global(pre > button.copy:hover) {
    color: var(--island-text);
  }
</style>
