/*
 * What the island keeps for the recap when the user comes back (`away.ts`,
 * `views/AwayCard.svelte`): as they happen, the threads that ended, the pull
 * requests whose CI settled and the memory guard's warnings, a day at most;
 * and the absence the card tells of, until "OK".
 *
 * A new absence while the card still waits joins it: the card then tells
 * both, from the first leaving. Opening a line from the card puts it away.
 */
import { untrack } from 'svelte';
import type { Absence } from '../companion/absence';
import { strings } from '../strings';
import { joinSpan, keepEvents, type AwayEvent, type AwaySpan } from './away';
import { endedRows } from './finished';
import type { PrTold } from './pr-watch.svelte';
import type { Pressure, Stopped } from './pressure';
import type { SessionRow, SessionState } from './sessions';

export interface AwayHost {
  rows(): readonly SessionRow[];
  /** The pull request's CI the pill tells now (`PrWatch.told`). */
  pr(): PrTold | null;
  warning(): Pressure | null;
  stopped(): Stopped | null;
}

export class AwayWatch {
  /** The absence the card tells of, until it is dismissed. */
  pending = $state.raw<AwaySpan | null>(null);
  /** What happened, as of the last return. */
  events = $state.raw<AwayEvent[]>([]);
  /** The lines opened from the card. */
  seen = $state.raw<string[]>([]);
  #log: AwayEvent[] = [];
  #states: Map<string, SessionState> | null = null;
  #cause: string | null = null;

  constructor(private readonly host: AwayHost) {}

  /** What happened so far, kept a day. */
  get logged(): readonly AwayEvent[] {
    return this.#log;
  }

  start(): () => void {
    const stop = $effect.root(() => {
      $effect(() => {
        const rows = this.host.rows();
        untrack(() => this.#look(rows));
      });
      $effect(() => {
        const told = this.host.pr();
        if (told) untrack(() => this.#note({ kind: 'pr', at: Date.now(), threadId: told.threadId, url: told.url, text: told.text, failed: told.tone === 'failed' }));
      });
      $effect(() => {
        const warning = this.host.warning();
        // Once per cause, not on every read of its numbers.
        untrack(() => {
          const cause = warning ? `${warning.reason}:${warning.threadId ?? ''}` : null;
          if (cause === this.#cause) return;
          this.#cause = cause;
          if (warning) this.#note({ kind: 'memory', at: Date.now(), threadId: warning.threadId, title: warning.title, program: null, machine: warning.reason === 'machine' });
        });
      });
      $effect(() => {
        const stopped = this.host.stopped();
        if (stopped) untrack(() => this.#note({ kind: 'memory', at: Date.now(), threadId: stopped.threadId, title: stopped.title, program: stopped.program || strings.island.memory.process, machine: false }));
      });
    });
    return () => stop();
  }

  /** Back at the keyboard: the span to tell, joined to the card still waiting. */
  span(absence: Absence): AwaySpan {
    this.#log = keepEvents(this.#log, absence.to);
    return joinSpan(this.pending, absence);
  }

  /** The card shows for this span, with what happened as of now. */
  show(span: AwaySpan): void {
    this.events = [...this.#log];
    this.pending = span;
  }

  /** One line was opened: it leaves the card. */
  open(key: string): void {
    if (!this.seen.includes(key)) this.seen = [...this.seen, key];
  }

  /** "OK": the card is gone, and what it told. */
  dismiss(): void {
    this.pending = null;
    this.seen = [];
  }

  /** A capture's card (`pose.ts`): these events over this span. */
  pose(span: AwaySpan, events: AwayEvent[]): void {
    this.#log = events;
    this.show(span);
  }

  #note(event: AwayEvent): void {
    this.#log = [...this.#log, event];
  }

  #look(rows: readonly SessionRow[]): void {
    const before = this.#states;
    this.#states = new Map(rows.map((row) => [row.id, row.state]));
    if (!before) return;
    for (const row of endedRows(before, rows)) {
      this.#note({ kind: 'finish', at: Date.now(), threadId: row.id, title: row.title, failed: row.state === 'failed' });
    }
  }
}
