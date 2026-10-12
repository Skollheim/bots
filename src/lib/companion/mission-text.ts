/*
 * How a mission's schedule reads in the UI, in the user's language: "Every
 * day at 09:00", "Fridays at 18:00", "Once, Fri 16 Oct at 18:00", and when it
 * comes next. The request line's own words are in `missions.ts`.
 */
import { formatLocale } from '@boite/ui/lib/i18n.svelte';
import { fill, strings } from '../strings';
import type { Mission } from './missions';

const pad = (value: number) => String(value).padStart(2, '0');

/** `09:00`, the time of day a mission runs at. */
export const clockOf = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** A weekday's name, Sunday 0, in the user's language. */
function weekdayName(day: number): string {
  // 2026-10-11 is a Sunday.
  return new Intl.DateTimeFormat(formatLocale(), { weekday: 'long' }).format(new Date(2026, 9, 11 + day));
}

/** How often and when it runs. */
export function repeatText(mission: Pick<Mission, 'repeat' | 'minutes' | 'due'>): string {
  const copy = strings.companion.mission;
  const time = clockOf(mission.minutes);
  const { repeat } = mission;
  if (repeat.kind === 'daily') return fill(copy.daily, { time });
  if (repeat.kind === 'weekdays') return fill(copy.weekdays, { time });
  if (repeat.kind === 'weekly') return fill(copy.weekly, { day: weekdayName(repeat.day), time });
  return fill(copy.once, { when: whenText(mission.due) });
}

/** A moment, as the cards and Settings show it: `Fri 16 Oct, 18:00`. */
export function whenText(at: number): string {
  return new Intl.DateTimeFormat(formatLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at);
}
