/*
 * "Always allow": the rules the user asked Bots to keep, and what each one
 * covers. Boite's core answers a permission once (`permissions.answer`); it
 * keeps no rule. So Bots keeps them, here, and answers a matching request
 * itself, which works only while Bots runs.
 *
 * A rule never covers more than what the user saw when making it:
 * - a shell tool: the same tool and the exact same command (and the same
 *   other settings, a sandbox switch or a background flag included);
 * - a file tool: the same tool and the same file path;
 * - any other tool: the same tool and an identical input.
 * The only normalising is trimming the command or the path. Pure, apart from
 * the storage helpers at the end, which take the storage they use.
 */
import type { PermissionRequest } from '@boite/contracts';

export type RuleScope = 'thread' | 'project';
export type RuleKind = 'command' | 'path' | 'input';

export interface AllowRule {
  id: string;
  /** The core the rule was made on (`coreTag`): the demo's rules never answer a real core. */
  core: string;
  scope: RuleScope;
  /** The thread's or the project's id. */
  scopeId: string;
  /** The thread's title or the project's name when the rule was made, for the settings list. */
  scopeName: string;
  toolName: string;
  kind: RuleKind;
  /** The command, the path, or the whole input as canonical JSON. */
  value: string;
  /** For a command: the rest of the input as canonical JSON, which must match too. Empty otherwise. */
  extra: string;
  createdAt: number;
}

/** What a rule made from a request would cover. */
export interface RuleTarget {
  toolName: string;
  kind: RuleKind;
  value: string;
  extra: string;
}

/** The tools whose input is a command line. */
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Shell', 'shell', 'local_shell', 'exec_command']);
/** The tools whose input names one file. */
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'NotebookRead']);
/** Parts of a command's input that change nothing it may do: the label it shows and how long it may take. */
const SHELL_HARMLESS = new Set(['command', 'description', 'timeout']);
/** A request whose input is bigger than this is not offered a rule: nobody read all of it. */
export const RULE_VALUE_MAX = 4000;
export const RULES_KEY = 'bots.allowRules';
/** At most this many rules are kept: the oldest go first. */
export const RULES_MAX = 200;

/** JSON with its keys sorted at every level, so two equal inputs read the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

const record = (input: unknown): Record<string, unknown> | null => (input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null);

/** What a rule for this request would cover; null when it cannot be told exactly (no command, an input too big). */
export function ruleTarget(request: Pick<PermissionRequest, 'toolName' | 'input'>): RuleTarget | null {
  const { toolName } = request;
  if (!toolName) return null;
  const input = record(request.input);
  let target: RuleTarget;
  if (SHELL_TOOLS.has(toolName) && typeof input?.command === 'string') {
    const rest = Object.fromEntries(Object.entries(input).filter(([key]) => !SHELL_HARMLESS.has(key)));
    target = { toolName, kind: 'command', value: input.command.trim(), extra: canonical(rest) };
  } else if (FILE_TOOLS.has(toolName) && input) {
    const path = [input.file_path, input.notebook_path, input.path].find((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    target = path ? { toolName, kind: 'path', value: path.trim(), extra: '' } : { toolName, kind: 'input', value: canonical(request.input), extra: '' };
  } else target = { toolName, kind: 'input', value: canonical(request.input ?? null), extra: '' };
  if (target.value === '' || target.value.length > RULE_VALUE_MAX || target.extra.length > RULE_VALUE_MAX) return null;
  return target;
}

/** Where a request stands: its thread, and that thread's project when it has one. */
export interface RequestPlace {
  core: string;
  threadId: string;
  projectId: string | null;
}

/** The rule covers this request's target: same core, same scope, same tool, same command, path or input. */
export function ruleMatches(rule: AllowRule, target: RuleTarget | null, place: RequestPlace): boolean {
  if (target === null || rule.core !== place.core) return false;
  if (rule.scope === 'thread' ? rule.scopeId !== place.threadId : place.projectId === null || rule.scopeId !== place.projectId) return false;
  return target.toolName === rule.toolName && target.kind === rule.kind && target.value === rule.value && target.extra === rule.extra;
}

export function findRule(rules: readonly AllowRule[], request: Pick<PermissionRequest, 'toolName' | 'input'>, place: RequestPlace): AllowRule | null {
  if (rules.length === 0) return null;
  const target = ruleTarget(request);
  return rules.find((rule) => ruleMatches(rule, target, place)) ?? null;
}

/** What a rule covers, in one line: "Bash · git status", "Edit · …/lib/queue.ts". */
export function ruleText(rule: Pick<AllowRule, 'toolName' | 'kind' | 'value'>, max = 80): string {
  const shown = rule.kind === 'path' ? rule.value : rule.value.replace(/\s+/g, ' ');
  return `${rule.toolName} · ${shown.length > max ? `${shown.slice(0, max - 1)}…` : shown}`;
}

/** A new rule, or the same one again: a rule already kept is not doubled. */
export function addRule(rules: readonly AllowRule[], rule: AllowRule): AllowRule[] {
  const same = (entry: AllowRule) =>
    entry.core === rule.core && entry.scope === rule.scope && entry.scopeId === rule.scopeId && entry.toolName === rule.toolName && entry.kind === rule.kind && entry.value === rule.value && entry.extra === rule.extra;
  if (rules.some(same)) return [...rules];
  return [...rules, rule].slice(-RULES_MAX);
}

/**
 * The rules once the core's threads are known: a thread's rule leaves with
 * its thread, archived or gone. Only a full list of the threads may prune.
 */
export function pruneRules(rules: readonly AllowRule[], core: string, threads: readonly { id: string; archived?: boolean }[]): AllowRule[] {
  const alive = new Set(threads.filter((thread) => !thread.archived).map((thread) => thread.id));
  return rules.filter((rule) => rule.core !== core || rule.scope !== 'thread' || alive.has(rule.scopeId));
}

const SCOPES = new Set<RuleScope>(['thread', 'project']);
const KINDS = new Set<RuleKind>(['command', 'path', 'input']);

/** The rules stored, with anything malformed dropped. */
export function parseRules(raw: unknown): AllowRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): AllowRule[] => {
    const rule = record(entry);
    if (!rule) return [];
    const { id, core, scope, scopeId, scopeName, toolName, kind, value, extra, createdAt } = rule;
    const texts = [id, core, scopeId, toolName, value, extra];
    if (!texts.every((text) => typeof text === 'string') || (id as string) === '' || (value as string) === '') return [];
    if (!SCOPES.has(scope as RuleScope) || !KINDS.has(kind as RuleKind) || typeof createdAt !== 'number') return [];
    return [{ id, core, scope, scopeId, scopeName: typeof scopeName === 'string' ? scopeName : '', toolName, kind, value, extra, createdAt } as AllowRule];
  });
}

export function readRules(storage: Pick<Storage, 'getItem'> | null): AllowRule[] {
  try {
    const raw = storage?.getItem(RULES_KEY);
    return raw ? parseRules(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeRules(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, rules: readonly AllowRule[]): void {
  try {
    if (rules.length === 0) storage?.removeItem(RULES_KEY);
    else storage?.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    /* a refused storage keeps the rules for this session only */
  }
}
