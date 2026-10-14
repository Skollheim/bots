/*
 * The island's link to the core for the model picker: the companion owns the
 * client, so one `CoreLink` per client follows it (`CoreLink.follow`) and
 * keeps the providers, accounts, settings and model lists the picker reads,
 * for as long as that client lives. An agent on another machine of the group
 * reads that machine's providers and models (`GroupClient.at`), one link per
 * machine.
 */
import type { Client } from '@boite/ui/lib/client';
import { CoreLink } from '../core.svelte';
import { GroupClient } from '../group/group-client';
import { PickerStore } from './store.svelte';

const stores = new WeakMap<Client, PickerStore>();
const machines = new WeakMap<GroupClient, Map<string, PickerStore>>();

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

/** The picker's store for an agent's machine: this client's own, or the group member's that `coreId` names. */
export function pickerStoreAt(client: Client, coreId: string | null): PickerStore | null {
  if (coreId === null) return pickerStoreFor(client);
  if (!(client instanceof GroupClient)) return null;
  let byMachine = machines.get(client);
  if (!byMachine) machines.set(client, (byMachine = new Map()));
  const known = byMachine.get(coreId);
  if (known) return known;
  const link = new CoreLink();
  link.follow(client.at(coreId));
  const store = new PickerStore(link);
  byMachine.set(coreId, store);
  return store;
}
