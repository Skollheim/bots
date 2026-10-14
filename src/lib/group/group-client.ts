/*
 * One client over every machine of Chris's Boite group, so the rest of Bots
 * changes little: it speaks to this machine's core as before, and also to the
 * other members of its group, the way Boite's own window shows their threads.
 *
 * After this machine's core says hello, `group.get` names the members. Each
 * other member is opened with the session key Bots holds for it
 * (`member-keys.ts`), or else with a `group.ticket` this machine's core
 * vouches with: the member makes a session for Bots (one per member, kept)
 * and hands back its key. A key refused or revoked is forgotten and a new
 * ticket asked, at most once a minute per member. `group.updated` and every
 * reconnect read the roster again: a member added is reached, one removed let
 * go with its key.
 *
 * - The lists of what runs are asked of every reachable member and merged; a
 *   member slow to answer gives its last list, one that is off gives none.
 * - A call that names a thread goes to that thread's machine, an answer to a
 *   permission to the machine that asked (`routing.ts`); the rest stays here.
 * - An agent's calls go to its own machine through `at(coreId)`: agents are
 *   keyed by machine and id, as the same id may stand on two machines.
 * - Events about threads and agents are heard from every member; the rest
 *   from here only.
 *
 * Nothing waits on a member: this machine's calls and events never pass
 * through one, and no group, or a core older than groups, is the old Bots.
 * A timer runs only while a member is out of reach, once a minute.
 */
import { RPC_PATH, RpcErrorCode, type CoreInfo, type Group, type GroupCore, type PermissionRequest, type Principal, type QuestionRequest, type RpcEventName, type RpcMethodName, type RpcParams, type RpcResult, type ThreadSummary } from '@boite/contracts';
import { RpcFailure, WsClient, type CallOptions, type Client, type ClientState, type EventHandler, type ObservableClient, type Session } from '@boite/ui/lib/client';
import { fill, strings } from '../strings';
import type { MemberKeys } from './member-keys';
import { heardEverywhere, isMerged, memberBackoff, membersOf, requestOfCall, threadOfCall, threadOfEvent, type MergedMethod } from './routing';

/** Between two tickets for one member, and between two tries of one that is out of reach (Boite's group links wait as long). */
export const RETRY_MS = 60_000;
/** How long a member gets to answer a list before its last one stands in. */
export const ANSWER_MS = 4_000;
/** How long an address gets to open, when a member is reached anew. */
const PROBE_MS = 4_000;

/** What opening a member needs: where, with what, and who to tell about the key. */
export interface MemberLink {
  url: string;
  /** The key held for that member; empty when a ticket opens it. */
  token: string;
  ticket?: string;
  /** The member made a session: its key is kept. False refuses it (the member left meanwhile). */
  onSession(session: Session): boolean;
  /** The key no longer opens that member. */
  onRevoked(): void;
}

export interface GroupClientOptions {
  keys: MemberKeys;
  /** Opens a member; a socket to its core by default. */
  open?: (link: MemberLink) => ObservableClient;
  /** The first address that answers, or null. */
  reach?: (addresses: string[]) => Promise<string | null>;
  /** An HTTPS page sends keys over HTTPS only. */
  secure?: () => boolean;
  now?: () => number;
  /** A member came or went: its threads arrive, or leave, on the next read of the lists. */
  changed?: () => void;
  answerMs?: number;
  retryMs?: number;
}

/** A member of the group, as this client holds it. */
interface Member {
  core: GroupCore;
  groupId: string;
  addresses: string[];
  client: ObservableClient | null;
  /** The listeners on `client`, removed with it. */
  off: (() => void)[];
  /** When it was last opened or asked a ticket for, so neither repeats within a minute. */
  triedAt: number;
  reaching: boolean;
  /** Its last answer to each list, standing in while it is slow. */
  lists: Map<string, unknown[]>;
}

/** A member of the group as this client sees it: connected, on its way, or not reached yet. */
export interface MachineView {
  coreId: string;
  name: string;
  state: ClientState | 'unreached';
}

function opens(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url.replace(/^http/, 'ws') + RPC_PATH);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const settle = (ok: boolean): void => {
      clearTimeout(timer);
      socket.onopen = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch { /* never opened */ }
      if (ok) resolve(url);
      else reject(new Error('unreachable'));
    };
    const timer = setTimeout(() => settle(false), PROBE_MS);
    socket.onopen = () => settle(true);
    socket.onerror = () => settle(false);
    socket.onclose = () => settle(false);
  });
}

/** The first address of a member whose socket opens, as Boite's group links pick it. */
export async function firstReachable(addresses: string[]): Promise<string | null> {
  try {
    return await Promise.any(addresses.map(opens));
  } catch {
    return null;
  }
}

function socketTo(link: MemberLink): ObservableClient {
  return new WsClient({
    url: link.url,
    token: link.token,
    ...(link.ticket === undefined ? {} : { ticket: link.ticket }),
    paired: true,
    clientName: 'plugin',
    onSession: link.onSession,
    onRevoked: link.onRevoked,
    // A remote core that refuses the key closes this client for good: the key is dead.
    onUnauthorized: link.onRevoked,
    backoff: memberBackoff
  });
}

/** `promise`, or a rejection once `ms` have passed. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('late')), ms)));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export class GroupClient implements ObservableClient {
  readonly local: ObservableClient;
  readonly #keys: MemberKeys;
  readonly #open: (link: MemberLink) => ObservableClient;
  readonly #reachOf: (addresses: string[]) => Promise<string | null>;
  readonly #secure: () => boolean;
  readonly #now: () => number;
  readonly #changed: () => void;
  readonly #answerMs: number;
  readonly #retryMs: number;
  #group: Group | null = null;
  readonly #members = new Map<string, Member>();
  /** Thread id → the member it runs on; a thread of this machine is not in it. */
  readonly #owners = new Map<string, string>();
  /** Permission id → the member that asked it. */
  readonly #requests = new Map<string, string>();
  readonly #handlers = new Map<RpcEventName, Set<(payload: unknown) => void>>();
  readonly #off: (() => void)[] = [];
  /** The members that answered the last thread list themselves. */
  #answered: string[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #reading: Promise<void> | null = null;
  #readAgain = false;
  #closed = false;

  constructor(local: ObservableClient, options: GroupClientOptions) {
    this.local = local;
    this.#keys = options.keys;
    this.#open = options.open ?? socketTo;
    this.#reachOf = options.reach ?? firstReachable;
    this.#secure = options.secure ?? (() => typeof location !== 'undefined' && location.protocol === 'https:');
    this.#now = options.now ?? Date.now;
    this.#changed = options.changed ?? (() => undefined);
    this.#answerMs = options.answerMs ?? ANSWER_MS;
    this.#retryMs = options.retryMs ?? RETRY_MS;
    this.#off.push(
      local.onState((state) => {
        if (state === 'ready') void this.#readGroup();
      }),
      local.on('group.updated', () => void this.#readGroup())
    );
  }

  get state(): ClientState {
    return this.local.state;
  }

  get principal(): Principal | null {
    return this.local.principal;
  }

  get core(): CoreInfo | null {
    return this.local.core;
  }

  onState(handler: (state: ClientState) => void): () => void {
    return this.local.onState(handler);
  }

  async connect(): Promise<CoreInfo> {
    const core = await this.local.connect();
    void this.#readGroup();
    return core;
  }

  close(): void {
    this.#closed = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    for (const member of this.#members.values()) this.#letGo(member);
    this.#members.clear();
    this.#off.splice(0).forEach((off) => off());
    this.local.close();
  }

  on<E extends RpcEventName>(event: E, handler: EventHandler<E>): () => void {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
      this.#off.push(this.local.on(event, (payload) => this.#dispatch(event, payload, null)));
      if (heardEverywhere(event)) for (const member of this.#members.values()) this.#hear(member, event);
    }
    const erased = handler as (payload: unknown) => void;
    set.add(erased);
    return () => void set.delete(erased);
  }

  call<M extends RpcMethodName>(method: M, params: RpcParams<M>, options?: CallOptions): Promise<RpcResult<M>> {
    if (this.#members.size > 0 && isMerged(method, params)) return this.#merged(method, params, options) as Promise<RpcResult<M>>;
    const coreId = this.#placeOf(method, params);
    if (coreId === null) return this.local.call(method, params, options);
    return this.#callOn(coreId, method, params, options);
  }

  /**
   * A client bound to one machine: this one for null or this core's own id, else
   * that member, refused while it is out of reach. What an agent's calls go
   * through, since an agent id does not say where it lives. Its events are the
   * group's: the agents and threads of every member are heard here already.
   */
  at(coreId: string | null): Client {
    if (coreId === null || coreId === this.#group?.self) return this.local;
    const client = () => this.#members.get(coreId)?.client ?? null;
    return {
      connect: () => this.connect(),
      call: (method, params, options) => this.#callOn(coreId, method, params, options),
      on: (event, handler) => this.on(event, handler),
      // The member's connection is the group client's to close.
      close: () => undefined,
      get state(): ClientState {
        return client()?.state ?? 'closed';
      },
      get principal(): Principal | null {
        return client()?.principal ?? null;
      }
    };
  }

  /** This machine's id in the group, null outside one. */
  selfId(): string | null {
    return this.#group?.self ?? null;
  }

  /** The name the roster gives a member; null for one not in it. */
  nameOf(coreId: string): string | null {
    return this.#members.get(coreId)?.core.name ?? null;
  }

  #callOn<M extends RpcMethodName>(coreId: string, method: M, params: RpcParams<M>, options?: CallOptions): Promise<RpcResult<M>> {
    const member = this.#members.get(coreId);
    if (!member?.client || member.client.state !== 'ready') {
      const machine = member?.core.name ?? coreId;
      return Promise.reject(new RpcFailure({ code: RpcErrorCode.Unavailable, message: fill(strings.bots.machineAway, { machine }) }));
    }
    return member.client.call(method, params, options);
  }

  /** The name of the machine a thread runs on; null for this machine's own, or one not known. */
  machineOf(threadId: string): string | null {
    const coreId = this.#owners.get(threadId);
    return coreId === undefined ? null : (this.#members.get(coreId)?.core.name ?? null);
  }

  /** The member id a thread runs on; null for this machine's. */
  coreIdOf(threadId: string): string | null {
    return this.#owners.get(threadId) ?? null;
  }

  /** The thread runs on a member that is not connected now: missing from the lists, not gone. */
  away(threadId: string): boolean {
    const coreId = this.#owners.get(threadId);
    if (coreId === undefined) return false;
    return this.#members.get(coreId)?.client?.state !== 'ready';
  }

  /** The members that answered the last thread list: their lists are whole. */
  answered(): readonly string[] {
    return this.#answered;
  }

  /** The other machines of the group, in roster order. */
  machines(): MachineView[] {
    return [...this.#members.values()].map((member) => ({ coreId: member.core.coreId, name: member.core.name, state: member.client?.state ?? 'unreached' }));
  }

  /** The same call made on every connected member, with each answer and its machine; one that fails or is slow gives none. */
  async elsewhere<M extends RpcMethodName>(method: M, params: RpcParams<M>): Promise<{ core: GroupCore; result: RpcResult<M> }[]> {
    const ready = [...this.#members.values()].filter((member) => member.client?.state === 'ready');
    const answers = await Promise.all(ready.map((member) => within(member.client!.call(method, params), this.#answerMs).then((result) => ({ core: member.core, result }), () => null)));
    return answers.filter((answer) => answer !== null);
  }

  // -- Calls and events ------------------------------------------------------

  #placeOf(method: RpcMethodName, params: unknown): string | null {
    const requestId = requestOfCall(method, params);
    if (requestId !== null) return this.#requests.get(requestId) ?? null;
    const threadId = threadOfCall(method, params);
    return threadId === null ? null : (this.#owners.get(threadId) ?? null);
  }

  async #merged(method: MergedMethod, params: unknown, options?: CallOptions): Promise<unknown[]> {
    const key = `${method} ${JSON.stringify(params ?? {})}`;
    const mine = this.local.call(method, params as never, options) as Promise<unknown[]>;
    const ready = [...this.#members.values()].filter((member) => member.client?.state === 'ready');
    const theirs = ready.map((member) =>
      within(member.client!.call(method, params as never) as Promise<unknown[]>, this.#answerMs).then(
        (list) => {
          member.lists.set(key, list);
          return { member, list, fresh: true };
        },
        () => ({ member, list: member.lists.get(key) ?? [], fresh: false })
      )
    );
    const [local, ...remote] = await Promise.all([mine, ...theirs]);
    if (method === 'threads.list') this.#answered = remote.filter((entry) => entry.fresh).map((entry) => entry.member.core.coreId);
    for (const { member, list } of remote) this.#place(method, list, member.core.coreId);
    return [...local, ...remote.flatMap((entry) => entry.list)];
  }

  /** Notes where each thread and request of a member's list runs. */
  #place(method: MergedMethod, list: readonly unknown[], coreId: string): void {
    for (const entry of list) {
      if (method === 'threads.list') this.#owners.set((entry as ThreadSummary).id, coreId);
      else {
        const request = entry as PermissionRequest | QuestionRequest;
        this.#owners.set(request.threadId, coreId);
        if (method === 'permissions.list') this.#requests.set(request.id, coreId);
      }
    }
  }

  #dispatch(event: RpcEventName, payload: unknown, coreId: string | null): void {
    if (coreId !== null) {
      const threadId = threadOfEvent(event, payload);
      if (threadId !== null) this.#owners.set(threadId, coreId);
      if (event === 'permission.requested') this.#requests.set((payload as PermissionRequest).id, coreId);
    }
    if (event === 'permission.resolved') this.#requests.delete((payload as { requestId: string }).requestId);
    for (const handler of [...(this.#handlers.get(event) ?? [])]) handler(payload);
  }

  #hear(member: Member, event: RpcEventName): void {
    if (member.client) member.off.push(member.client.on(event, (payload) => this.#dispatch(event, payload, member.core.coreId)));
  }

  // -- The roster -------------------------------------------------------------

  async #readGroup(): Promise<void> {
    if (this.#reading) {
      this.#readAgain = true;
      return this.#reading;
    }
    this.#reading = (async () => {
      do {
        this.#readAgain = false;
        if (this.#closed || this.local.state !== 'ready') return;
        try {
          this.#group = await this.local.call('group.get', {});
        } catch (error) {
          // A core older than groups knows no group; any other failure keeps the roster as it was.
          if (error instanceof RpcFailure && error.code === RpcErrorCode.MethodNotFound) this.#group = null;
          else return;
        }
        this.#reconcile();
      } while (this.#readAgain);
    })().finally(() => (this.#reading = null));
    return this.#reading;
  }

  #reconcile(): void {
    if (this.#closed) return;
    const group = this.#group;
    const wanted = membersOf(group, this.#secure());
    const ids = new Set(wanted.map(({ core }) => core.coreId));
    let changed = false;
    for (const [coreId, member] of this.#members) {
      if (ids.has(coreId)) continue;
      this.#letGo(member);
      this.#members.delete(coreId);
      changed = true;
    }
    // A key for a machine the group no longer lists opens nothing Bots shows: it goes.
    for (const coreId of this.#keys.ids()) if (!ids.has(coreId)) this.#keys.drop(coreId);
    for (const { core, addresses } of wanted) {
      let member = this.#members.get(core.coreId);
      if (!member) {
        member = { core, groupId: group!.id, addresses, client: null, off: [], triedAt: -Infinity, reaching: false, lists: new Map() };
        this.#members.set(core.coreId, member);
      } else Object.assign(member, { core, groupId: group!.id, addresses });
      // A key made in another group, before the member was admitted again, or for an address it no longer gives, is not sent.
      const key = this.#keys.get(core.coreId);
      const stale = key !== null && (key.groupId !== group!.id || key.epoch < core.epoch || !addresses.includes(key.url));
      if (stale) {
        this.#keys.drop(core.coreId);
        if (member.client) {
          this.#letGo(member);
          changed = true;
        }
      }
      if (!member.client) void this.#reach(member);
    }
    if (changed) this.#changed();
  }

  /** Opens a member: with its key when Bots holds one, else with a ticket this machine vouches with. */
  async #reach(member: Member): Promise<void> {
    if (this.#closed || member.client || member.reaching || this.#members.get(member.core.coreId) !== member) return;
    if (this.#now() - member.triedAt < this.#retryMs) {
      this.#later();
      return;
    }
    const coreId = member.core.coreId;
    member.triedAt = this.#now();
    const key = this.#keys.get(coreId);
    if (key) {
      this.#attach(member, { url: key.url, token: key.token, onSession: () => true, onRevoked: () => this.#keys.drop(coreId) });
      return;
    }
    if (member.addresses.length === 0 || this.local.state !== 'ready') {
      this.#later();
      return;
    }
    member.reaching = true;
    try {
      const url = await this.#reachOf(member.addresses);
      if (url === null || !this.#current(member, url)) return;
      // Asked for last: a ticket is good for a minute and for one socket, at the address it names.
      const { ticket } = await this.local.call('group.ticket', { coreId, url });
      if (!this.#current(member, url)) return;
      const { groupId } = member;
      const epoch = member.core.epoch;
      this.#attach(member, {
        url,
        token: '',
        ticket,
        onSession: (session) => {
          if (!this.#still(member, url)) return false;
          this.#keys.set(coreId, { url, token: session.token, groupId, epoch });
          return true;
        },
        onRevoked: () => this.#keys.drop(coreId)
      });
    } catch {
      // This machine's core refused the ticket or went away: the next pass asks again.
    } finally {
      member.reaching = false;
      if (!member.client) this.#later();
    }
  }

  /** The member is still the group's and still at that address, and nothing closed meanwhile. */
  #still(member: Member, url: string): boolean {
    return !this.#closed && this.#members.get(member.core.coreId) === member && member.addresses.includes(url);
  }

  /** As `#still`, before a client is opened for it. */
  #current(member: Member, url: string): boolean {
    return this.#still(member, url) && member.client === null;
  }

  #attach(member: Member, link: MemberLink): void {
    const client = this.#open(link);
    member.client = client;
    let ready = false;
    member.off.push(
      client.onState((state) => {
        if (member.client !== client) return;
        if (state === 'closed') this.#lost(member);
        else if (state === 'ready') {
          ready = true;
          // Its threads come on the next read of the lists.
          this.#changed();
        } else if (state === 'connecting' && ready) {
          // They leave it while the socket is down, and come back with it.
          ready = false;
          member.lists.clear();
          this.#changed();
        }
      })
    );
    for (const event of this.#handlers.keys()) if (heardEverywhere(event)) this.#hear(member, event);
    void client.connect().catch(() => undefined);
  }

  /** The member's client closed for good (key refused, revoked, or a core it cannot speak to): reached anew, paced. */
  #lost(member: Member): void {
    this.#letGo(member);
    this.#changed();
    void this.#reach(member);
  }

  #letGo(member: Member): void {
    const client = member.client;
    member.off.splice(0).forEach((off) => off());
    member.client = null;
    member.lists.clear();
    if (client && client.state !== 'closed') client.close();
  }

  /** One timer for the member due first, while any is out of reach; none at rest. */
  #later(): void {
    if (this.#timer !== null || this.#closed) return;
    const waiting = [...this.#members.values()].filter((member) => !member.client && !member.reaching);
    if (waiting.length === 0) return;
    const due = Math.min(...waiting.map((member) => member.triedAt + this.#retryMs - this.#now()));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      for (const member of [...this.#members.values()]) if (!member.client) void this.#reach(member);
    }, Math.max(1_000, due));
  }
}
