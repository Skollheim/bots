<!--
  The line an archived row leaves in its place for a few seconds
  (`archive-undo.ts`): "Archived", the thread's title, and Undo, with a thin
  bar running out over those seconds (a transform, nothing else moves). What
  stopped the Undo says so on the line.
-->
<script lang="ts">
  import { Archive } from '@lucide/svelte';
  import { UNDO_MS, type UndoLine } from '../../../lib/island/archive-undo';
  import { fill, strings } from '../../../lib/strings';

  let { line, onundo }: { line: UndoLine; onundo(): void } = $props();

  const copy = strings.island.notice;
</script>

<li class="undo" data-testid="session-undo" style:--undo-ms="{UNDO_MS}ms">
  <div class="head">
    <span class="mark" aria-hidden="true"><Archive size={13} strokeWidth={1.9} /></span>
    <p class="words" role="status">
      <span class="said">{copy.archived}</span><span class="title">&nbsp;· {line.row.title}</span>
    </p>
    <button class="undo-button" disabled={line.undoing} title={fill(copy.undoTitle, { title: line.row.title })} onclick={onundo} data-testid="session-undo-button">
      {line.undoing ? copy.undoing : copy.undo}
    </button>
  </div>
  {#if line.problem}<p class="problem" role="alert">{line.problem}</p>{/if}
  {#key line.at}<span class="run" aria-hidden="true"><i></i></span>{/key}
</li>

<style>
  .undo {
    position: relative;
    padding: 2px 0;
  }
  :global(.session) + .undo,
  .undo + :global(.session),
  .undo + :global(.undo) {
    border-top: 1px solid var(--island-line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
  }
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    color: var(--island-muted);
  }
  .words {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .said {
    color: var(--island-text);
    font-weight: 500;
  }
  .title {
    color: var(--island-muted);
  }
  .undo-button {
    flex: none;
    height: 26px;
    padding: 0 12px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .undo-button:hover:not(:disabled) {
    background: var(--island-card-hover);
  }
  .undo-button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .undo-button:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  .problem {
    margin: 0 0 6px 32px;
    color: var(--island-danger);
    font-size: 11.5px;
  }
  /* The seconds left, running out once: a transform only. */
  .run {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 32px;
    height: 2px;
    overflow: hidden;
    border-radius: 1px;
    background: var(--island-line);
  }
  .run i {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--island-muted);
    transform-origin: left;
    animation: run-out var(--undo-ms) linear forwards;
  }
  @keyframes run-out {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .run i {
      animation: none;
    }
  }
</style>
