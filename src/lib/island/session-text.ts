/*
 * How a session's step reads in words, in the language the app speaks: the
 * tool's label, then its target ("Edit queue.ts", "Command bun run test").
 */
import { strings } from '../strings';
import type { SessionStep } from './sessions';

export function toolLabel(step: Pick<SessionStep, 'kind'>): string {
  return strings.island.sessions.tools[step.kind];
}

export function stepText(step: Pick<SessionStep, 'kind' | 'target'>): string {
  const label = toolLabel(step);
  return step.target ? `${label} ${step.target}` : label;
}
