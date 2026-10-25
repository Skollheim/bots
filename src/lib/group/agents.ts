/*
 * The agents of every machine of the group, as the island's assistant lists
 * them: this machine's first, then each member's in roster order, each tagged
 * with its machine. Pure: the crew reads the snapshots (`crew.svelte.ts`),
 * the group client routes the calls (`GroupClient.at`).
 *
 * An agent is known by its machine and its id together: two machines may
 * hold the same id. This machine's agents keep their bare id as their key, so
 * the agent kept in Bots's settings before machines were named still opens.
 */
import type { AgentProfile, AgentsSnapshot } from '@boite/contracts';

/** One member's agents, as its core answered `agents.snapshot`. */
export interface MachineAgents {
  coreId: string;
  /** The member's name in the group's roster. */
  machine: string;
  snapshot: AgentsSnapshot;
}

/** An agent of some machine of the group. */
export interface PlacedAgent {
  /** Unique across machines: the id for this machine's, `coreId/id` for another's. */
  key: string;
  /** Null for this machine's. */
  coreId: string | null;
  /** The roster's name for its machine; null for this machine's. */
  machine: string | null;
  profile: AgentProfile;
}

export function agentKey(coreId: string | null, agentId: string): string {
  return coreId === null ? agentId : `${coreId}/${agentId}`;
}

const LISTS = ['routines', 'accountGrants', 'profiles', 'groups', 'teams', 'missions', 'tasks', 'sessions', 'messages', 'deliveries', 'work', 'runs', 'memories', 'resources', 'artifacts', 'decisions'] as const;

/**
 * A snapshot as Bots reads it, whatever core answered. Newer cores make each
 * agent a thread: they send no messages, work or deliveries, and their
 * sessions have no scope, being the agent's own thread. A list left out reads
 * as empty, a session without a scope as the agent's direct one.
 */
export function readableSnapshot(answer: AgentsSnapshot): AgentsSnapshot {
  const snapshot: AgentsSnapshot = { ...answer, more: answer.more ?? ({} as AgentsSnapshot['more']) };
  const lists = snapshot as unknown as Record<string, unknown>;
  for (const key of LISTS) if (!Array.isArray(lists[key])) lists[key] = [];
  snapshot.sessions = snapshot.sessions.map((session) => (session.scope ? session : { ...session, scope: { kind: 'agent', id: session.agentId } }));
  return snapshot;
}

const active = (snapshot: AgentsSnapshot | null) => snapshot?.profiles.filter((profile) => profile.status === 'active') ?? [];

/** The active agents of every machine: this one's first, then each member's. */
export function placedAgents(local: AgentsSnapshot | null, elsewhere: readonly MachineAgents[]): PlacedAgent[] {
  return [
    ...active(local).map((profile) => ({ key: profile.id, coreId: null, machine: null, profile })),
    ...elsewhere.flatMap(({ coreId, machine, snapshot }) => active(snapshot).map((profile) => ({ key: agentKey(coreId, profile.id), coreId, machine, profile })))
  ];
}

/** The snapshot an agent's conversation, work and replies are read in: its own machine's. */
export function snapshotAt(coreId: string | null, local: AgentsSnapshot | null, elsewhere: readonly MachineAgents[]): AgentsSnapshot | null {
  return coreId === null ? local : (elsewhere.find((entry) => entry.coreId === coreId)?.snapshot ?? null);
}

/**
 * The members' agents after a read: each that answered gives its new
 * snapshot; one still connected but slow keeps its last, so a late answer
 * does not empty the list; one out of reach gives none.
 */
export function mergeElsewhere(previous: readonly MachineAgents[], answers: readonly MachineAgents[], connected: readonly { coreId: string }[]): MachineAgents[] {
  const answered = new Map(answers.map((entry) => [entry.coreId, entry]));
  return connected.flatMap(({ coreId }) => answered.get(coreId) ?? previous.find((entry) => entry.coreId === coreId) ?? []);
}

/** The first of the wanted keys still listed, else the first agent. */
export function pickPlaced(agents: readonly PlacedAgent[], ...wanted: (string | null | undefined)[]): PlacedAgent | null {
  for (const key of wanted) {
    const found = key ? agents.find((agent) => agent.key === key) : undefined;
    if (found) return found;
  }
  return agents[0] ?? null;
}
