<!--
  A Home row's sub-agents, unfolded under it (`lib/island/sub-agents.ts`): how
  many finished, then one line each in start order, the ones a sub-agent
  started indented under it. A dot tells the state, then the title (a Boite
  thread opens in Boite on a click) and how long it ran or has been at it.
  Eight lines at most; the rest reads "+N".
-->
<script lang="ts">
  import { foldOf, isAgentLive, type SubAgent } from '../../../lib/island/sub-agents';
  import { sessionTime } from '../../../lib/island/session-time';
  import { fill, strings } from '../../../lib/strings';

  interface Props {
    agents: readonly SubAgent[];
    now: number;
    onreveal(threadId: string): void;
  }

  let { agents, now, onreveal }: Props = $props();

  const copy = strings.island.sessions.agents;
  /** Each level of nesting steps in this far. */
  const INDENT = 14;
  const fold = $derived(foldOf(agents));

  function timeOf(agent: SubAgent): string {
    if (agent.end !== null) return sessionTime(agent.end - agent.start);
    return isAgentLive(agent) ? sessionTime(Math.max(0, now - agent.start)) : '';
  }
</script>

<div class="agents" data-testid="session-agents">
  {#if fold.total > 1}
    <p class="progress">{fill(copy.progress, { done: String(fold.finished), total: String(fold.total) })}</p>
  {/if}
  <ul class="lines">
    {#each fold.shown as agent (agent.id)}
      {@const title = agent.title || copy.untitled}
      <li class="line" data-state={agent.state} data-testid="session-agent" style:padding-left="{agent.depth * INDENT}px">
        <span class="dot" title={copy.states[agent.state]} aria-hidden="true"></span>
        <span class="sr">{copy.states[agent.state]}</span>
        {#if agent.threadId}
          {@const threadId = agent.threadId}
          <button class="name" title={fill(copy.open, { title })} onclick={() => onreveal(threadId)}>{title}</button>
        {:else}
          <span class="name" {title}>{title}</span>
        {/if}
        <span class="time">{timeOf(agent)}</span>
      </li>
    {/each}
  </ul>
  {#if fold.more > 0}
    <p class="more">{fill(copy.more, { count: String(fold.more) })}</p>
  {/if}
</div>

<style>
  .agents {
    /* Its times line up under the row's, left of the chevron. */
    margin: -2px 34px 6px 32px;
    animation: unfold 180ms ease-out;
  }
  .progress,
  .more {
    margin: 0;
    color: var(--island-muted);
    font-size: 11px;
    line-height: 20px;
  }
  /* The count heads the list: apart from the row's line above, close to the list it counts. */
  .progress {
    margin: 4px 0 2px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    font-size: 12px;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-faint);
  }
  .line[data-state='working'] .dot {
    background: var(--island-working);
  }
  .line[data-state='waiting'] .dot {
    background: var(--island-attention);
  }
  .line[data-state='done'] .dot {
    background: var(--island-done);
  }
  .line[data-state='failed'] .dot {
    background: var(--island-danger);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--island-text);
    text-align: left;
  }
  button.name {
    display: block;
    height: 22px;
    padding: 0 6px;
    margin: 0 -6px;
    border: none;
    border-radius: 6px;
    background: none;
    font: inherit;
    line-height: 22px;
    cursor: pointer;
  }
  button.name:hover {
    background: var(--island-card-hover);
  }
  button.name:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  .time {
    flex: none;
    color: var(--island-muted);
    font-variant-numeric: tabular-nums;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .agents {
      animation: none;
    }
  }
</style>
