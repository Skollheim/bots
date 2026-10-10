/*
 * How Bots finds Boite's core. The shell answers first (`core_endpoint` in
 * `src-tauri/src/endpoint.rs`): the environment Boite launches Bots with
 * (`BOITE_CORE_URL`, `BOITE_TOKEN`), else the `core.json` Boite writes in its
 * data folder, read the way Boite's CLI reads it. A page outside the shell
 * (`bun run dev` in a browser) takes `?core=` and `?token=` instead.
 *
 * With no core found, the window waits and asks again every few seconds: Boite
 * may start after Bots. Once found, `WsClient` keeps the socket up by itself,
 * with its own backoff. A core started again from its data folder can come
 * back on another port with another token: `watchEndpoint` notices that while
 * the socket is down and reloads the page onto the new one.
 */
import { inShell } from './companion/shell';

export interface CoreEndpoint {
  url: string;
  token: string;
  /** `env`: launched by Boite. `file`: read from Boite's `core.json`. `query`: a browser page. */
  source: 'env' | 'file' | 'query';
}

/** How often a waiting window looks for the core again. */
export const LOOK_EVERY = 3_000;

const isEndpoint = (value: unknown): value is CoreEndpoint => {
  if (!value || typeof value !== 'object') return false;
  const { url, token, source } = value as Record<string, unknown>;
  return typeof url === 'string' && url !== '' && typeof token === 'string' && token !== '' && (source === 'env' || source === 'file' || source === 'query');
};

/** The core's address and token now, or null while Boite is not running. */
export async function findCore(): Promise<CoreEndpoint | null> {
  if (!inShell()) {
    const query = new URLSearchParams(location.search);
    const url = query.get('core');
    const token = query.get('token');
    return url && token ? { url, token, source: 'query' } : null;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const found = await invoke<unknown>('core_endpoint').catch(() => null);
  return isEndpoint(found) ? found : null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Looks until a core answers the lookup, telling `onwait` once it has to wait.
 * Resolves null when `stopped()` turns true first.
 */
export async function waitForCore(stopped: () => boolean, onwait: () => void, every = LOOK_EVERY): Promise<CoreEndpoint | null> {
  let told = false;
  while (!stopped()) {
    const found = await findCore().catch(() => null);
    if (found) return found;
    if (!told) {
      told = true;
      onwait();
    }
    await sleep(every);
  }
  return null;
}

export const sameCore = (a: CoreEndpoint, b: CoreEndpoint): boolean => a.url === b.url && a.token === b.token;

/**
 * While the socket is down, looks whether `core.json` now names another core
 * (Boite restarted on a new port or token) and calls `onmoved` once if so. An
 * endpoint from the environment never moves: Boite relaunches Bots instead.
 */
export function watchEndpoint(current: CoreEndpoint, ready: () => boolean, onmoved: () => void, every = LOOK_EVERY): () => void {
  if (current.source !== 'file') return () => {};
  let done = false;
  const timer = setInterval(() => {
    if (done || ready()) return;
    void findCore().then((found) => {
      if (done || !found || sameCore(found, current)) return;
      done = true;
      onmoved();
    }).catch(() => {});
  }, every);
  return () => {
    done = true;
    clearInterval(timer);
  };
}
