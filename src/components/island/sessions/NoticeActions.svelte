<!--
  A finished thread's actions, on its card or its session row: start it again,
  archive it, and, in the island, the changes waiting in its folder, one file
  open at a time. What failed says so in a line under the buttons.
-->
<script lang="ts">
  import { Archive, FileDiff, RotateCcw } from '@lucide/svelte';
  import type { GitChange } from '@boite/contracts';
  import type { Client } from '@boite/ui/lib/client';
  import { fileName } from '@boite/ui/lib/tool-summary';
  import type { SessionDiff as Diff } from '../../../lib/island/sessions';
  import { archive, changeCount, changeOf, changesOf, CHANGES_SHOWN, relaunch } from '../../../lib/island/thread-actions';
  import { fill, strings } from '../../../lib/strings';
  import SessionDiff from './SessionDiff.svelte';

  interface Props {
    threadId: string;
    failed: boolean;
    client: Client | null;
    /** The changes may unfold here: the island has room for them, the desktop card does not. */
    changes?: boolean;
    /** The thread started again or left: its card goes. */
    ongone?: () => void;
    /** Archives in its stead: Home's row archives so that it can be undone (`archive-undo.svelte.ts`). A refusal throws. */
    onarchive?: () => Promise<void>;
  }

  let { threadId, failed, client, changes = false, ongone, onarchive }: Props = $props();

  const copy = strings.island.notice;
  let busy = $state<'relaunch' | 'archive' | null>(null);
  let problem = $state('');
  let files = $state.raw<GitChange[] | null>(null);
  let showing = $state(false);
  let openPath = $state<string | null>(null);
  let diff = $state.raw<Diff | null | 'binary'>(null);

  const reason = (error: unknown) => fill(copy.failed, { reason: error instanceof Error ? error.message : String(error) });

  async function act(kind: 'relaunch' | 'archive') {
    if (!client || busy) return;
    busy = kind;
    problem = '';
    try {
      if (kind === 'relaunch') await relaunch(client, threadId, failed);
      else if (onarchive) return await onarchive();
      else await archive(client, threadId);
      ongone?.();
    } catch (error) {
      problem = reason(error);
    } finally {
      busy = null;
    }
  }

  async function toggleChanges() {
    showing = !showing;
    if (!showing || !client) return;
    problem = '';
    try {
      files = await changesOf(client, threadId);
    } catch (error) {
      problem = reason(error);
      showing = false;
    }
  }

  async function openFile(path: string) {
    if (!client) return;
    if (openPath === path) {
      openPath = null;
      diff = null;
      return;
    }
    openPath = path;
    diff = null;
    try {
      const read = await changeOf(client, threadId, path);
      if (openPath === path) diff = read ?? 'binary';
    } catch (error) {
      if (openPath === path) problem = reason(error);
    }
  }
</script>

<div class="actions" data-testid="notice-actions">
  <div class="row">
    <button class="act" disabled={!client || busy !== null} onclick={() => void act('relaunch')} title={failed ? copy.retryTitle : copy.continueTitle} data-testid="notice-relaunch">
      <RotateCcw size={12} strokeWidth={2} />
      <span>{busy === 'relaunch' ? copy.relaunching : copy.relaunch}</span>
    </button>
    <button class="act" disabled={!client || busy !== null} onclick={() => void act('archive')} title={copy.archiveTitle} data-testid="notice-archive">
      <Archive size={12} strokeWidth={2} />
      <span>{busy === 'archive' ? copy.archiving : copy.archive}</span>
    </button>
    {#if changes}
      <button class="act" class:on={showing} aria-expanded={showing} disabled={!client} onclick={() => void toggleChanges()} data-testid="notice-changes">
        <FileDiff size={12} strokeWidth={2} />
        <span>{showing ? copy.hideChanges : copy.changes}</span>
        {#if showing && files}<span class="count">{files.length}</span>{/if}
      </button>
    {/if}
  </div>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
  {#if showing && files}
    {#if files.length === 0}
      <p class="empty">{copy.noChanges}</p>
    {:else}
      <ul class="files">
        {#each files.slice(0, CHANGES_SHOWN) as file (file.path)}
          <li>
            <button class="file" class:on={openPath === file.path} aria-expanded={openPath === file.path} title={file.path} onclick={() => void openFile(file.path)}>
              <span class="name">{fileName(file.path)}</span>
              <span class="numbers">{changeCount(file)}</span>
            </button>
            {#if openPath === file.path}
              {#if diff === 'binary'}
                <p class="empty">{copy.binary}</p>
              {:else if diff}
                <SessionDiff {diff} />
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if files.length > CHANGES_SHOWN}<p class="empty">{fill(copy.more, { count: String(files.length - CHANGES_SHOWN) })}</p>{/if}
    {/if}
  {/if}
</div>

<style>
  .actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border: 1px solid var(--color-edge);
    border-radius: 999px;
    background: none;
    color: var(--color-muted-foreground);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .act:hover:not(:disabled),
  .act.on {
    background: var(--color-hover);
    color: var(--color-foreground);
  }
  .act:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .act:focus-visible,
  .file:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
  .count {
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }
  .problem {
    margin: 0;
    color: var(--color-danger);
    font-size: 11.5px;
  }
  .empty {
    margin: 0;
    color: var(--color-muted-foreground);
    font-size: 11.5px;
  }
  .files {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .file {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--color-foreground);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .file:hover,
  .file.on {
    background: var(--color-hover);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .numbers {
    flex: none;
    color: var(--color-muted-foreground);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
</style>
