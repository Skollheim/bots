/*
 * The companion's state and what it does, apart from how it is drawn: what
 * the core reports (threads, requests, the agents standing as companions and
 * their conversations), the timer and the focus, the reminders, the tasks,
 * the radar and the search, the senses the shell gives, and the actions the
 * user takes. The companion's window (`App.svelte`) makes one and draws it as
 * the island (`components/island/`) or loose on the desktop
 * (`components/desktop/`), so both draw the same companion.
 *
 * Each character is a Boite agent (`crew.svelte.ts`), talked to in its own
 * conversation of the Agents page (`talk.svelte.ts`), so it runs the way every
 * agent runs, through the core's accounts and subscription proxy.
 *
 * Runes in a class: `start()` sets up what follows the state (`$effect.root`),
 * the connection and the timers, and returns what stops them.
 */
import { tick, untrack } from 'svelte';
import type { PermissionRequest, QuestionRequest, ThreadSummary } from '@boite/contracts';
import { WsClient, type Client, type ClientState } from '@boite/ui/lib/client';
import { GatewayReader } from '@boite/ui/lib/quota-reader.svelte';
import { fill, strings } from '../strings';
import { waitForCore, watchEndpoint } from '../connection';
import { useReveal } from '../reveal';
import type { Robot } from '../robots';
import { readCompanionPrefs, subscribeCompanionPrefs, writeCompanionPrefs, type CompanionPrefs } from './prefs';
import { createMoodTracker, RESTING, type MoodInput, type MoodState } from './mood';
import { readMedia, pressMedia, type MediaAction, type MediaState } from './media';
import { addReminder } from './memory';
import { captureScreens, type ScreenShot } from './screen';
import { playCue, unlockSounds, type Cue } from './sounds';
import { companionMonitors, dragCompanion, focusCompanion, inShell, showMain } from './shell';
import { Talk } from './talk.svelte';
import { Crew } from './crew.svelte';
import { sessionThreadOf, skinOf } from './crew';
import { taskProjects } from './tasks';
import { Notes } from './notes.svelte';
import { Senses } from './senses.svelte';
import { followQuotas, hudGauges, hudThreads, shownGauges } from './hud';
import { audible, Focus, PomodoroTimer } from './focus.svelte';
import type { Directives } from './directives';
import { Reactions } from './reactions.svelte';
import { Dropped, joinScreen } from './drop.svelte';
import { Tasks } from './tasks.svelte';
import { digestFor, Finder, Radar, replyInThread, ThreadReader } from './watch.svelte';
import { fold, type WatchInput } from './watch';

const CELEBRATE_MS = 6000;
const REFRESH_EVERY = 15_000;
const MEDIA_EVERY = 2000;
/** How far the pointer goes on a character before a press becomes a drag. */
const DRAG_FROM = 4;
/** Pokes this close together leave a character dizzy. */
const DIZZY_POKES = 4;
const DIZZY_WITHIN = 2000;
const DIZZY_MS = 2400;

/** One character standing as the companion: an agent, or the lone one before any. */
export interface Member {
  id: string;
  name: string | null;
  skin: Robot | null;
  talk: Talk;
}

/** A request the panel answers. */
export type RequestAction =
  | { kind: 'allow'; request: PermissionRequest }
  | { kind: 'deny'; request: PermissionRequest }
  | { kind: 'answer'; question: QuestionRequest; optionIds: string[]; text?: string }
  | { kind: 'skip'; question: QuestionRequest };

/** What the window that draws the companion does for it. */
export interface CompanionHost {
  /** The user picks a part of a screen to show (`CompanionZone`). */
  pickZone(): Promise<ScreenShot | null | 'cancelled'>;
  /** The question field takes the keyboard. */
  focusInput(): void;
  /** The shortcut was pressed. */
  summoned?(): void;
}

export class Companion {
  prefs = $state<CompanionPrefs>(readCompanionPrefs());
  threads = $state.raw<ThreadSummary[]>([]);
  projects = $state.raw(new Map<string, string>());
  /** The projects a task may go to, by name, for the agents' role; null until read. */
  projectNames = $state.raw<string[] | null>(null);
  permissions = $state.raw<PermissionRequest[]>([]);
  questions = $state.raw<QuestionRequest[]>([]);
  mood = $state<MoodState>(RESTING);
  media = $state<MediaState | null>(null);
  /** The pointer is on a character, as the page sees it (outside the shell). */
  pointerOn = $state(false);
  /** The panel is open: the island's open size, the sheet under a loose robot. */
  open = $state(false);
  boings = $state<Record<string, number>>({});
  /** The characters poked too often, too fast. */
  dizzy = $state<Record<string, boolean>>({});
  draft = $state('');
  sending = $state(false);
  dragging = $state(false);
  screens = $state(1);
  /** The core, once found; the fake one in the demo. */
  client = $state.raw<Client | null>(null);
  reachable = $state(true);
  /** The client answered once: what reads the quotas waits for. */
  connected = $state(false);
  /** No core found yet: Boite is not running. */
  waiting = $state(false);
  /** A short sentence beside the characters: a reveal that failed, the demo mode. */
  notice = $state<string | null>(null);
  history = $state(false);
  /** The character the panel talks to. */
  activeId = $state('');
  /** A screen taken ahead of the question (the Drop view), sent with the next one. */
  shot = $state.raw<ScreenShot | null>(null);
  /** Bumped when an answer comes or a thread finishes: the happy jump and the green peek. */
  done = $state(0);
  /** The panel opened by itself on a request: it closes once nothing waits. */
  autoOpened = false;

  readonly quotas = new GatewayReader();
  readonly gauges = $derived(this.prefs.quotas ? shownGauges(hudGauges(this.quotas.state), this.prefs.hiddenQuotas) : []);
  readonly attached = new Dropped();

  private disposed = false;
  private seen: Set<string> | null = null;
  /** The threads were read once: the radar waits for it. */
  private loaded = false;
  private readonly tracker = createMoodTracker({ celebrateMs: CELEBRATE_MS });
  /** What the other threads last said, for the digest each request carries and for the search. */
  private readonly reader = new ThreadReader(() => this.client);
  private readonly talkCache = new Map<string, Talk>();
  /** The agent whose fresh reply set a task: what the tasks say goes to its bubble. */
  private answerer: string | null = null;
  private press: { x: number; y: number; island: boolean } | null = null;
  /** A drag just ended: the click it makes is not a click. */
  dropped = false;
  private pokes: Record<string, number[]> = {};
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private celebrateTimer: ReturnType<typeof setTimeout> | undefined;

  readonly timer: PomodoroTimer;
  readonly focus: Focus;
  readonly crew: Crew;
  readonly tasks: Tasks;
  readonly finder: Finder;
  readonly radar: Radar;
  readonly reactions: Reactions;
  readonly notes: Notes;
  readonly senses: Senses;

  // With no agent yet, a lone character stands, and says so when asked. The
  // first one wears the mascot chosen in Settings, else its own box.
  readonly members = $derived.by<Member[]>(() =>
    this.crew.members.length > 0
      ? this.crew.members.map((agent, index) => ({ id: agent.id, name: agent.name, skin: (index === 0 && this.prefs.mascot) || skinOf(agent), talk: this.talkOf(agent.id) }))
      : [{ id: '', name: null, skin: this.prefs.mascot, talk: this.talkOf(null) }]
  );
  readonly talks = $derived(this.members.map((member) => member.talk));
  readonly active = $derived(this.members.find((member) => member.id === this.activeId) ?? this.members[0]!);
  readonly thinking = $derived(this.talks.some((talk) => talk.thinking));
  /** A reply is on its way: the island glows as the assistant talks. */
  readonly talking = $derived(this.talks.some((talk) => talk.phase === 'thinking' || talk.phase === 'streaming'));
  /** The agents' own conversations, which the quotas and the notices leave out. */
  readonly ownThreads = $derived.by(() => this.crew.members.flatMap((agent) => sessionThreadOf(this.crew.snapshot, agent.id) ?? []));
  /** The other threads at work, newest first. */
  readonly busy = $derived(hudThreads(this.threads, this.projects, this.ownThreads));
  /** Permissions and the questions that stop an agent. */
  readonly blocking = $derived(this.permissions.length + this.questions.filter((question) => !question.async).length);

  // In the shell the pointer is heard from its watch, since the window stops
  // taking it outside the areas; in a browser the page sees it.
  readonly hover = $derived.by(() => (inShell() ? this.senses.hover : this.pointerOn));
  readonly asleep = $derived.by(
    () =>
      this.senses.asleep && !this.open && !this.thinking && !this.dragging && this.mood.mood === 'idle' && this.notes.alarms.length === 0 && !this.radar.shown && !this.media?.playing
  );
  /** What every character shows alike (`CrewLook`). */
  readonly look = $derived.by(() => ({
    music: this.media?.playing ?? false,
    hover: this.hover || this.dragging,
    asleep: this.asleep,
    typing: this.senses.typing,
    calm: this.focus.active,
    rest: this.timer.phase === 'break',
    game: this.reactions.game,
    coffee: this.reactions.coffee,
    startled: this.attached.over
  }));

  constructor(private readonly host: CompanionHost) {
    // A pomodoro's phase chimes; a countdown rings as an alarm until it is
    // dismissed, like a reminder; a stopwatch at its limit just stops.
    this.timer = new PomodoroTimer({
      ended: (_, ran) => {
        if (ran.kind === 'pomodoro') this.cue('phase');
        else if (ran.kind === 'countdown') addReminder(ran.label ? fill(strings.companion.pomodoro.doneFor, { label: ran.label }) : strings.companion.pomodoro.done, Date.now());
      }
    });
    this.focus = new Focus({ auto: () => this.prefs.focusOnWork && this.timer.working });
    this.crew = new Crew({
      client: () => this.client,
      prefs: () => this.prefs,
      projects: () => this.projectNames,
      waiting: () => this.talks.some((talk) => talk.waiting),
      answered: (agentId, message, directives, fresh) => {
        this.talkCache.get(agentId)?.answered(message);
        if (!fresh) return;
        this.answerer = agentId;
        this.obey(directives);
      },
      loaded: () => this.talks.forEach((talk) => talk.follow())
    });
    this.tasks = new Tasks({
      client: () => this.client,
      control: () => this.prefs.control,
      created: (thread) => this.acceptThread(thread),
      say: (text) => this.speaker().aside(text)
    });
    this.finder = new Finder({ client: () => this.client, reader: this.reader, own: () => this.ownThreads, projects: () => this.projects, opened: (threadId) => void showMain(threadId) });
    // The threads that have waited on the user a while; in focus, only those that stop an agent.
    this.radar = new Radar({
      input: () => (this.loaded && this.reachable ? this.watchInput() : null),
      minutes: () => this.prefs.radarMinutes,
      quiet: () => this.focus.active,
      rang: () => {
        this.senses.wake();
        this.cue('call');
      }
    });
    this.reactions = new Reactions({ quiet: () => this.focus.active });
    this.notes = new Notes({
      client: () => this.client,
      threads: () => this.threads,
      ownThreads: () => this.ownThreads,
      holding: () => this.hover || this.open,
      rang: () => {
        this.senses.wake();
        this.cue('remind');
      },
      setAside: (notice) => {
        if (!this.focus.active) return false;
        this.focus.keep({ threadId: notice.threadId, title: notice.title, failed: notice.failed });
        return true;
      },
      answered: (text) => this.reactions.answered(text)
    });
    this.senses = new Senses({
      hover: () => this.talks.forEach((talk) => talk.hold()),
      outside: () => {
        if (this.prefs.closeOutside && this.open) this.close();
      },
      summon: () => this.summon(),
      input: (at) => this.reactions.sign(at)
    });
  }

  private watchInput = (): WatchInput => ({ threads: this.threads, permissions: this.permissions, questions: this.questions, projects: this.projects, own: this.ownThreads });

  // In focus, only an agent that needs the user, a reminder and the pomodoro ring.
  cue(name: Cue): void {
    if (this.prefs.sounds && audible(name, this.focus.active)) playCue(name);
  }

  private talkOf(agentId: string | null): Talk {
    const key = agentId ?? '';
    let talk = this.talkCache.get(key);
    if (!talk) {
      talk = new Talk(agentId, {
        client: () => this.client,
        snapshot: () => this.crew.snapshot,
        hovering: () => this.hover,
        digest: () => digestFor(this.reader, this.watchInput()),
        missing: () => {
          this.crew.retry();
          return this.crew.problem ?? strings.companion.noAgent;
        },
        settled: (outcome) => {
          this.cue(outcome === 'done' ? 'done' : 'error');
          if (outcome === 'done') this.done += 1;
        }
      });
      this.talkCache.set(key, talk);
    }
    return talk;
  }

  /** The conversation what a task says goes to: the agent that set it, else the active one. */
  private speaker(): Talk {
    return this.talkCache.get(this.answerer ?? '') ?? this.active.talk;
  }

  // ---------------------------------------------------------------------
  // What a reply asks for
  // ---------------------------------------------------------------------

  /** A work phase starts: an earlier "focus off" gives way to the pomodoro again. */
  startTimer(workMs = this.prefs.workMinutes * 60_000, label = ''): void {
    this.focus.release();
    this.timer.start({ workMs, breakMs: this.prefs.breakMinutes * 60_000, label });
  }

  /** The timer, the focus and the threads a reply asks for ([[timer: …]], [[pomodoro: …]], [[focus: …]], [[task: …]], [[find: …]], [[open: …]]). */
  private obey({ timer: asked, focus: on, task, find, open: wanted }: Directives): void {
    if (task.length > 0) void this.tasks.request(task);
    if (find) void this.finder.find(find);
    if (wanted) this.openThread(wanted);
    if (asked === 'stop') this.timer.stop();
    else if (asked?.kind === 'pomodoro') this.startTimer(asked.ms ?? undefined, asked.label);
    else if (asked?.kind === 'countdown' && asked.ms !== null) this.timer.countdown(asked.ms, asked.label);
    else if (asked?.kind === 'stopwatch') this.timer.stopwatch(asked.label);
    if (on !== null) this.focus.set(on);
  }

  /** `[[open: …]]`: a thread the agent knows of, by its id or else by its title. */
  private openThread(target: string): void {
    const known = [...this.threads, ...(this.finder.found ?? []).map((match) => match.thread)];
    const thread = known.find((entry) => entry.id === target) ?? known.find((entry) => entry.title !== '' && fold(entry.title) === fold(target));
    if (thread) void showMain(thread.id);
    else this.speaker().aside(strings.companion.openMissing);
  }

  async replyFromRadar(threadId: string, text: string): Promise<boolean> {
    if (!this.client) return false;
    await replyInThread(this.client, threadId, text);
    this.soon(0);
    return true;
  }

  // ---------------------------------------------------------------------
  // What the core reports
  // ---------------------------------------------------------------------

  private recompute(): void {
    const state: MoodInput | null = this.reachable ? { threads: this.threads, permissions: this.permissions, questions: this.questions } : null;
    this.mood = this.tracker.update(state);
    this.radar.update();
  }

  /** Opens the panel when an agent stops on something new; closes it once nothing waits. */
  private followRequests(): void {
    const blocking = new Set([...this.permissions.map((request) => request.id), ...this.questions.filter((question) => !question.async).map((question) => question.id)]);
    if (this.seen !== null && [...blocking].some((id) => !this.seen!.has(id))) {
      if (!this.open) this.autoOpened = true;
      this.open = true;
      this.history = false;
      this.cue('call');
    }
    if (blocking.size === 0 && this.autoOpened && this.draft === '') {
      this.open = false;
      this.autoOpened = false;
    }
    this.seen = blocking;
  }

  private async readProjects(): Promise<void> {
    if (!this.client) return;
    const list = await this.client.call('projects.list', {});
    this.projects = new Map(list.map((project) => [project.id, project.name]));
    this.projectNames = taskProjects(list).map((project) => project.name);
  }

  private async refresh(): Promise<void> {
    const client = this.client;
    if (!client || this.disposed) return;
    try {
      const [threadList, permissionList, questionList] = await Promise.all([client.call('threads.list', {}), client.call('permissions.list', {}), client.call('questions.list', {})]);
      if (this.disposed) return;
      this.threads = threadList;
      this.permissions = permissionList;
      this.questions = questionList;
      this.reachable = true;
      this.loaded = true;
      if (threadList.some((thread) => thread.projectId && !this.projects.has(thread.projectId))) await this.readProjects();
      this.followRequests();
    } catch {
      this.reachable = false;
    }
    this.recompute();
  }

  private soon(delay = 250): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), delay);
  }

  /** A thread that changed: its status counts at once, the requests are read again a moment later. */
  private acceptThread = (thread: ThreadSummary): void => {
    this.threads = this.threads.some((entry) => entry.id === thread.id) ? this.threads.map((entry) => (entry.id === thread.id ? thread : entry)) : [...this.threads, thread];
    this.recompute();
    this.soon();
  };

  // ---------------------------------------------------------------------
  // Asking
  // ---------------------------------------------------------------------

  /** Takes a screen ahead of the question: the screens in reach, or a part the user picks. */
  async capture(zone: boolean): Promise<boolean> {
    const picked = zone ? await this.host.pickZone().catch(() => null) : await captureScreens(this.prefs.screenScope === 'zone' ? 'here' : this.prefs.screenScope).catch(() => null);
    if (picked === 'cancelled') return false;
    if (!picked) {
      this.active.talk.fail(strings.companion.screenFailed);
      return false;
    }
    this.shot = picked;
    return true;
  }

  async ask(withScreen: boolean): Promise<void> {
    const request = this.draft.trim();
    const talk = this.active.talk;
    if (!request || this.sending || talk.thinking) return;
    this.sending = true;
    try {
      let shot: ScreenShot | null = this.shot;
      if (withScreen && !shot) {
        if (this.prefs.screenScope === 'zone') {
          const picked = await this.host.pickZone().catch(() => null);
          // Cancelled: the request waits in the field.
          if (picked === 'cancelled') return void this.host.focusInput();
          shot = picked;
        } else shot = await captureScreens(this.prefs.screenScope).catch(() => null);
        if (!shot) return talk.fail(strings.companion.screenFailed);
      }
      const files = this.attached.held;
      const together = joinScreen(files, shot);
      if (typeof together === 'string') return talk.fail(together);
      this.draft = '';
      this.shot = null;
      this.attached.clear();
      // A request that could not go comes back to the field with its files, to try again.
      if (!(await talk.ask(request, shot, files)) && this.draft === '') {
        this.draft = request;
        if (this.attached.held.length === 0) this.attached.held = files;
      }
    } finally {
      this.sending = false;
    }
  }

  // ---------------------------------------------------------------------
  // The panel and the characters
  // ---------------------------------------------------------------------

  async act(action: RequestAction): Promise<void> {
    const client = this.client;
    if (!client) return;
    if (action.kind === 'allow' || action.kind === 'deny') {
      await client.call('permissions.answer', { requestId: action.request.id, decision: action.kind });
    } else if (action.kind === 'answer') {
      const { question, optionIds, text } = action;
      await client.call('questions.answer', { threadId: question.threadId, questionId: question.id, optionIds, ...(text ? { text } : {}) });
    } else {
      await client.call('questions.skip', { threadId: action.question.threadId, questionId: action.question.id });
    }
    this.settled(action.kind === 'allow' || action.kind === 'deny' ? action.request.id : action.question.id);
  }

  /** A request answered here or elsewhere leaves the lists at once; the core is read again right after. */
  private settled(id: string): void {
    if (this.permissions.some((request) => request.id === id)) this.permissions = this.permissions.filter((request) => request.id !== id);
    if (this.questions.some((question) => question.id === id)) this.questions = this.questions.filter((question) => question.id !== id);
    this.recompute();
    this.soon(0);
  }

  close(): void {
    this.open = false;
    this.autoOpened = false;
  }

  /** Opens the panel, as the user asked: it no longer closes by itself. */
  show(): void {
    this.open = true;
    this.autoOpened = false;
  }

  async focusInput(): Promise<void> {
    await tick();
    this.host.focusInput();
  }

  async toggle(): Promise<void> {
    this.bounce();
    this.open = !this.open;
    this.autoOpened = false;
    if (this.open) await this.focusInput();
  }

  /** A character hops: on a click, on files dropped, when summoned. */
  bounce(id = this.active.id): void {
    this.boings = { ...this.boings, [id]: (this.boings[id] ?? 0) + 1 };
  }

  /** A click on a character: it hops, and poked again and again, it gets dizzy for a moment. */
  poke(id = this.active.id): void {
    this.bounce(id);
    const now = Date.now();
    const recent = [...(this.pokes[id] ?? []).filter((at) => now - at < DIZZY_WITHIN), now];
    this.pokes[id] = recent;
    if (recent.length < DIZZY_POKES || this.dizzy[id]) return;
    this.pokes[id] = [];
    this.dizzy = { ...this.dizzy, [id]: true };
    setTimeout(() => (this.dizzy = { ...this.dizzy, [id]: false }), DIZZY_MS);
  }

  /**
   * A click on a character: it opens or closes the panel; with the panel
   * open, a click on another character turns the panel to it instead.
   */
  pick(id: string): void {
    this.press = null;
    if (this.dropped) return;
    if (this.open && id !== this.active.id) {
      this.activeId = id;
      this.bounce(id);
      this.history = false;
      void this.focusInput();
      return;
    }
    this.activeId = id;
    this.poke(id);
    this.open = !this.open;
    this.autoOpened = false;
    if (this.open) void this.focusInput();
  }

  /** Files dropped on the companion: the panel opens on them, ready to type the question. */
  dropFiles(event: DragEvent): boolean {
    const reading = this.attached.drop(event);
    if (!reading) return false;
    this.bounce();
    this.show();
    this.history = false;
    if (inShell()) void focusCompanion().catch(() => {});
    void this.focusInput();
    return true;
  }

  /** The shortcut: the companion comes forward, ready to type. */
  summon(): void {
    this.bounce();
    this.show();
    this.cue('open');
    this.host.summoned?.();
    void this.focusInput();
  }

  // A press on a character that moves is a drag: the shell carries the
  // window and says where it was dropped; the click after it is not a click.
  // From the island, the drag sets the robot loose on the desktop.
  onpress = (event: PointerEvent, island = false): void => {
    unlockSounds();
    this.press = event.button === 0 && inShell() ? { x: event.screenX, y: event.screenY, island } : null;
  };

  onmove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || Math.hypot(event.screenX - press.x, event.screenY - press.y) < DRAG_FROM) return;
    this.press = null;
    void this.drag(press.island);
  };

  onrelease = (): void => {
    this.press = null;
  };

  private async drag(fromIsland: boolean): Promise<void> {
    this.dragging = true;
    this.dropped = true;
    try {
      if (fromIsland) {
        this.close();
        this.prefs = writeCompanionPrefs({ robots: 'desktop' });
      }
      const place = await dragCompanion(fromIsland);
      // Dropped against the top edge, the robot goes back into the island of that screen.
      if (place?.docked) this.prefs = writeCompanionPrefs({ robots: 'island', monitor: place.monitor });
      else if (place) this.prefs = writeCompanionPrefs({ robots: 'desktop', monitor: place.monitor, anchor: 'free', spot: place.spot });
    } catch {
      /* the window stays where it was */
    } finally {
      this.dragging = false;
      setTimeout(() => (this.dropped = false), 300);
    }
  }

  /** "Back to the island", from a loose robot's sheet. */
  dock(): void {
    this.close();
    this.prefs = writeCompanionPrefs({ robots: 'island' });
  }

  pressMediaKey(action: MediaAction): void {
    void pressMedia(action)
      .then(readMedia)
      .then((state) => (this.media = state))
      .catch(() => {});
  }

  // ---------------------------------------------------------------------
  // Starting and stopping
  // ---------------------------------------------------------------------

  /** Connects, follows the state, and starts the timers; returns what stops all of it. */
  start(): () => void {
    const off: (() => void)[] = [this.follow()];
    off.push(
      subscribeCompanionPrefs((next) => {
        const crewChanged = next.agents.join() !== this.prefs.agents.join();
        this.prefs = next;
        if (crewChanged) void this.crew.load();
      })
    );
    const unreachable = () => {
      this.reachable = false;
      this.recompute();
    };
    /** What the first connection starts, once: the core may answer only after a retry, when the window opened before it. */
    let started = false;
    const begin = async () => {
      if (started || this.disposed) return;
      started = true;
      this.connected = true;
      await this.readProjects().catch(() => {});
      await this.refresh();
      await this.crew.load();
    };
    // The fake core (`bun run dev`, `?fake=1`, `BOTS_DEMO=1`) is in the dev bundle only.
    const fake = import.meta.env.DEV && new URLSearchParams(location.search).get('fake') === '1';
    const initialize = async () => {
      let client: Client;
      if (fake) {
        const { FakeClient } = await import('../fake-client');
        client = new FakeClient({ hudDemo: true, sessionsDemo: true });
        this.notice = strings.bots.demo;
      } else {
        const endpoint = await waitForCore(() => this.disposed, () => (this.waiting = true));
        if (!endpoint) return;
        this.waiting = false;
        const ws = new WsClient({ url: endpoint.url, token: endpoint.token, clientName: 'shell' });
        client = ws;
        off.push(watchEndpoint(endpoint, () => ws.state === 'ready', () => location.reload()));
        off.push(
          ws.onState((state: ClientState) => {
            this.reachable = state === 'ready';
            this.recompute();
            if (state !== 'ready') return;
            if (!started) return void begin().catch(unreachable);
            this.crew.resubscribe();
            this.soon(0);
          })
        );
      }
      this.client = client;
      useReveal(client, (message) => (this.notice = message));
      if (this.disposed) return client.close();
      // Heard before the first connection, which a retry may make in its place.
      off.push(client.on('thread.updated', this.acceptThread));
      off.push(client.on('thread.created', this.acceptThread));
      off.push(client.on('thread.removed', () => this.soon()));
      off.push(client.on('permission.requested', () => this.soon(0)));
      off.push(client.on('permission.resolved', ({ requestId }) => this.settled(requestId)));
      off.push(client.on('question.asked', () => this.soon(0)));
      off.push(client.on('question.answered', ({ questionId }) => this.settled(questionId)));
      off.push(client.on('message.started', (message) => this.talks.forEach((talk) => talk.started(message))));
      off.push(client.on('message.delta', (delta) => this.talks.forEach((talk) => talk.delta(delta))));
      off.push(client.on('message.part', (part) => this.talks.forEach((talk) => talk.part(part))));
      off.push(client.on('agents.changed', () => this.crew.changed()));
      off.push(client.on('accounts.updated', () => this.crew.retry()));
      off.push(client.on('providers.updated', () => this.crew.retry()));
      await client.connect();
      if (this.disposed) return client.close();
      await begin();
      if (fake) await this.demo();
    };
    void initialize().catch(unreachable);
    const refresher = setInterval(() => void this.refresh(), REFRESH_EVERY);
    return () => {
      this.disposed = true;
      clearInterval(refresher);
      clearTimeout(this.refreshTimer);
      clearTimeout(this.celebrateTimer);
      this.crew.dispose();
      this.talkCache.forEach((talk) => talk.dispose());
      this.notes.dispose();
      this.radar.dispose();
      this.finder.clear();
      this.timer.dispose();
      this.senses.dispose();
      this.reactions.dispose();
      this.attached.dispose();
      off.forEach((stop) => stop());
      this.client?.close();
    };
  }

  /** The demo opens on an exchange: the lead is asked something, and answers. */
  private async demo(): Promise<void> {
    // The fake core's first agent is made once its projects are read: the question waits for it.
    for (let tried = 0; tried < 50 && !this.disposed && this.crew.members.length === 0; tried++) await new Promise((resolve) => setTimeout(resolve, 100));
    if (this.disposed || this.crew.members.length === 0 || this.active.talk.phase !== 'none') return;
    this.draft = strings.bots.demoQuestion;
    await this.ask(false);
  }

  /** What follows the state: the focus's recap, a finished thread, the quotas, the screens, the music. */
  private follow(): () => void {
    return $effect.root(() => {
      // The focus ended: what it set aside goes to one card.
      $effect(() => {
        if (!this.focus.active) untrack(() => this.focus.follow());
      });

      $effect(() => {
        const finished = this.mood.justFinished;
        if (finished.length === 0) return;
        untrack(() => {
          this.notes.finished(finished);
          this.tasks.finished(finished);
          this.done += 1;
        });
        clearTimeout(this.celebrateTimer);
        this.celebrateTimer = setTimeout(() => this.recompute(), CELEBRATE_MS + 100);
      });

      // The proxy's quotas, read now, every minute and on each update, while shown.
      $effect(() => {
        const client = this.client;
        if (!this.prefs.quotas || !this.connected || !client) return;
        return followQuotas(client, this.quotas);
      });

      // How many screens there are, for the choice of what the companion sees.
      $effect(() => {
        if (!this.open || !inShell()) return;
        void companionMonitors()
          .then((list) => (this.screens = list.length))
          .catch(() => {});
      });

      $effect(() => {
        if (!this.prefs.music) {
          this.media = null;
          return;
        }
        const read = () => void readMedia().then((state) => (this.media = state)).catch(() => (this.media = null));
        read();
        const timer = setInterval(read, MEDIA_EVERY);
        return () => clearInterval(timer);
      });
    });
  }
}
