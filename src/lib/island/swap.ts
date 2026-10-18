/*
 * The deck's top-left character: the agent the Chat talks to
 * (`assistant.svelte.ts`), which a click turns to the next of the user's
 * agents (`deck/DeckAgent.svelte`). The Chat keeps the one chosen. Pure, so
 * it is tested without a core.
 */
import { skinOf } from '../companion/crew';
import type { PlacedAgent } from '../group/agents';
import type { Robot } from '../robots';

type Standing<M> = readonly (M & { id: string })[];

/** The agent after `current`, back to the first after the last; null when there is no other to turn to. */
export function nextAgent<T extends { key: string }>(agents: readonly T[], current: string | null): T | null {
  if (agents.length < 2) return null;
  const at = Math.max(0, agents.findIndex((agent) => agent.key === current));
  return agents[(at + 1) % agents.length]!;
}

/**
 * The companion's row member an agent is on the island: the one of its id on
 * this machine. With no row made yet, the island's lone character (id '') is
 * the agent the Chat lands on unasked, `first`.
 */
export function islandMember<M>(agent: Pick<PlacedAgent, 'key' | 'coreId' | 'profile'>, members: Standing<M>, first: string | null = null): (M & { id: string }) | undefined {
  if (agent.coreId !== null) return undefined;
  const lone = members.length === 1 && members[0]!.id === '' ? members[0] : undefined;
  if (lone) return agent.key === first ? lone : undefined;
  return members.find((one) => one.id === agent.profile.id);
}

/**
 * What an agent wears on the island: its look in the companion's row when it
 * stands there (the lead wears the mascot chosen in Settings), else its own
 * face, B.O.T.S's when it chose none.
 */
export function islandSkin(agent: Pick<PlacedAgent, 'key' | 'coreId' | 'profile'>, members: Standing<{ skin: Robot | null }>, first: string | null = null): Robot {
  return islandMember(agent, members, first)?.skin ?? skinOf(agent.profile);
}
