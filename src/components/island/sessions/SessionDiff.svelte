<!--
  The change an Edit or Write step made, as a small line diff: added lines on
  green, removed ones on red, folded runs of unchanged lines as one row. The
  only monospace of the island; its height is capped and it scrolls.
-->
<script lang="ts">
  import { diffRows } from '@boite/ui/lib/diff';
  import { fileName } from '@boite/ui/lib/tool-summary';
  import type { SessionDiff } from '../../../lib/island/sessions';
  import { fill, strings } from '../../../lib/strings';

  let { diff }: { diff: SessionDiff } = $props();

  const rows = $derived(diffRows(diff.oldText, diff.newText));

  /** Once the island has grown for it (its spring takes about this long), the diff scrolls into view. */
  const SETTLE_MS = 360;
  function reveal(node: HTMLElement) {
    const timer = setTimeout(() => node.scrollIntoView({ block: 'nearest' }), SETTLE_MS);
    return () => clearTimeout(timer);
  }
</script>

<div class="diff" data-testid="session-diff" title={diff.path} {@attach reveal}>
  <p class="file">{fileName(diff.path)}</p>
  <div class="lines">
    {#each rows as row, index (index)}
      {#if row.kind === 'gap'}
        <div class="gap">{fill(strings.island.sessions.folded, { count: String(row.hidden) })}</div>
      {:else}
        <div class="line" data-kind={row.kind}><span class="sign" aria-hidden="true">{row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' '}</span>{row.text}</div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .diff {
    margin: 4px 0 2px;
    border: 1px solid var(--island-line);
    border-radius: 10px;
    overflow: hidden;
  }
  .file {
    margin: 0;
    padding: 4px 8px;
    border-bottom: 1px solid var(--island-line);
    color: var(--island-muted);
    font-size: 11px;
  }
  .lines {
    max-height: 140px;
    overflow: auto;
    padding: 4px 0;
    font: 11px/1.5 var(--island-mono);
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.15) transparent;
  }
  .line {
    padding: 0 8px;
    white-space: pre;
    color: var(--island-muted);
  }
  .sign {
    display: inline-block;
    width: 1.4ch;
    user-select: none;
  }
  .line[data-kind='add'] {
    background: var(--island-diff-add);
    color: var(--island-diff-add-ink);
  }
  .line[data-kind='remove'] {
    background: var(--island-diff-remove);
    color: var(--island-diff-remove-ink);
  }
  .gap {
    padding: 0 8px;
    color: var(--island-faint);
    font-family: var(--island-font);
  }
</style>
