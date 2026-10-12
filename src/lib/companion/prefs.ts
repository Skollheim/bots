/*
 * The desktop companion's preferences: a client preference like the
 * experiments, kept in `localStorage` under `boite.companion` as one JSON
 * object. The main window writes them from Settings, Companion; the companion
 * window reads them and follows a change through the `storage` event, which a
 * page receives for writes made by the other pages of its origin. Both
 * webviews of the shell share the origin and the profile, so they share this.
 *
 * `agents` are the Boite agents that stand as the companion, side by side, the
 * first one leading (`crew.svelte.ts`). The brain fields are what a companion
 * agent made from here runs on; each agent then keeps its own.
 */
import { encodeRobot, parseRobot, type Robot, type RobotFamily } from '../robots';

/** Along the top of the screen, or `free`: where the user dropped the character. */
export type CompanionAnchor = 'left' | 'center' | 'right' | 'free';
/** `ask`: every action waits for Allow or Deny. `auto`: the agent acts without asking. */
export type CompanionControl = 'ask' | 'auto';
/** What the eye shows: every screen, the one the companion is on, or a part the user picks each time. */
export type CompanionScreenScope = 'all' | 'here' | 'zone';
/** Where the robots live: in the island at the top of the screen, or loose on the desktop. */
export type CompanionRobots = 'island' | 'desktop';
/** What the island's pill shows when nothing else claims it: the live line, the tightest quota, the music, the running timer, or the robot alone. */
export type PillRest = 'live' | 'quota' | 'music' | 'timer' | 'robot';
export const PILL_RESTS = ['live', 'quota', 'music', 'timer', 'robot'] as const satisfies readonly PillRest[];
/** The character's centre, in fractions of the screen's work area. */
export interface CompanionSpot { x: number; y: number }
/** The families the island's mascot may come from: Boîte, the box, or a Jelly. */
export const MASCOT_FAMILIES = ['box', 'jelly'] as const satisfies readonly RobotFamily[];
export type Mascot = Robot & { family: (typeof MASCOT_FAMILIES)[number] };

/** The shortcuts Settings offers, in the shell's notation (`platform/desktop.rs`). */
export const COMPANION_HOTKEYS = ['Alt+Shift+Space', 'Ctrl+Alt+Space', 'Ctrl+Shift+Space', 'Ctrl+Alt+B'] as const;

export interface CompanionPrefs {
  /** The screen's name as the shell lists it; null is the primary screen. */
  monitor: string | null;
  /** The island, or the robots loose on the desktop; dragging a robot out or back switches it. */
  robots: CompanionRobots;
  /** Hovering the island long enough opens its panel; off, only a click does. */
  openOnHover: boolean;
  /** What the pill shows at rest (`IslandBar.svelte`). */
  pillRest: PillRest;
  /** The island's character, the first agent's on the desktop; null is that agent's own box (Boîte by default). */
  mascot: Mascot | null;
  anchor: CompanionAnchor;
  /** Where the character was dropped, with `anchor: 'free'`. */
  spot: CompanionSpot | null;
  /** Step aside while an app fills the screen: a game, a video. */
  hideFullscreen: boolean;
  /** The shortcut that calls the companion from any app; null for none. */
  hotkey: string | null;
  /** Short chimes when an answer comes, an agent calls or a reminder rings. */
  sounds: boolean;
  /** Null lets the companion take the first agent that is on and signed in, on its small model. */
  providerId: string | null;
  accountId: string | null;
  model: string | null;
  effort: string | null;
  control: CompanionControl;
  /** React to the music playing and show its controls. */
  music: boolean;
  /** The player's synced lyrics, from LRCLIB: off until the user turns them on, since they send the track's title and artist out. */
  lyrics: boolean;
  /** A click anywhere but on the companion closes its panel. */
  closeOutside: boolean;
  /** One gauge per subscription of the proxy beside the character. */
  quotas: boolean;
  /** The gauges left out, by `HudGauge.id`; one the gateway adds later shows until hidden. */
  hiddenQuotas: string[];
  /** The pomodoro's phases, in minutes. */
  workMinutes: number;
  breakMinutes: number;
  /** Focus mode during the pomodoro's work phase. */
  focusOnWork: boolean;
  /** Minutes a thread waits on the user before the radar tells of it; 0 turns the radar off. */
  radarMinutes: number;
  screenScope: CompanionScreenScope;
  /** The agents that stand as the companion, by id, the leader first; `CREW_MAX` at most. */
  agents: string[];
  /** The first agent was made for the companion: from then on the row is the user's to change. */
  crewMade: boolean;
  /** The Boite agent the island's Chat talks to; null: the row's leader (`island/assistant.svelte.ts`). */
  assistantAgent: string | null;
}

export const COMPANION_STORAGE_KEY = 'bots.prefs';

export const DEFAULT_COMPANION_PREFS: CompanionPrefs = {
  monitor: null,
  robots: 'island',
  openOnHover: true,
  pillRest: 'live',
  mascot: null,
  anchor: 'center',
  spot: null,
  hideFullscreen: true,
  hotkey: COMPANION_HOTKEYS[0],
  sounds: true,
  providerId: null,
  accountId: null,
  model: null,
  effort: null,
  control: 'ask',
  music: true,
  lyrics: false,
  closeOutside: true,
  quotas: true,
  hiddenQuotas: [],
  workMinutes: 25,
  breakMinutes: 5,
  focusOnWork: true,
  radarMinutes: 10,
  screenScope: 'all',
  agents: [],
  crewMade: false,
  assistantAgent: null
};

/** How many agents stand side by side: the window is 440 px wide. */
export const CREW_MAX = 4;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const fraction = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null);

/** Whole minutes from 1 to max; anything else takes the default. */
const minutes = (value: unknown, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;

function spotOf(value: unknown): CompanionSpot | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as Record<string, unknown>;
  const [left, top] = [fraction(x), fraction(y)];
  return left === null || top === null ? null : { x: left, y: top };
}

/** A box or a jelly, each part in its range; anything else is no mascot. */
function mascotOf(value: unknown): Mascot | null {
  if (!value || typeof value !== 'object') return null;
  const { family, shape, color, eyes, top } = value as Record<string, unknown>;
  if (family !== 'box' && family !== 'jelly') return null;
  const parts = [shape, color, eyes, top];
  if (!parts.every((part) => typeof part === 'number' && Number.isInteger(part) && part >= 0)) return null;
  const robot = parseRobot(encodeRobot({ family, shape, color, eyes, top } as Robot));
  return robot as Mascot | null;
}

/** Whatever is stored, read field by field: a missing or wrong field takes its default. */
export function parseCompanionPrefs(raw: unknown): CompanionPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const spot = spotOf(value.spot);
  return {
    monitor: text(value.monitor),
    robots: value.robots === 'desktop' ? 'desktop' : 'island',
    openOnHover: value.openOnHover !== false,
    pillRest: (PILL_RESTS as readonly unknown[]).includes(value.pillRest) ? (value.pillRest as PillRest) : 'live',
    mascot: mascotOf(value.mascot),
    // A free place needs the spot it was dropped on.
    anchor: value.anchor === 'left' || value.anchor === 'right' || (value.anchor === 'free' && spot) ? value.anchor : 'center',
    spot,
    hideFullscreen: value.hideFullscreen !== false,
    hotkey: value.hotkey === null ? null : (text(value.hotkey) ?? DEFAULT_COMPANION_PREFS.hotkey),
    sounds: value.sounds !== false,
    providerId: text(value.providerId),
    accountId: text(value.accountId),
    model: text(value.model),
    effort: text(value.effort),
    control: value.control === 'auto' ? 'auto' : 'ask',
    music: value.music !== false,
    lyrics: value.lyrics === true,
    closeOutside: value.closeOutside !== false,
    quotas: value.quotas !== false,
    hiddenQuotas: Array.isArray(value.hiddenQuotas) ? [...new Set(value.hiddenQuotas.filter((id): id is string => typeof id === 'string' && id !== ''))] : [],
    workMinutes: minutes(value.workMinutes, 180, DEFAULT_COMPANION_PREFS.workMinutes),
    breakMinutes: minutes(value.breakMinutes, 60, DEFAULT_COMPANION_PREFS.breakMinutes),
    focusOnWork: value.focusOnWork !== false,
    radarMinutes: value.radarMinutes === 0 ? 0 : minutes(value.radarMinutes, 240, DEFAULT_COMPANION_PREFS.radarMinutes),
    screenScope: value.screenScope === 'here' || value.screenScope === 'zone' ? value.screenScope : 'all',
    agents: Array.isArray(value.agents) ? [...new Set(value.agents.filter((id): id is string => typeof id === 'string' && id !== ''))].slice(0, CREW_MAX) : [],
    crewMade: value.crewMade === true,
    assistantAgent: text(value.assistantAgent)
  };
}

export function readCompanionPrefs(): CompanionPrefs {
  try {
    const raw = window.localStorage.getItem(COMPANION_STORAGE_KEY);
    return parseCompanionPrefs(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COMPANION_PREFS };
  }
}

type Listener = (prefs: CompanionPrefs) => void;
const listeners = new Set<Listener>();

/** Merges `patch`, stores and tells this page. The brain changing keeps the conversation: `talk.svelte.ts` moves it over. */
export function writeCompanionPrefs(patch: Partial<CompanionPrefs>): CompanionPrefs {
  const next = parseCompanionPrefs({ ...readCompanionPrefs(), ...patch });
  try {
    window.localStorage.setItem(COMPANION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* a refused storage still runs for this session */
  }
  for (const listener of listeners) listener(next);
  return next;
}

/** Runs on a write from this page or from the other window. Returns the function that stops it. */
export function subscribeCompanionPrefs(listener: Listener): () => void {
  const fromOtherPage = (event: StorageEvent) => {
    if (event.key === COMPANION_STORAGE_KEY) listener(readCompanionPrefs());
  };
  listeners.add(listener);
  window.addEventListener('storage', fromOtherPage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherPage);
  };
}
