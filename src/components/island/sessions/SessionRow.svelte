<!--
  One live session in Home: its robot, its title (a click shows the thread in
  Boite), its project, its state and how long it has been at it. Unfolded, its
  last steps, newest at the bottom: the tool, its target and a status mark; an
  Edit or Write step opens the change it made.
-->
<script lang="ts">
  import { Check, ChevronDown, FileDiff, Minus, X } from '@lucide/svelte';
  import { elapsed } from '@boite/ui/lib/format';
  import { seededRobot } from '../../../lib/robots';
  import { currentStep, type SessionRow } from '../../../lib/island/sessions';
  import { unfolding } from '../../../lib/island/sessions.svelte';
  import { stepText, toolLabel } from '../../../lib/island/session-text';
  import { strings } from '../../../lib/strings';
  import RobotFace from '../../agents/RobotFace.svelte';
  import SessionDiff from './SessionDiff.svelte';

  interface Props {
    row: SessionRow;
    project: string;
    now: number;
    onreveal(threadId: string): void;
  }

  let { row, project, now, onreveal }: Props = $props();

  const copy = strings.island.sessions;
  const unfolded = $derived(unfolding.rows.includes(row.id));
  const opened = $derived(unfolding.diff);

  function fold() {
    unfolding.rows = unfolded ? unfolding.rows.filter((id) => id !== row.id) : [...unfolding.rows, row.id];
  }

  function openDiff(stepId: string) {
    unfolding.diff = unfolding.diff === stepId ? null : stepId;
  }

  const robot = $derived(seededRobot(row.id, 'box'));
  const face = $derived(row.state === 'working' ? 'working' : row.state === 'waiting' ? 'waiting' : 'still');
  const time = $derived(elapsed((row.endedAt ?? now) - row.since));
  const step = $derived(currentStep(row));
  const line = $derived(row.state === 'waiting' || row.state === 'working' ? (step ? stepText(step) : (row.task ?? row.detail ?? '')) : '');
</script>

<li class="session" data-state={row.state} data-testid="session-row">
  <div class="head">
    <span class="avatar" aria-hidden="true"><RobotFace {robot} state={face} /></span>
    <button class="title" title={copy.reveal} onclick={() => onreveal(row.id)}>
      <span class="name">{row.title}{#if project}<span class="project"> · {project}</span>{/if}</span>
      <span class="sub">
        <span class="state">{copy.states[row.state]}</span>{#if line}<span class="step"> · {line}</span>{/if}
      </span>
    </button>
    <span class="time">{time}</span>
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
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    margin: 0 -6px;
    border: none;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
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
  .change {
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
  .change.on {
    background: var(--island-pill);
    color: var(--island-text);
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
    .fold :global(svg) {
      transition: none;
    }
  }
</style>
