/*
 * The scheduled missions as the companion's window runs them, the only one
 * that runs all day (`missions.ts` for the rules). A reply's `[[mission: …]]`
 * waits on a card when the companion asks before acting, then is kept; once
 * kept, each run launches a thread without asking, through the same path as
 * a task (`Tasks.run`: same agent, account, model, effort and permission).
 *
 * One timeout runs, to the soonest mission, never longer than
 * `CHECK_MAX_MS`, so a computer back from sleep runs it soon after; none when
 * nothing is to run. The next occurrence is kept before a run starts, so a
 * run that fails, or the window reloading, never runs an occurrence twice.
 */
import type { Project } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { fill, strings } from '../strings';
import { repeatText } from './mission-text';
import { addMission, missionsBlock, nextAt, pauseMission, readMissions, removeMission, scheduleOf, settle, subscribeMissions, updateMission, waitFor, type Mission, type MissionDirective, type NewMission } from './missions';
import type { CompanionControl } from './prefs';
import { resolveProject, taskProjects } from './tasks';
import { unknownLine, type PendingTask } from './tasks.svelte';

/** A mission waiting for the user's word. */
export interface PendingMission extends NewMission {
  id: string;
}

export interface MissionsHost {
  client(): Client | null;
  control(): CompanionControl;
  /** The core the missions belong to (`coreKey`). */
  core(): string;
  /** Launches a run as a task (`Tasks.run`); a string says why it did not go. */
  run(entry: Omit<PendingTask, 'id'>, mission: 'on-time' | 'late'): Promise<string | null>;
  /** A line of the companion's own in the bubble. */
  say(text: string): void;
}

/** When a due mission cannot run yet (no core, the projects unread), it is tried again after this. */
const RETRY_MS = 30_000;
const SHOWN = 60;

const short = (text: string) => (text.length > SHOWN ? `${text.slice(0, SHOWN - 1)}…` : text);
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class Missions {
  /** The core's missions, the soonest first. */
  list = $state.raw<Mission[]>([]);
  pending = $state.raw<PendingMission[]>([]);
  /** The projects a mission may run in, as last read; null before. */
  known = $state.raw<ReadonlySet<string> | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private checking = false;
  private sequence = 0;
  private readonly off: () => void;

  constructor(private readonly host: MissionsHost) {
    this.off = subscribeMissions(() => this.reload());
    this.list = readMissions(host.core());
  }

  /** Reads the core's missions again, after a change here or in Settings, or another core, and arms the timer. */
  reload(retry = false): void {
    this.list = readMissions(this.host.core());
    clearTimeout(this.timer);
    const wait = waitFor(this.list, Date.now());
    this.timer = wait === null ? undefined : setTimeout(() => void this.check(), retry ? Math.max(wait, RETRY_MS) : wait);
  }

  /** The missions, numbered, as a request carries them; null when there is none. */
  block(): string | null {
    return missionsBlock(this.list, this.known ?? undefined);
  }

  /** What a reply asks: missions cancelled, paused or resumed by number, new ones checked then kept or held on a card. */
  async request(directives: MissionDirective[], now = Date.now()): Promise<void> {
    if (directives.length === 0) return;
    const core = this.host.core();
    const copy = strings.companion.mission;
    const lines: string[] = [];
    // A number names a mission as the request line listed it, before any change here.
    const listed = this.list;
    for (const directive of directives) {
      if (directive.kind === 'add') continue;
      const mission = listed[directive.index - 1];
      if (!mission) lines.push(fill(copy.noSuch, { index: String(directive.index) }));
      else if (directive.kind === 'cancel') removeMission(core, mission.id);
      else pauseMission(core, mission.id, directive.kind === 'pause', now);
    }
    const adds = directives.filter((directive) => directive.kind === 'add');
    const client = this.host.client();
    if (adds.length > 0 && !client) lines.push(strings.companion.unreachable);
    else if (adds.length > 0 && client) {
      let projects: Project[] = [];
      try {
        projects = await client.call('projects.list', {});
      } catch (error) {
        lines.push(fill(copy.failed, { reason: reasonOf(error) }));
      }
      for (const add of projects.length > 0 ? adds : []) {
        const resolved = resolveProject(add.project, projects);
        if ('near' in resolved) {
          lines.push(unknownLine(add.project, resolved.near, projects));
          continue;
        }
        const schedule = scheduleOf(add, now);
        if (!schedule) {
          lines.push(copy.past);
          continue;
        }
        const entry: NewMission = { ...schedule, projectId: resolved.project.id, project: resolved.project.name, prompt: add.prompt };
        if (this.host.control() === 'ask') this.pending = [...this.pending, { ...entry, id: `mission-${++this.sequence}` }];
        else {
          addMission(core, entry, now);
          lines.push(fill(copy.scheduled, { project: entry.project, when: repeatText(entry) }));
        }
      }
    }
    if (lines.length > 0) this.host.say(lines.join('\n'));
  }

  /** The user schedules a waiting mission; a time that passed meanwhile moves to the next occurrence, or ends a single one. */
  confirm(id: string, now = Date.now()): void {
    const entry = this.pending.find((mission) => mission.id === id);
    if (!entry) return;
    this.pending = this.pending.filter((mission) => mission.id !== id);
    const { id: _, ...mission } = entry;
    if (mission.due <= now) {
      if (mission.repeat.kind === 'once') return this.host.say(strings.companion.mission.past);
      mission.due = nextAt(mission.repeat, mission.minutes, now);
    }
    addMission(this.host.core(), mission, now);
  }

  cancel(id: string): void {
    this.pending = this.pending.filter((mission) => mission.id !== id);
  }

  /**
   * Runs what is due: the latest occurrence when it is less than
   * `LATE_MAX_MS` late, marked late past `ON_TIME_MS`; older ones are told
   * once as skipped. A mission whose project is gone does not run, and says
   * so once until the project is back.
   */
  async check(now = Date.now()): Promise<void> {
    if (this.checking) return;
    const core = this.host.core();
    const due = readMissions(core).filter((mission) => !mission.paused && mission.due <= now);
    const client = this.host.client();
    if (due.length === 0) return this.reload();
    if (!client) return this.reload(true);
    this.checking = true;
    let retry = false;
    try {
      let projects: Project[];
      try {
        projects = taskProjects(await client.call('projects.list', {}));
      } catch {
        retry = true;
        return;
      }
      this.known = new Set(projects.map((project) => project.id));
      const copy = strings.companion.mission;
      const lines: string[] = [];
      for (const mission of due) {
        const settled = settle(mission, now);
        const project = projects.find((entry) => entry.id === mission.projectId);
        // Its project gone, a mission stays listed, marked, and runs nothing until the project is back.
        if (!project) {
          updateMission(core, mission.id, { missing: true, ...(settled.due === null ? {} : { due: settled.due }) });
          if (!mission.missing) lines.push(fill(copy.gone, { project: mission.project, prompt: short(mission.prompt) }));
          continue;
        }
        if (settled.due === null) removeMission(core, mission.id);
        else updateMission(core, mission.id, { due: settled.due, missing: false, project: project.name });
        if (settled.missed > 0) lines.push(fill(copy.missed, { prompt: short(mission.prompt) }));
        if (!settled.run) continue;
        const worktree = project.repository === true && project.worktreeDefault === true;
        const problem = await this.host.run({ projectId: project.id, project: project.name, prompt: mission.prompt, worktree }, settled.run.late ? 'late' : 'on-time');
        if (problem) lines.push(problem);
      }
      if (lines.length > 0) this.host.say(lines.join('\n'));
    } finally {
      this.checking = false;
      this.reload(retry);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.off();
  }
}
