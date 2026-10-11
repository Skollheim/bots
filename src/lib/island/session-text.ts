/*
 * How a session's step reads in words, in the language the app speaks: the
 * tool's label, then its target ("Edit queue.ts", "Command bun run test").
 */
import { fill, strings } from '../strings';
import type { SessionRow, SessionStep } from './sessions';

export function toolLabel(step: Pick<SessionStep, 'kind'>): string {
  return strings.island.sessions.tools[step.kind];
}

export function stepText(step: Pick<SessionStep, 'kind' | 'target'>): string {
  const label = toolLabel(step);
  return step.target ? `${label} ${step.target}` : label;
}

/** What a session is doing, in a few words: its last step, else its task, the core's line, or its sub-agents at work. */
export function rowDoing(row: Pick<SessionRow, 'steps' | 'task' | 'detail' | 'helpers'>): string | null {
  const step = row.steps[row.steps.length - 1];
  if (step) return stepText(step);
  if (row.task ?? row.detail) return row.task ?? row.detail;
  if (row.helpers > 0) return fill(row.helpers === 1 ? strings.companion.hud.helper : strings.companion.hud.helpers, { count: String(row.helpers) });
  return null;
}

/** What a Home row's second line says after its state: its sub-agents at work ("2 sub-agents"); null when none works. */
export function agentsText(count: number): string | null {
  if (count <= 0) return null;
  const copy = strings.island.sessions.agents;
  return count === 1 ? copy.one : fill(copy.many, { count: String(count) });
}

export interface LiveLine {
  /** The project, else the conversation's title. */
  name: string;
  /** How far the task list is ("3/5"), then what it does. */
  doing: string;
  /** Done share of the task list, 0 to 1; null without a list. */
  progress: number | null;
}

/** The collapsed island's line for a conversation at work: "Unity 3/5 Command bun run build". */
export function liveLine(row: SessionRow, project: string): LiveLine {
  const copy = strings.island.sessions;
  const doing = row.state === 'waiting' ? copy.states.waiting : (rowDoing(row) ?? copy.states.working);
  const count = row.progress && row.progress.total > 0 ? `${row.progress.done}/${row.progress.total} ` : '';
  return {
    name: project || row.title || strings.companion.untitled,
    doing: count + doing,
    progress: row.progress && row.progress.total > 0 ? row.progress.done / row.progress.total : null
  };
}