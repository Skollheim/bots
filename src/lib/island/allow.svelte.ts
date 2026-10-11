/*
 * The "always allow" rules at work: kept in the shared storage (the settings
 * window lists them too), and applied to the permissions the core reports
 * before the island sees them. A request a rule covers is answered `allow`
 * at once, without a sound or the pill taking over; a short trace says so.
 * Questions are never answered here. What a rule covers: `allow-rules.ts`.
 */
import type { PermissionRequest, ThreadSummary } from '@boite/contracts';
import { WsClient, type Client } from '@boite/ui/lib/client';
import { GroupClient } from '../group/group-client';
import { addRule, findRule, pruneRules, readRules, ruleTarget, ruleText, RULES_KEY, writeRules, type AllowRule, type RuleScope } from './allow-rules';

/** How long the pill's trace of an answer stays. */
export const TRACE_MS = 4_000;
/** Request ids kept as answered, so none is answered twice: the oldest go first. */
const ANSWERED_MAX = 500;

export interface RuleTrace {
  threadId: string;
  /** "Bash · git status". */
  text: string;
  at: number;
}

const storage = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);
const listeners = new Set<(rules: AllowRule[]) => void>();

function save(rules: AllowRule[]): void {
  writeRules(storage(), rules);
  listeners.forEach((listener) => listener(rules));
}

/** The rules stored, as every window reads them. */
export const storedRules = (): AllowRule[] => readRules(storage());
export const forgetRule = (id: string): void => save(storedRules().filter((rule) => rule.id !== id));
export const forgetAllRules = (): void => save([]);

/** Calls `listener` with the rules each time they change, in this window or another. */
export function subscribeRules(listener: (rules: AllowRule[]) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === RULES_KEY || event.key === null) listener(storedRules());
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Which core a rule belongs to: the demo's rules never answer a real core. */
export function coreTag(client: Client | null): string {
  const local = client instanceof GroupClient ? client.local : client;
  return local instanceof WsClient ? `local:${local.core?.hostname ?? ''}` : 'demo';
}

/**
 * The core a thread's rule belongs to: this machine's tag, or the machine of
 * the group the thread runs on, by its id (`group:<coreId>`, `demo:group:…`
 * in the demo). A rule made for the server never answers this machine.
 */
export function threadTag(client: Client | null, threadId: string): string {
  const coreId = client instanceof GroupClient ? client.coreIdOf(threadId) : null;
  if (coreId === null) return coreTag(client);
  return coreTag(client) === 'demo' ? `demo:group:${coreId}` : `group:${coreId}`;
}

/** The cores whose threads the last list gave whole: only their rules for a gone thread are let go. */
function listedTags(client: Client): string[] {
  const local = coreTag(client);
  if (!(client instanceof GroupClient)) return [local];
  const prefix = local === 'demo' ? 'demo:group:' : 'group:';
  return [local, ...client.answered().map((coreId) => `${prefix}${coreId}`)];
}

export class AllowRules {
  rules = $state.raw<AllowRule[]>(storedRules());
  /** The last request a rule answered, for a few seconds. */
  trace = $state.raw<RuleTrace | null>(null);
  readonly #answered = new Set<string>();
  /** Answers the core refused: the user answers those. */
  readonly #failed = new Set<string>();
  #traceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: { client: () => Client | null; failed: () => void }) {}

  follow(): () => void {
    const off = subscribeRules((rules) => (this.rules = rules));
    return () => {
      off();
      clearTimeout(this.#traceTimer);
    };
  }

  /**
   * The permissions left for the user: the ones a rule covers are answered
   * here. `threads` is the core's full list, so the rules of a thread archived
   * or gone go with it.
   */
  sift(permissions: PermissionRequest[], threads: readonly ThreadSummary[]): PermissionRequest[] {
    const client = this.options.client();
    if (!client || this.rules.length === 0) return permissions;
    const kept = listedTags(client).reduce<AllowRule[]>((rules, core) => pruneRules(rules, core, threads), this.rules);
    if (kept.length !== this.rules.length) save((this.rules = kept));
    const projectOf = new Map(threads.map((thread) => [thread.id, thread.projectId]));
    return permissions.filter((request) => {
      if (this.#failed.has(request.id)) return true;
      if (this.#answered.has(request.id)) return false;
      const rule = findRule(kept, request, { core: threadTag(client, request.threadId), threadId: request.threadId, projectId: projectOf.get(request.threadId) ?? null });
      if (!rule) return true;
      this.#answer(client, request, rule);
      return false;
    });
  }

  #answer(client: Client, request: PermissionRequest, rule: AllowRule): void {
    this.#answered.add(request.id);
    if (this.#answered.size > ANSWERED_MAX) this.#answered.delete(this.#answered.values().next().value!);
    client.call('permissions.answer', { requestId: request.id, decision: 'allow' }).then(
      () => {
        clearTimeout(this.#traceTimer);
        this.trace = { threadId: request.threadId, text: ruleText(rule, 60), at: Date.now() };
        this.#traceTimer = setTimeout(() => (this.trace = null), TRACE_MS);
      },
      () => {
        this.#failed.add(request.id);
        this.options.failed();
      }
    );
  }

  /** Keeps a rule for what this request asked, in its thread or its project; false when none can be made. */
  add(request: PermissionRequest, scope: RuleScope, threads: readonly ThreadSummary[], projects: ReadonlyMap<string, string>): boolean {
    const target = ruleTarget(request);
    const thread = threads.find((entry) => entry.id === request.threadId);
    const scopeId = scope === 'thread' ? request.threadId : thread?.projectId;
    if (!target || !scopeId) return false;
    const scopeName = scope === 'thread' ? (thread?.title ?? '') : (projects.get(scopeId) ?? '');
    const rule: AllowRule = { id: crypto.randomUUID(), core: threadTag(this.options.client(), request.threadId), scope, scopeId, scopeName, createdAt: Date.now(), ...target };
    this.rules = addRule(storedRules(), rule);
    save(this.rules);
    return true;
  }
}
