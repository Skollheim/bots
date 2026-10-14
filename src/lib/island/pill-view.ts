/*
 * What the collapsed pill says, one thing at a time, in this order:
 *
 * 1. Someone waits on the user (a permission, a question): amber, the thread
 *    that asks ("Atlas attend votre réponse"), or how many wait.
 * 2. Something was just told: a thread ended, a pull request's CI settled
 *    (green, red when it failed), or a rule answered a request (its shield).
 * 3. What Settings shows at rest instead of the agents: the quota, the music,
 *    the timer (`pill-rest.ts`), or the robot alone.
 * 4. Agents at work: how many ("3 au travail"), or the one followed from Home
 *    or picked with the wheel, with a task list's progress when one has it.
 * 5. Nothing: the robot alone, small and quiet.
 *
 * The words never stop mid-word: long titles are cut on a word (`fitWords`).
 * The per-thread detail (each thread's state, its step) is the hover's
 * (`IslandBar.svelte`). Pure, so the order is tested without the island.
 */
import { fill, strings } from '../strings';
import type { RestLine } from './pill-rest';

export type PillState = 'waiting' | 'told' | 'rest' | 'working' | 'idle';
/** The words' colour: amber only while someone waits on the user. */
export type PillTone = 'attention' | 'done' | 'failed' | 'plain';
/** The mark before the words, tinted on its own (`glyphTone`). */
export type PillGlyph = 'rule' | 'quota' | 'music' | 'timer' | null;

export interface PillView {
  state: PillState;
  tone: PillTone;
  glyph: PillGlyph;
  /** The mark's tint: the quota's level, the timer's phase. */
  glyphTone: RestLine['tone'];
  /** The words, the part set in bold apart: `before`, `strong`, `after`. */
  before: string;
  strong: string;
  after: string;
  /** A short count at the right: the task list's ("2/5") or the requests' ("1 sur 2"). */
  meta: string | null;
  /** The hairline under the words, 0 to 1; null for none. */
  progress: number | null;
  /** A timer stopped for now. */
  paused: boolean;
}

export interface PillFacts {
  /** Requests that stop an agent, and the title of the thread the first one comes from (null when unknown). */
  waiting: { count: number; from: string | null };
  /** A thread that ended or a pull request's CI, while the island flashes for it. */
  told: { text: string; tone: 'done' | 'failed' } | null;
  /** What a rule just allowed, said in full. */
  rule: string | null;
  /** The quota, the music or the timer, when Settings shows one at rest and it has something to show. */
  rest: RestLine | null;
  /** Settings shows the robot alone at rest. */
  robot: boolean;
  /** The thread followed from Home or picked with the wheel: its own line (`sessionLine`). */
  focus: RestLine | null;
  /** The conversations at work, and the first one's name for when it is alone. */
  working: { count: number; first: string | null };
  /** The task list the pill follows: the focused thread's, else the first at work that keeps one. */
  goal: { done: number; total: number } | null;
}

/** The longest title the pill names before cutting it on a word. */
export const TITLE_MAX = 28;
/** The longest told line. */
export const TOLD_MAX = 48;

/** `text` in at most `max` characters, cut after a whole word with an ellipsis; a lone word too long is cut in it, as a last resort. */
export function fitWords(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max);
  const space = room.lastIndexOf(' ');
  const kept = space > 0 ? room.slice(0, space) : room.slice(0, max - 1);
  return `${kept.replace(/[\s·:;,.–-]+$/, '')}…`;
}

/** A template's words around its one placeholder, the value set apart to be bold. */
export function emphasis(template: string, key: string, value: string): Pick<PillView, 'before' | 'strong' | 'after'> {
  const mark = `{${key}}`;
  const at = template.indexOf(mark);
  if (at < 0) return { before: '', strong: '', after: template };
  return { before: template.slice(0, at), strong: value, after: template.slice(at + mark.length) };
}

/** The whole line, as a screen reader and the roll's key read it. */
export function pillText(view: Pick<PillView, 'before' | 'strong' | 'after'>): string {
  return `${view.before}${view.strong}${view.after}`.trim();
}

const QUIET: PillView = { state: 'idle', tone: 'plain', glyph: null, glyphTone: null, before: '', strong: '', after: '', meta: null, progress: null, paused: false };

function goalOf(goal: PillFacts['goal']): Pick<PillView, 'meta' | 'progress'> {
  if (!goal || goal.total <= 0) return { meta: null, progress: null };
  return { meta: `${goal.done}/${goal.total}`, progress: Math.min(1, Math.max(0, goal.done / goal.total)) };
}

/** What the pill says at rest; `state: 'idle'` with no words is the robot alone. */
export function pillView(facts: PillFacts): PillView {
  const copy = strings.island.pill;
  const { waiting } = facts;
  if (waiting.count > 0) {
    const words =
      waiting.count > 1
        ? emphasis(copy.waitsMany, 'count', String(waiting.count))
        : emphasis(copy.waitsOne, 'name', waiting.from ? fitWords(waiting.from, TITLE_MAX) : copy.someone);
    return { ...QUIET, state: 'waiting', tone: 'attention', ...words };
  }
  if (facts.told) return { ...QUIET, state: 'told', tone: facts.told.tone, after: fitWords(facts.told.text, TOLD_MAX) };
  if (facts.rule) return { ...QUIET, state: 'told', tone: 'done', glyph: 'rule', after: fitWords(facts.rule, TOLD_MAX) };
  if (facts.robot) return QUIET;
  if (facts.rest) {
    const line = facts.rest;
    const glyph = line.kind === 'live' ? null : line.kind;
    return { ...QUIET, state: 'rest', glyph, glyphTone: line.tone, strong: fitWords(line.name, TITLE_MAX), after: line.doing ? ` ${line.doing}` : '', paused: line.paused ?? false };
  }
  if (facts.focus) {
    const line = facts.focus;
    const name = fitWords(line.name, TITLE_MAX);
    // Ended, its state follows its name ("notes · terminé"); at work, its task list's progress.
    if (line.tone === 'done' || line.tone === 'failed') return { ...QUIET, state: 'working', tone: line.tone === 'failed' ? 'failed' : 'plain', strong: name, after: ` · ${line.doing.toLocaleLowerCase()}` };
    return { ...QUIET, state: 'working', ...emphasis(copy.workingOne, 'name', name), ...goalOf(facts.goal) };
  }
  const { count, first } = facts.working;
  if (count <= 0) return QUIET;
  const words = count === 1 && first ? emphasis(copy.workingOne, 'name', fitWords(first, TITLE_MAX)) : emphasis(copy.workingMany, 'count', String(count));
  return { ...QUIET, state: 'working', ...words, ...goalOf(facts.goal) };
}
