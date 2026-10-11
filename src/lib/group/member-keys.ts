/*
 * The session keys Bots holds on the other machines of the group, one per
 * member (by `coreId`), kept where Bots keeps its data, as Boite's UI keeps
 * its own (`StoredEnvironment` in `boite.envs`). A key is a password to that
 * machine: it is never logged, shown or sent anywhere but the machine it opens.
 */

/** One member's key and where it was issued. */
export interface MemberKey {
  /** The address the ticket named: the key goes there and nowhere else. */
  url: string;
  token: string;
  groupId: string;
  /** The member's admission when the key was made: a later one makes it stale. */
  epoch: number;
}

export interface MemberKeys {
  get(coreId: string): MemberKey | null;
  set(coreId: string, key: MemberKey): void;
  drop(coreId: string): void;
  /** Every member that holds a key, to let go the ones the group no longer lists. */
  ids(): string[];
}

export const MEMBER_KEYS_STORAGE = 'bots.groupKeys';

function parse(raw: string | null): Record<string, MemberKey> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const keys: Record<string, MemberKey> = {};
    for (const [coreId, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const { url, token, groupId, epoch } = entry as Record<string, unknown>;
      if (typeof url === 'string' && typeof token === 'string' && token !== '' && typeof groupId === 'string' && typeof epoch === 'number') {
        keys[coreId] = { url, token, groupId, epoch };
      }
    }
    return keys;
  } catch {
    return {};
  }
}

/** The keys in `storage` (the window's `localStorage`), read on each use so every window agrees. */
export function storedKeys(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): MemberKeys {
  const read = () => parse(storage.getItem(MEMBER_KEYS_STORAGE));
  const write = (keys: Record<string, MemberKey>) => {
    try {
      if (Object.keys(keys).length === 0) storage.removeItem(MEMBER_KEYS_STORAGE);
      else storage.setItem(MEMBER_KEYS_STORAGE, JSON.stringify(keys));
    } catch {
      // A full or locked storage: the key lives for this run only, a ticket brings another next time.
    }
  };
  return {
    get: (coreId) => read()[coreId] ?? null,
    set: (coreId, key) => write({ ...read(), [coreId]: key }),
    drop: (coreId) => {
      const keys = read();
      if (!(coreId in keys)) return;
      delete keys[coreId];
      write(keys);
    },
    ids: () => Object.keys(read())
  };
}

/** Keys held for this run only: the demo and the tests. */
export function memoryKeys(): MemberKeys {
  const keys = new Map<string, MemberKey>();
  return {
    get: (coreId) => keys.get(coreId) ?? null,
    set: (coreId, key) => void keys.set(coreId, key),
    drop: (coreId) => void keys.delete(coreId),
    ids: () => [...keys.keys()]
  };
}
