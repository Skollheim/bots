/*
 * The island's link to the core for the model picker: the companion owns the
 * client, so one `CoreLink` per client follows it (`CoreLink.follow`) and
 * keeps the providers, accounts, settings and model lists the picker reads,
 * for as long as that client lives.
 */
import type { Client } from '@boite/ui/lib/client';
import { CoreLink } from '../core.svelte';
import { PickerStore } from './store.svelte';

const stores = new WeakMap<Client, PickerStore>();

/** The picker's store over this client, made the first time it is asked for. */
export function pickerStoreFor(client: Client): PickerStore {
  const known = stores.get(client);
  if (known) return known;
  const link = new CoreLink();
  link.follow(client);
  const store = new PickerStore(link);
  stores.set(client, store);
  return store;
}
