/*
 * What a capture pose (`pose.ts`) lays on the island's watches, which live in
 * `Island.svelte`: a memory warning or what the guard stopped, a newer Boite,
 * and Home's sessions shown empty. Read in the dev bundle only.
 */
import type { Pressure, Stopped } from './pressure';
import type { Release } from './update';

export const posed = $state<{ pressure: Pressure | null; stopped: Stopped | null; release: Release | null; idle: boolean }>({ pressure: null, stopped: null, release: null, idle: false });
