/*
 * The island's update watch: the running Boite's version (`core.updateStatus`)
 * against GitHub's release list, every few hours, for a card in Home that
 * says a newer one is out on its track. "Later" sets that version aside;
 * a newer one shows again. The install itself stays Boite's (its app update
 * settings): the card brings Boite forward. Pure picking: `update.ts`.
 */
import type { Client } from '@boite/ui/lib/client';
import { newerRelease, type GitHubRelease, type Release } from './update';

export const RELEASES_URL = 'https://api.github.com/repos/mtsu-dev/boite/releases?per_page=100';
export const UPDATE_STORAGE_KEY = 'bots.update';
/** GitHub is read once a while after the start, then every six hours. */
export const FIRST_CHECK_MS = 60_000;
export const CHECK_EVERY = 6 * 60 * 60 * 1000;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(UPDATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export class UpdateWatch {
  /** The newer release, set aside or not. */
  available = $state.raw<Release | null>(null);
  #dismissed = $state<string | null>(readDismissed());
  /** The release to offer: the newer one, unless set aside. */
  readonly offer = $derived(this.available && this.available.version !== this.#dismissed ? this.available : null);

  /** Checks a while after the start and every few hours. Returns the stop. */
  follow(client: Client, read: Fetch = (url, init) => fetch(url, init)): () => void {
    const check = () => void this.check(client, read).catch(() => {});
    let timer = setTimeout(function again() {
      check();
      timer = setTimeout(again, CHECK_EVERY);
    }, FIRST_CHECK_MS);
    return () => clearTimeout(timer);
  }

  async check(client: Client, read: Fetch): Promise<void> {
    const status = await client.call('core.updateStatus', {});
    const response = await read(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    const releases = (await response.json()) as GitHubRelease[];
    if (Array.isArray(releases)) this.available = newerRelease(status.currentVersion, releases);
  }

  /** "Later": this version stays aside, a newer one shows again. */
  dismiss(): void {
    const version = this.available?.version;
    if (!version) return;
    this.#dismissed = version;
    try {
      window.localStorage.setItem(UPDATE_STORAGE_KEY, version);
    } catch {
      // Kept for this run only.
    }
  }

  /** A capture pose's release (`pose.ts`). */
  pose(release: Release | null): void {
    this.available = release;
    this.#dismissed = null;
  }
}
