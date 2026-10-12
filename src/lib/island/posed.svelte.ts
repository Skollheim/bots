/*
 * What a capture pose (`pose.ts`) lays on the island's watches, which live in
 * `Island.svelte`: a memory warning or what the guard stopped, a newer Boite,
 * Home's sessions shown empty, and the recap of an absence. Read in the dev
 * bundle only.
 */
import type { AwayAlarm, AwayEvent, AwayQuota, AwaySpan, AwayWaiting } from './away';
import type { Pressure, Stopped } from './pressure';
import type { Release } from './update';

/** A posed recap: what happened, and what waits, the reminders and the quota, which the fake core does not give. */
export interface AwayPose {
  span: AwaySpan;
  events: AwayEvent[];
  waiting: AwayWaiting[];
  alarms: AwayAlarm[];
  quota: AwayQuota | null;
}

export const posed = $state<{ pressure: Pressure | null; stopped: Stopped | null; release: Release | null; idle: boolean; away: AwayPose | null }>({
  pressure: null,
  stopped: null,
  release: null,
  idle: false,
  away: null
});
