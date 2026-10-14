/*
 * The island's assistant: the Chat tab talks to one of the user's Boite
 * Agents (Boite's Agents page: a profile with its role, memory and model),
 * in that agent's direct conversation, the one Boite shows too. Boite is the
 * only engine; Bots reads and acts through the core alone, after Boite's own
 * `AgentConversation.svelte`.
 *
 * - Which agent: an active profile of `agents.snapshot`, on this machine or
 *   another of the group (`group/agents.ts`), picked in the chat; its key is
 *   kept in Bots's settings (`CompanionPrefs.assistantAgent`). Every call for
 *   it goes to its own machine (`GroupClient.at`), and its conversation is
 *   read in that machine's snapshot.
 * - Sending: `agents.message.send` to the direct conversation, the dropped
 *   files kept on disk where the agent can open them, their paths at the end.
 *   Typing during a run sends a follow-up, as Boite does.
 * - History: the conversation's messages in the snapshot, older ones a page
 *   at a time through `agents.history`. `agents.changed` invalidates: the
 *   companion reads the snapshot again (`crew.svelte.ts`) and calls `follow`.
 * - The answer as it comes, and the tool at work: the thread the agent's
 *   session works in (`AgentSession.threadId`), through `message.*` and
 *   `thread.updated`. Stop cancels the agent's open work (`agents.work.control`).
 * - Model and effort: the agent's own `selection`, changed for the agent
 *   everywhere with `agents.profile.save`, the call Boite's agent editor makes.
 */
import type { AgentConversationMessage, AgentProfile, AgentSave, AgentsSnapshot, AgentWork, Attachment, Message, MessagePart, ModelInfo, RpcEvents, ThreadSummary } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { directScope, replyTo, sessionThreadOf, workFor } from '../companion/crew';
import { pickPlaced, placedAgents, snapshotAt, type MachineAgents, type PlacedAgent } from '../group/agents';
import { GroupClient } from '../group/group-client';
import { visibleReply } from '../companion/directives';
import { describeTool } from '@boite/ui/lib/tool-summary';
import { fill, strings } from '../strings';
import { toolLabel } from './session-text';

export const EFFORTS = ['low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORTS)[number];
/** Messages per page of history, each scroll up. */
export const ASSISTANT_PAGE = 40;
/** Fewer messages than this in hand: the conversation reads a page back, once per agent. */
export const ASSISTANT_FILL = 20;
const COMPACT = { compactTools: true, compactFiles: true, compactImages: true, compactToolParts: true } as const;
const OPEN: ReadonlySet<AgentWork['status']> = new Set(['pending', 'running', 'waiting']);
const ENDED: ReadonlySet<AgentWork['status']> = new Set(['error', 'interrupted']);
const UNDELIVERED = new Set(['failed', 'cancelled', 'limited']);

const copy = () => strings.island.assistant;
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** A request id the core takes: 8 to 128 letters, digits, `_` and `-`. */
export const requestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, '');

// ---------------------------------------------------------------------------
// What a message says
// ---------------------------------------------------------------------------

/** One message as the chat draws it. */
export interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** The names of the files it carried. */
  files: string[];
  streaming: boolean;
}

/** Where the paths of the files sent with a message start, the way the companion writes its context. */
const FILES_MARK = '[[files: ';
const FILES_SEPARATOR = ' | ';
/** The context line the companion's own requests end with (`brain.ts`). */
const CONTEXT_MARK = '\n\n[[context:';

/** The message an agent receives: what was typed, then where the dropped files were kept. */
export function withFiles(prompt: string, paths: string[]): string {
  if (paths.length === 0) return prompt;
  const block = `${FILES_MARK}${paths.join(FILES_SEPARATOR)}]]`;
  return prompt ? `${prompt}\n\n${block}` : block;
}

const baseName = (path: string) => path.split(/[\\/]/).pop() || path;

/** A user's message as it was typed, and the names of the files it carried. */
export function splitFiles(text: string): { text: string; files: string[] } {
  const context = text.indexOf(CONTEXT_MARK);
  const typed = context >= 0 ? text.slice(0, context) : text;
  const at = typed.lastIndexOf(FILES_MARK);
  if (at < 0 || !typed.trimEnd().endsWith(']]')) return { text: typed.trim(), files: [] };
  const paths = typed.trimEnd().slice(at + FILES_MARK.length, -2).split(FILES_SEPARATOR).filter(Boolean);
  return { text: typed.slice(0, at).trim(), files: paths.map(baseName) };
}

export function bubbleOf(message: AgentConversationMessage): Bubble | null {
  if (message.senderId === null) {
    const { text, files } = splitFiles(message.text);
    return text || files.length ? { id: message.id, role: 'user', text, files, streaming: false } : null;
  }
  const text = visibleReply(message.text).trim();
  return text ? { id: message.id, role: 'assistant', text, files: [], streaming: false } : null;
}

const byCreation = (a: AgentConversationMessage, b: AgentConversationMessage) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isDirect = (message: { scope: AgentConversationMessage['scope'] }, agentId: string) => message.scope.kind === 'agent' && message.scope.id === agentId;

/** The agent's direct conversation, oldest first: the snapshot's messages and the pages read back, the later revision of a message winning. */
export function conversation(snapshot: AgentsSnapshot | null, older: readonly AgentConversationMessage[], agentId: string): AgentConversationMessage[] {
  const byId = new Map<string, AgentConversationMessage>();
  for (const message of [...older, ...(snapshot?.messages ?? [])]) {
    if (!isDirect(message, agentId)) continue;
    const held = byId.get(message.id);
    if (!held || held.revision <= message.revision) byId.set(message.id, message);
  }
  return [...byId.values()].sort(byCreation);
}

/** The work the agent has in hand for its direct conversation. */
export function openWork(snapshot: AgentsSnapshot | null, agentId: string): AgentWork[] {
  return snapshot?.work.filter((work) => work.agentId === agentId && isDirect(work, agentId) && work.purpose !== 'compaction' && OPEN.has(work.status)) ?? [];
}

/** A message sent from here is settled: answered, its work over, or never delivered. */
export function settled(snapshot: AgentsSnapshot | null, agentId: string, messageId: string): boolean {
  if (replyTo(snapshot, agentId, messageId)) return true;
  const work = workFor(snapshot, agentId, messageId);
  if (work) return !OPEN.has(work.status);
  return snapshot?.deliveries.some((delivery) => delivery.messageId === messageId && UNDELIVERED.has(delivery.status)) ?? false;
}

/** Why the newest request got no answer: its work failed or was cut off. Null otherwise. */
export function failureOf(snapshot: AgentsSnapshot | null, messages: readonly AgentConversationMessage[], agentId: string): string | null {
  const last = messages.at(-1);
  if (!last || last.senderId !== null) return null;
  const work = workFor(snapshot, agentId, last.id);
  return work && ENDED.has(work.status) ? fill(copy().failed, { reason: work.error ?? work.status }) : null;
}

// ---------------------------------------------------------------------------
// The answer as it comes, from the agent's thread
// ---------------------------------------------------------------------------

/** What the answer says so far: the text of the newest answer in the stream, directives left out. */
export function liveText(stream: readonly Message[]): string {
  const last = stream.findLast((message) => message.role === 'assistant');
  if (!last) return '';
  return visibleReply(last.parts.flatMap((part) => (part.type === 'text' ? [part.displayText ?? part.text] : [])).join('')).trim();
}

/** A tool's target at a glance: a file's name, a command's start, a pattern. */
export function toolTarget(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'notebook_path', 'command', 'pattern', 'query', 'url', 'description']) {
    const field = value[key];
    if (typeof field !== 'string' || !field.trim()) continue;
    const text = key.endsWith('path') ? baseName(field) : field.trim().split('\n')[0]!;
    return text.length > 48 ? `${text.slice(0, 47)}…` : text;
  }
  return null;
}

/**
 * The tool at work right now, on one line, in the words Home's session rows
 * use ("Read night.log", "Command bun run test"): the running call of the
 * answer, else what the thread says it does.
 */
export function toolLine(stream: readonly Message[], thread: Pick<ThreadSummary, 'progress'> | null): string | null {
  const last = stream.findLast((message) => message.role === 'assistant');
  const running = last?.parts.findLast((part): part is Extract<MessagePart, { type: 'tool' }> => part.type === 'tool' && part.status === 'running');
  if (running) {
    const label = toolLabel({ kind: describeTool(running.name, running.input).family });
    const target = toolTarget(running.input);
    return target ? `${label} ${target}` : label;
  }
  return thread?.progress?.phase === 'tool' && thread.progress.detail ? thread.progress.detail : null;
}

/** A started message joins the stream, or replaces the one with its id. */
export function applyStarted(messages: Message[], message: Message): void {
  const at = messages.findIndex((entry) => entry.id === message.id);
  if (at >= 0) messages[at] = message;
  else messages.push(message);
}

/** Text appended to a part; a delta past the known parts opens a text part, as Boite's store does. */
export function applyDelta(messages: Message[], { messageId, partIndex, text }: RpcEvents['message.delta']): void {
  const message = messages.find((entry) => entry.id === messageId);
  if (!message) return;
  const part = message.parts[partIndex];
  if (!part) {
    while (message.parts.length < partIndex) message.parts.push({ type: 'text', text: '' });
    message.parts.push({ type: 'text', text });
  } else if (part.type === 'text' || part.type === 'thinking') part.text += text;
}

export function applyPart(messages: Message[], { messageId, partIndex, part }: RpcEvents['message.part']): void {
  const message = messages.find((entry) => entry.id === messageId);
  if (!message) return;
  while (message.parts.length < partIndex) message.parts.push({ type: 'text', text: '' });
  message.parts[partIndex] = part;
}

export function applyCompleted(messages: Message[], { messageId, state }: RpcEvents['message.completed']): void {
  const message = messages.find((entry) => entry.id === messageId);
  if (message) message.state = state;
}

// ---------------------------------------------------------------------------
// Models and efforts
// ---------------------------------------------------------------------------

/** One of the three efforts, null for the provider's default or another level. */
export function effortOf(value: string | null | undefined): Effort | null {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : null;
}

/** The efforts the model takes among low, medium and high; all three when it names none. */
export function effortsOf(model: ModelInfo | undefined): Effort[] {
  const levels = model?.effort?.levels.map((level) => level.id) ?? [];
  const offered = EFFORTS.filter((effort) => levels.includes(effort));
  return offered.length > 0 ? offered : [...EFFORTS];
}

/** The models worth offering: the current ones, and a legacy one only when it is in use. */
export function offeredModels(models: ModelInfo[], current: string | null): ModelInfo[] {
  return models.filter((model) => model.id !== 'default' && (!model.legacy || model.id === current));
}

/** The agent saved with another model or effort, everything else as it stands. */
export function selectionSave(profile: AgentProfile, change: { model?: string; effort?: Effort }): AgentSave<AgentProfile> {
  const { name, domain, instructions, avatar, selection, status, tools, accountIntegration } = profile;
  return { id: profile.id, expectedRevision: profile.revision, value: { name, domain, instructions, avatar, status, tools, accountIntegration, selection: { ...selection, ...change } } };
}

// ---------------------------------------------------------------------------
// The assistant
// ---------------------------------------------------------------------------

export interface AssistantHost {
  client(): Client | null;
  /** This machine's agents as the companion last read them. */
  snapshot(): AgentsSnapshot | null;
  /** The other machines' agents, as last read; none without a group. */
  elsewhere?(): readonly MachineAgents[];
  /** Reads the snapshot again now, after a change made here. */
  reload(): void;
  /** The agent kept in Bots's settings (its key, `group/agents.ts`), null when none. */
  remembered(): string | null;
  remember(key: string): void;
  /** The agent to talk to when none is chosen: the row's leader. */
  fallback(): string | null;
  /** What goes with the next message, the dropped files and the capture, or why they cannot go. */
  outgoing(): Attachment[] | string;
  /** Keeps the files where the agent can open them: their paths, or null when they cannot be kept. */
  keep(attachments: Attachment[]): Promise<string[] | null>;
  /** The files went: the tray empties. */
  sent(): void;
  /** A message that could not go: its files come back to the tray. */
  giveBack(attachments: Attachment[]): void;
  /** The context line a message ends with (`brain.ts`): the time, the to-do list and the missions. None leaves it out. */
  context?(): string | null;
}

export class Assistant {
  /** The agent picked for this session, by key; the kept one, else the leader, else the first. */
  chosen = $state<string | null>(null);
  /** Pages read back through `agents.history`. */
  older = $state.raw<AgentConversationMessage[]>([]);
  /** Whether older messages remain, once a page said so. */
  more = $state<boolean | null>(null);
  loadingOlder = $state(false);
  draft = $state('');
  problem = $state('');
  /** A message on its way to the core. */
  sending = $state(false);
  stopping = $state(false);
  models = $state.raw<ModelInfo[]>([]);
  /** The messages of the agent's current turn, as they stream. */
  stream = $state<Message[]>([]);
  /** The agent's thread, as `thread.updated` tells it. */
  session = $state.raw<ThreadSummary | null>(null);
  /** Messages sent from here that wait for their answer. */
  awaiting = $state<string[]>([]);

  // Read lazily, once the host is in: through a function, as TypeScript sees the order.
  readonly #local = $derived.by(() => this.host.snapshot());
  readonly #elsewhere = $derived.by(() => this.host.elsewhere?.() ?? []);
  /** The active agents of every machine, this one's first. */
  readonly agents = $derived<PlacedAgent[]>(placedAgents(this.#local, this.#elsewhere));
  readonly placed = $derived.by(() => pickPlaced(this.agents, this.chosen, this.host.remembered(), this.host.fallback()));
  readonly agent = $derived(this.placed?.profile ?? null);
  readonly agentId = $derived(this.agent?.id ?? null);
  /** The machine the agent lives on: null for this one. */
  readonly coreId = $derived(this.placed?.coreId ?? null);
  /** Its machine's name, shown beside it only when it is another machine's. */
  readonly machine = $derived(this.placed?.machine ?? null);
  /** Shown beside each agent: there is more than one machine to tell apart. */
  readonly machines = $derived(this.#elsewhere.length > 0);
  /** The agent's own machine's snapshot: its conversation, work and replies. */
  readonly snapshot = $derived(snapshotAt(this.coreId, this.#local, this.#elsewhere));
  /** The thread the agent works its conversation with the user in, once it has worked there. */
  readonly threadId = $derived(this.agentId ? sessionThreadOf(this.snapshot, this.agentId) : null);
  readonly messages = $derived(this.agentId ? conversation(this.snapshot, this.older, this.agentId) : []);
  readonly work = $derived(this.agentId ? openWork(this.snapshot, this.agentId) : []);
  readonly running = $derived(this.sending || this.work.length > 0 || (this.agentId !== null && this.awaiting.some((id) => !settled(this.snapshot, this.agentId!, id))));
  readonly live = $derived(this.running ? liveText(this.stream) : '');
  readonly bubbles = $derived<Bubble[]>([
    ...this.messages.flatMap((message) => bubbleOf(message) ?? []),
    ...(this.live ? [{ id: 'live', role: 'assistant' as const, text: this.live, files: [], streaming: true }] : [])
  ]);
  readonly tool = $derived(this.running ? toolLine(this.stream, this.session) : null);
  readonly failure = $derived(this.agentId && !this.running ? failureOf(this.snapshot, this.messages, this.agentId) : null);
  readonly hasOlder = $derived(this.more ?? this.snapshot?.more.message ?? false);
  readonly model = $derived(this.agent?.selection.model ?? null);
  readonly effort = $derived(effortOf(this.agent?.selection.effort));
  readonly offered = $derived(offeredModels(this.models, this.model));
  readonly efforts = $derived(effortsOf(this.models.find((model) => model.id === this.model)));

  /** What `follow` last saw, so a change of agent, thread or engine is acted on once. */
  private followed: string | null = null;
  private subscribed: string | null = null;
  private probed: string | null = null;
  private filled = new Set<string>();

  constructor(private readonly host: AssistantHost) {}

  /** Listens to the core; returns the stop. */
  attach(client: Client): () => void {
    const mine = (threadId: string) => threadId !== null && threadId === this.threadId;
    const offs = [
      client.on('turn.started', (turn) => mine(turn.threadId) && (this.stream = [])),
      client.on('message.started', (message) => mine(message.threadId) && applyStarted(this.stream, structuredClone(message))),
      client.on('message.delta', (delta) => mine(delta.threadId) && applyDelta(this.stream, delta)),
      client.on('message.part', (part) => mine(part.threadId) && applyPart(this.stream, part)),
      client.on('message.completed', (done) => mine(done.threadId) && applyCompleted(this.stream, done)),
      client.on('thread.updated', (thread) => mine(thread.id) && (this.session = thread))
    ];
    return () => offs.forEach((off) => off());
  }

  /** Opens on `key` for this session without keeping it (the demo's), else on the kept agent. */
  open(key?: string): void {
    if (key) this.chosen = key;
    this.follow();
  }

  /** The connection came back: the core forgot the subscription. */
  resume(): void {
    this.subscribed = null;
    this.follow();
  }

  /** The user picked another agent, by key: it is kept for the next launch. */
  pick(key: string): void {
    if (key === this.placed?.key) return;
    this.chosen = key;
    this.host.remember(key);
    this.follow();
  }

  /** The client the agent's calls go through: its own machine's. */
  #client(): Client | null {
    const client = this.host.client();
    if (!client || this.coreId === null) return client;
    return client instanceof GroupClient ? client.at(this.coreId) : null;
  }

  /**
   * After each read of the snapshot: a new agent starts clean, its thread is
   * followed, its models read, and a short conversation reads a page back.
   */
  follow(): void {
    const client = this.#client();
    const placed = this.placed;
    const agent = this.agent;
    if (!client || !placed || !agent) return;
    if (this.followed !== placed.key) {
      this.followed = placed.key;
      this.older = [];
      this.more = null;
      this.stream = [];
      this.session = null;
      this.awaiting = [];
      this.problem = '';
    }
    const threadId = this.threadId;
    if (threadId && threadId !== this.subscribed) void this.watch(client, threadId);
    const engine = `${placed.coreId ?? ''}/${agent.selection.providerId}/${agent.selection.accountId}`;
    if (engine !== this.probed) void this.readModels(client, engine, agent.selection.providerId, agent.selection.accountId);
    if (this.messages.length < ASSISTANT_FILL && this.hasOlder && !this.filled.has(placed.key)) {
      this.filled.add(placed.key);
      void this.loadOlder();
    }
  }

  /**
   * Follows the agent's thread. It is left subscribed when another agent is
   * picked: the crew may follow the same thread, and the core keeps one
   * subscription per connection. A turn already running is read once, so its
   * answer shows from where it stands.
   */
  private async watch(client: Client, threadId: string): Promise<void> {
    this.subscribed = threadId;
    try {
      await client.call('threads.subscribe', { threadId });
      if (!this.running) return;
      const { messages, turns, ...summary } = await client.call('threads.get', { threadId, limit: 6, ...COMPACT });
      const turn = turns.findLast((entry) => entry.status === 'running' || entry.status === 'queued');
      if (threadId !== this.threadId || !turn || this.stream.length > 0) return;
      this.session = summary as ThreadSummary;
      this.stream = messages.filter((message) => message.turnId === turn.id);
    } catch {
      if (this.subscribed === threadId) this.subscribed = null;
    }
  }

  private async readModels(client: Client, engine: string, providerId: string, accountId: string): Promise<void> {
    this.probed = engine;
    const probed = await client.call('providers.probe', { providerId, accountId }).catch(() => null);
    if (this.probed === engine) this.models = probed?.models ?? [];
  }

  /** Older messages, a page more, when the reader scrolls to the top. */
  async loadOlder(): Promise<void> {
    const client = this.#client();
    const agentId = this.agentId;
    if (!client || !agentId || this.loadingOlder || !this.hasOlder) return;
    this.loadingOlder = true;
    try {
      const oldest = this.messages.reduce<AgentConversationMessage | null>((min, message) => (!min || message.updatedAt < min.updatedAt || (message.updatedAt === min.updatedAt && message.id < min.id) ? message : min), null);
      const page = await client.call('agents.history', {
        kind: 'message',
        scopes: [directScope(agentId)],
        limit: ASSISTANT_PAGE,
        ...(oldest ? { before: { updatedAt: oldest.updatedAt, id: oldest.id } } : {})
      });
      if (agentId !== this.agentId) return;
      this.older = [...this.older, ...page.messages];
      this.more = page.more;
    } catch (error) {
      this.problem = fill(copy().unreadable, { reason: reasonOf(error) });
    } finally {
      this.loadingOlder = false;
    }
  }

  /** Sends what is in the field with the files in the tray. During a run it goes as a follow-up. */
  async send(): Promise<void> {
    const prompt = this.draft.trim();
    const attachments = this.host.outgoing();
    if (typeof attachments === 'string') return void (this.problem = attachments);
    if (!prompt && attachments.length === 0) return;
    const client = this.#client();
    if (!client) return void (this.problem = strings.companion.unreachable);
    const agent = this.agent;
    if (!agent) return void (this.problem = copy().noAgent);
    if (!this.running) this.stream = [];
    this.draft = '';
    this.host.sent();
    this.problem = '';
    this.sending = true;
    const giveBack = (problem: string) => {
      this.problem = problem;
      this.draft ||= prompt;
      this.host.giveBack(attachments);
    };
    try {
      const paths = attachments.length > 0 ? await this.host.keep(attachments) : [];
      if (paths === null) return giveBack(copy().notKept);
      const context = this.host.context?.() ?? null;
      const text = context ? `${withFiles(prompt, paths)}\n\n${context}` : withFiles(prompt, paths);
      const message = await client.call('agents.message.send', { scope: directScope(agent.id), text, recipientIds: [agent.id], requestId: requestId() });
      this.awaiting = [...this.awaiting.filter((id) => !settled(this.snapshot, agent.id, id)), message.id];
      this.host.reload();
    } catch (error) {
      giveBack(fill(copy().notSent, { reason: reasonOf(error) }));
    } finally {
      this.sending = false;
    }
  }

  /** Cancels the agent's open work in this conversation; a message the core has not made work of yet is let go. */
  async stop(): Promise<void> {
    const client = this.#client();
    const agentId = this.agentId;
    if (!client || !agentId || this.stopping) return;
    this.stopping = true;
    const works = this.work;
    this.awaiting = this.awaiting.filter((id) => workFor(this.snapshot, agentId, id) !== null);
    try {
      const results = await Promise.allSettled(works.map((work) => client.call('agents.work.control', { workId: work.id, expectedRevision: work.revision, action: 'cancel' })));
      const refused = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      // One that ended meanwhile is refused too: only a stop where nothing took is told.
      if (refused && results.every((result) => result.status === 'rejected')) this.problem = fill(copy().notStopped, { reason: reasonOf(refused.reason) });
    } finally {
      this.stopping = false;
      this.host.reload();
    }
  }

  async setModel(model: string): Promise<void> {
    if (model === this.model) return;
    const efforts = effortsOf(this.models.find((entry) => entry.id === model));
    const effort = this.effort === null || efforts.includes(this.effort) ? this.effort : efforts.at(-1)!;
    await this.update(effort === null ? { model } : { model, effort });
  }

  async setEffort(effort: Effort): Promise<void> {
    if (effort !== this.effort) await this.update({ effort });
  }

  /** The agent's own model or effort, changed for it everywhere. */
  private async update(change: { model?: string; effort?: Effort }): Promise<void> {
    const client = this.#client();
    const agent = this.agent;
    if (!client || !agent) return;
    try {
      await client.call('agents.profile.save', selectionSave(agent, change));
      this.host.reload();
    } catch (error) {
      this.problem = fill(copy().notChanged, { reason: reasonOf(error) });
    }
  }
}
