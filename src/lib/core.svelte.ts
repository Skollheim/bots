/*
 * What Bots's settings panel knows of Boite: its providers, accounts,
 * projects, settings and agents, read once connected and kept current from
 * the core's events. Boite's own `Store` does this for the whole app; the
 * settings panel needs only this much of it, on its own connection.
 *
 * `accountsOf` and `modelsOf` follow Boite's store (packages/ui/src/lib/store/
 * accounts.svelte.ts and models.svelte.ts at c4a8b0f7), so the settings offer
 * the same choices Boite does.
 */
import {
  subscriptionProxyName,
  subscriptionProxyOf,
  type Account,
  type AgentsSnapshot,
  type ModelInfo,
  type Project,
  type ProviderId,
  type ProviderSummary,
  type Settings
} from '@boite/contracts';
import { WsClient, type Client, type ClientState, type ObservableClient } from '@boite/ui/lib/client';
import { waitForCore, watchEndpoint } from './connection';
import { readableSnapshot } from './group/agents';

const probeKey = (providerId: ProviderId, accountId: string) => `${providerId}::${accountId}`;

export class CoreLink {
  client = $state.raw<ObservableClient | null>(null);
  connection = $state<ClientState>('idle');
  /** No core found yet: Boite is not running. */
  waiting = $state(false);
  endpointUrl = $state<string | null>(null);
  providers = $state.raw<ProviderSummary[]>([]);
  accounts = $state.raw<Account[]>([]);
  projects = $state.raw<Project[]>([]);
  settings = $state.raw<Settings | null>(null);
  probedModels = $state.raw<Record<string, ModelInfo[]>>({});
  /** The model reads running, by `providerId::accountId`: the model picker says it is reading. */
  probing = $state.raw<string[]>([]);
  #off: (() => void)[] = [];
  #stopped = false;
  /** The model reads asked of the core, by agent and account, answered or not. */
  #probes = new Map<string, Promise<void>>();

  /** A paired phone is refused the owner's controls; Bots speaks with the owner's token. */
  get owner(): boolean {
    return this.client?.principal !== 'session';
  }

  /** Finds the core, waiting for Boite when it is not running, then follows it. */
  async start(make: () => Promise<ObservableClient | null> = () => this.#open()): Promise<void> {
    const client = await make();
    if (!client || this.#stopped) return client?.close();
    this.#off.push(this.follow(client));
    await client.connect().catch(() => {});
  }

  /**
   * Keeps the lists current from a client someone else opened and closes: the
   * island's, which the companion owns. Read at once when it is connected
   * already, and again on each connection. Returns the release.
   */
  follow(client: Client & { onState?: ObservableClient['onState'] }): () => void {
    this.client = client as ObservableClient;
    const offs = [
      client.onState?.((state) => {
        this.connection = state;
        if (state === 'ready') void this.load();
      }) ?? (() => {}),
      client.on('providers.updated', ({ loaded }) => (this.providers = loaded)),
      client.on('accounts.updated', (account) => (this.accounts = [...this.accounts.filter((a) => a.id !== account.id), account])),
      client.on('accounts.removed', ({ accountId }) => (this.accounts = this.accounts.filter((a) => a.id !== accountId))),
      client.on('settings.updated', (settings) => (this.settings = settings)),
      client.on('providers.probed', ({ providerId, accountId, models }) => (this.probedModels = { ...this.probedModels, [probeKey(providerId, accountId)]: models }))
    ];
    if (client.state === 'ready') {
      this.connection = 'ready';
      void this.load();
    }
    return () => offs.forEach((off) => off());
  }

  async #open(): Promise<ObservableClient | null> {
    const endpoint = await waitForCore(() => this.#stopped, () => (this.waiting = true));
    this.waiting = false;
    if (!endpoint) return null;
    this.endpointUrl = endpoint.url;
    const ws = new WsClient({ url: endpoint.url, token: endpoint.token, clientName: 'plugin' });
    this.#off.push(watchEndpoint(endpoint, () => ws.state === 'ready', () => location.reload()));
    return ws;
  }

  /** Reads every list again: on each connection, a reconnection included. */
  async load(): Promise<void> {
    const client = this.client;
    if (!client) return;
    const [providers, accounts, projects, settings] = await Promise.allSettled([
      client.call('providers.list', {}),
      client.call('accounts.list', {}),
      client.call('projects.list', {}),
      client.call('settings.get', {})
    ]);
    if (client !== this.client) return;
    if (providers.status === 'fulfilled') this.providers = providers.value.loaded;
    if (accounts.status === 'fulfilled') this.accounts = accounts.value;
    if (projects.status === 'fulfilled') this.projects = projects.value;
    if (settings.status === 'fulfilled') this.settings = settings.value;
  }

  /** A proxied provider shows one account named after its gateway, as in Boite. */
  accountsOf(providerId: ProviderId): Account[] {
    const own = this.accounts.filter((account) => account.providerId === providerId);
    const provider = this.providers.find((entry) => entry.id === providerId);
    const proxy = own.length && provider ? subscriptionProxyOf(this.settings, provider) : null;
    return proxy ? [{ ...own[0]!, label: subscriptionProxyName(proxy.kind), identity: null, status: 'ok' }] : own;
  }

  /** The models an agent listed when probed, else its descriptor's; Claude has no catalogue to fall back to. */
  modelsOf(providerId: ProviderId, accountId: string | null): ModelInfo[] {
    const probed = accountId ? this.probedModels[probeKey(providerId, accountId)] : undefined;
    if (probed) return probed;
    const provider = this.providers.find((entry) => entry.id === providerId);
    return provider?.protocol === 'claude-sdk' ? [] : provider?.models ?? [];
  }

  /**
   * Reads the models an agent lists with this account. Each read starts the
   * agent's executable for a moment, so it runs once per window, a failed one
   * included: account updates come with every quota change and must not start
   * it again. `refresh` asks the agent again, past the core's cache: the model
   * picker's refresh button.
   */
  probeModels(providerId: ProviderId, accountId: string, refresh = false): Promise<void> {
    const client = this.client;
    const key = probeKey(providerId, accountId);
    const known = this.#probes.get(key);
    if (!client || (!refresh && this.probedModels[key])) return Promise.resolve();
    if (known && (!refresh || this.probing.includes(key))) return known;
    this.probing = [...this.probing, key];
    const read = client
      .call('providers.probe', { providerId, accountId, ...(refresh ? { refresh: true } : {}) })
      .then(({ models }) => {
        if (client === this.client) this.probedModels = { ...this.probedModels, [key]: models };
      })
      .finally(() => (this.probing = this.probing.filter((entry) => entry !== key)));
    this.#probes.set(key, read);
    return read;
  }

  isProbing(providerId: ProviderId, accountId: string | null): boolean {
    return accountId !== null && this.probing.includes(probeKey(providerId, accountId));
  }

  /** Stores the starred models in the core's settings, where Boite reads them. */
  async saveSettings(patch: Partial<Settings> & Record<string, unknown>): Promise<void> {
    const client = this.client;
    if (!client) return;
    const settings = await client.call('settings.set', patch as Partial<Settings>);
    if (client === this.client) this.settings = settings;
  }

  stop(): void {
    this.#stopped = true;
    this.#off.forEach((off) => off());
    this.#off = [];
    this.client?.close();
    this.client = null;
  }
}

/** The settle time between two snapshots: agents change many records per turn. */
const SETTLE_MS = 1500;

/**
 * The core's agents, read with `agents.snapshot` and again after
 * `agents.changed`, at most once per `SETTLE_MS`: the crew settings list them.
 * After Boite's `AgentDirectory` (packages/ui/src/lib/agent-directory.svelte.ts
 * at c4a8b0f7), without its thread views.
 */
export class AgentDirectory {
  snapshot = $state.raw<AgentsSnapshot | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly link: Pick<CoreLink, 'client' | 'connection'>) {}

  /** Keeps the snapshot current while the caller is mounted. Returns the release. */
  watch(): () => void {
    const client = this.link.client;
    if (!client || this.link.connection !== 'ready') return () => {};
    const off = client.on('agents.changed', () => this.#schedule());
    void this.reload();
    return () => {
      off();
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = null;
    };
  }

  #schedule(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.reload();
    }, SETTLE_MS);
  }

  /** Reads the snapshot again now, after a change this window made. */
  async reload(): Promise<void> {
    const client = this.link.client;
    if (!client) return;
    try {
      const snapshot = readableSnapshot(await client.call('agents.snapshot', {}));
      if (client === this.link.client) this.snapshot = snapshot;
    } catch {
      // An older core without agents, or a dropped connection: the list stays as it was.
    }
  }
}
