<!--
  One live session in Home: its robot, its title (a click shows the thread in
  Boite), its project, its state and how long it has been at it. Unfolded, its
  last steps, newest at the bottom: the tool, its target and a status mark; an
  Edit or Write step opens the change it made. A finished thread's card folds
  into its row: the reply's first line, and answer or dismiss it from here.
  An ended row offers to start the thread again, archive it, or show the
  changes in its folder (`NoticeActions.svelte`); archived, it can be undone
  for a few seconds (`archive-undo.ts`). A row can be followed in the pill
  (`followed.ts`): a small eye before its time says so. The actions show on
  the row under the pointer or the focus, over the row's end and over its
  second line, so they take no room and the list never moves. The time
  reads calm (`session-time.ts`): seconds under a minute only.
-->
<script lang="ts">
  import { Check, ChevronDown, CornerDownLeft, Eye, EyeOff, FileDiff, Minus, X } from '@lucide/svelte';
  import type { Notes, Notice } from '../../../lib/companion/notes.svelte';
  import { seededRobot } from '../../../lib/robots';
  import { isLive, type SessionRow } from '../../../lib/island/sessions';
  import { unfolding } from '../../../lib/island/sessions.svelte';
  import { rowDoing, toolLabel } from '../../../lib/island/session-text';
  import { sessionTime } from '../../../lib/island/session-time';
  import { strings } from '../../../lib/strings';
  import RobotFace from '../../agents/RobotFace.svelte';
  import CompanionReply from '../../companion/CompanionReply.svelte';
  import NoticeActions from './NoticeActions.svelte';
  import SessionDiff from './SessionDiff.svelte';

  interface Props {
    row: SessionRow;
    project: string;
    now: number;
    /** The finished card of this thread, folded into the row; null when none stands. */
    notice: Notice | null;
    notes: Notes;
    /** The pill follows this thread. */
    followed: boolean;
    onreveal(threadId: string): void;
    onfollow(): void;
    /** Archives the thread so that it can be undone; a refusal throws. */
    onarchive(): Promise<void>;
  }

  let { row, project, now, notice, notes, followed, onreveal, onfollow, onarchive }: Props = $props();

  const copy = strings.island.sessions;
  const unfolded = $derived(unfolding.rows.includes(row.id));
  const opened = $derived(unfolding.diff);
  const replying = $derived(!!notice && notes.replying === notice.id);

  function fold() {
    unfolding.rows = unfolded ? unfolding.rows.filter((id) => id !== row.id) : [...unfolding.rows, row.id];
  }

  function openDiff(stepId: string) {
    unfolding.diff = unfolding.diff === stepId ? null : stepId;
  }

  const robot = $derived(seededRobot(row.id, 'box'));
  const face = $derived(row.state === 'working' ? 'working' : row.state === 'waiting' ? 'waiting' : 'still');
  // A row at rest saw no turn here: it has no time to tell.
  const time = $derived(row.resting ? '' : sessionTime((row.endedAt ?? now) - row.since));
  const state = $derived(row.resting && row.state === 'done' ? copy.followState.resting : copy.states[row.state]);
  const line = $derived(isLive(row) ? (rowDoing(row) ?? '') : (notice?.line ?? ''));
</script>

<li class="session" class:unfolded class:closed={!isLive(row) && !replying} data-state={row.state} data-testid="session-row">
  <div class="head">
    <span class="avatar" aria-hidden="true"><RobotFace {robot} state={face} /></span>
    <button class="title" title={copy.reveal} onclick={() => onreveal(row.id)}>
      <span class="name">{row.title}{#if project}<span class="project">&nbsp;· {project}</span>{/if}</span>
      <span class="sub">
        <span class="state">{state}</span>{#if line}<span class="step">&nbsp;· {line}</span>{/if}
      </span>
    </button>
    <span class="time">
      {#if followed}<span class="followed" title={copy.followed} data-testid="session-followed"><Eye size={11} strokeWidth={2} aria-hidden="true" /><span class="sr">{copy.followed}</span></span>{/if}{time}
    </span>
    <span class="tools">
      <button
        class="act"
        class:on={followed}
        aria-pressed={followed}
        aria-label={followed ? copy.unfollow : copy.follow}
        title={followed ? copy.unfollow : copy.follow}
        data-testid="session-follow"
        onclick={onfollow}
      >
        {#if followed}<EyeOff size={13} strokeWidth={1.9} />{:else}<Eye size={13} strokeWidth={1.9} />{/if}
      </button>
      {#if notice && !replying}
        <button class="act" aria-label={strings.companion.reply.action} title={strings.companion.reply.action} data-testid="session-reply" onclick={() => notes.answer(notice.id)}>
          <CornerDownLeft size={13} strokeWidth={1.9} />
        </button>
      {/if}
      {#if notice}
        <button class="act" aria-label={strings.companion.dismiss} title={strings.companion.dismiss} data-testid="session-dismiss" onclick={() => notes.dismiss(notice.id)}>
          <X size={13} strokeWidth={1.9} />
        </button>
      {/if}
    </span>
    <button
      class="fold"
      class:on={unfolded}
      aria-expanded={unfolded}
      aria-label={unfolded ? copy.hideSteps : copy.showSteps}
      title={unfolded ? copy.hideSteps : copy.showSteps}
      data-testid="session-fold"
      onclick={fold}
    >
      <ChevronDown size={14} strokeWidth={2} />
    </button>
  </div>
  {#if !isLive(row) && !replying}
    <div class="ended">
      <NoticeActions threadId={row.id} failed={row.state === 'failed'} client={notes.client} changes ongone={() => notice && notes.dismiss(notice.id)} {onarchive} />
    </div>
  {/if}
  {#if notice && replying}
    <div class="answering" data-testid="session-answering">
      {#if notice.text}<p class="answer">{notice.text}</p>{/if}
      <CompanionReply title={notice.title} problem={notes.replyProblem} onsend={(text) => notes.reply(notice.id, text)} oncancel={() => notes.answer(null)} />
    </div>
  {/if}
  {#if unfolded}
    {#if row.steps.length === 0}
      <p class="empty">{copy.noSteps}</p>
    {:else}
      <ol class="steps">
        {#each row.steps as entry (entry.id)}
          <li class="step-row" data-status={entry.status} data-kind={entry.kind}>
            <span class="mark" title={copy.stepStatus[entry.status]}>
              {#if entry.status === 'running'}<i class="spin" aria-hidden="true"></i>
              {:else if entry.status === 'done'}<Check size={12} strokeWidth={2.4} aria-hidden="true" />
              {:else if entry.status === 'error'}<X size={12} strokeWidth={2.4} aria-hidden="true" />
              {:else}<Minus size={12} strokeWidth={2.4} aria-hidden="true" />{/if}
              <span class="sr">{copy.stepStatus[entry.status]}</span>
            </span>
            <span class="tool" title={entry.name || undefined}>{toolLabel(entry)}</span>
            <span class="target" title={entry.target}>{entry.target}</span>
            {#if entry.diff}
              <button
                class="change"
                class:on={opened === entry.id}
                aria-expanded={opened === entry.id}
                aria-label={opened === entry.id ? copy.hideDiff : copy.showDiff}
                title={opened === entry.id ? copy.hideDiff : copy.showDiff}
                data-testid="session-diff-toggle"
                onclick={() => openDiff(entry.id)}
              >
                <FileDiff size={13} strokeWidth={1.9} />
              </button>
            {/if}
            {#if entry.diff && opened === entry.id}
              <div class="diff-slot"><SessionDiff diff={entry.diff} /></div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</li>

<style>
  .session {
    padding: 2px 0;
  }
  .session + :global(.session) {
    border-top: 1px solid var(--island-line);
  }
  .head {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
  }
  .avatar {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    overflow: hidden;
  }
  .title {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 0;
    flex: 1;
    min-width: 0;
    height: auto;
    padding: 3px 6px;
    margin: 0 -6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    text-align: left;
    cursor: pointer;
  }
  .title:hover {
    background: var(--island-card-hover);
  }
  .title:focus-visible,
  .fold:focus-visible,
  .change:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  .name,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font-size: 13px;
    font-weight: 500;
  }
  .project,
  .sub,
  .time {
    color: var(--island-muted);
    font-weight: 400;
  }
  .sub,
  .time {
    font-size: 12px;
  }
  .session[data-state='working'] .state {
    color: var(--island-working);
  }
  .session[data-state='waiting'] .state {
    color: var(--island-attention);
  }
  .session[data-state='done'] .state {
    color: var(--island-done);
  }
  .session[data-state='failed'] .state {
    color: var(--island-danger);
  }
  .time {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .fold,
  .change,
  .act {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    cursor: pointer;
  }
  .fold:hover,
  .change:hover,
  .change.on,
  .act:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .act:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  .act.on {
    color: var(--island-text);
  }
  .followed {
    display: inline-grid;
    place-items: center;
    margin-right: 5px;
    vertical-align: -1px;
    color: var(--island-muted);
  }
  /*
   * A row's actions (follow, reply, dismiss; then run again, archive, the
   * changes) show on the row under the pointer or holding the focus, and on
   * an unfolded row. They take no room: the first ones float over the row's
   * end, on a fade of the card, and the ended row's ones take the place of
   * its second line, which fades out for them. The list never moves. Hidden,
   * they take no click; the keyboard still reaches them, and its focus shows
   * them. The fold's chevron stays, quieter: it says the row opens.
   */
  .tools {
    position: absolute;
    top: 50%;
    right: 34px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 18px;
    background: linear-gradient(to right, transparent, var(--island-card) 16px);
    transform: translateY(-50%);
  }
  .tools,
  .ended {
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }
  .sub {
    transition: opacity 180ms ease;
  }
  .session:is(:hover, :focus-within, .unfolded) :is(.tools, .ended),
  .ended:has(:global([aria-expanded='true'], [role='alert'])) {
    opacity: 1;
    pointer-events: auto;
  }
  .session.closed:is(:hover, :focus-within, .unfolded) .sub,
  .session.closed:has(.ended :global(:is([aria-expanded='true'], [role='alert']))) .sub {
    opacity: 0;
  }
  .fold {
    color: var(--island-faint);
    transition: color 180ms ease;
  }
  :where(.session:hover, .session:focus-within) .fold {
    color: var(--island-muted);
  }
  .fold:hover,
  .fold.on {
    color: var(--island-text);
  }
  /* Over the second line: its buttons as tall as the line, their row on it. */
  .ended {
    position: relative;
    margin: -22px 0 2px 32px;
  }
  .ended :global(.row) {
    flex-wrap: nowrap;
  }
  .ended :global(.act) {
    height: 20px;
    background: var(--island-card);
  }
  /* No hover to show them: the actions stand in the row, as they always did. */
  @media (hover: none) {
    .tools,
    .ended {
      opacity: 1;
      pointer-events: auto;
    }
    .tools {
      position: static;
      padding: 0;
      background: none;
      transform: none;
    }
    .ended {
      margin: 0 0 8px 32px;
    }
    .session.closed .sub {
      opacity: 1;
    }
  }
  .answering {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 8px 32px;
  }
  /* The reply field in the island's dark: its edge and its hint read. */
  .answering :global(textarea) {
    border-color: var(--island-line-strong);
    background: var(--island-bg);
    color: var(--island-text);
  }
  .answering :global(textarea::placeholder) {
    color: var(--island-muted);
  }
  .answer {
    max-height: 120px;
    margin: 0;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    scrollbar-width: thin;
  }
  .fold :global(svg) {
    transition: transform 160ms ease;
  }
  .fold.on :global(svg) {
    transform: rotate(180deg);
  }
  .empty {
    margin: 0 0 6px 32px;
    color: var(--island-muted);
    font-size: 12px;
  }
  .steps {
    display: flex;
    flex-direction: column;
    margin: 0 0 6px 32px;
    padding: 0;
    list-style: none;
  }
  .step-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    min-height: 24px;
    font-size: 12px;
  }
  .mark {
    display: grid;
    place-items: center;
    flex: none;
    width: 14px;
    color: var(--island-faint);
  }
  .step-row[data-status='done'] .mark {
    color: var(--island-done);
  }
  .step-row[data-status='error'] .mark {
    color: var(--island-danger);
  }
  .spin {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-working);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .tool {
    flex: none;
    min-width: 56px;
    color: var(--island-text);
    font-weight: 500;
  }
  .target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--island-muted);
  }
  .change {
    width: 22px;
    height: 22px;
  }
  .diff-slot {
    flex-basis: 100%;
    min-width: 0;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
    .fold :global(svg),
    .fold,
    .tools,
    .ended,
    .sub {
      transition: none;
    }
  }
</style>
