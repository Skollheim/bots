/*
 * What the island's assistant, its quotas pill and its Today card show in the
 * demo (`?fake=1`): two Boite agents, one of them with a conversation of its
 * own (a code block, a file sent along), four threads finished today with the
 * files their tools changed, and two subscriptions, one of them under a
 * quarter left.
 */
import type { AccountQuota, AgentConversationMessage, AgentProfile, AgentRecord, Message, MessagePart, QuotaWindow, Thread } from '@boite/contracts';
import type { FakeContext, FakeMethods } from '@boite/ui/lib/fake-client/context';
import { directScope } from '../companion/crew';
import { withFiles } from '../island/assistant.svelte';

/** The agent the demo's assistant talks to. */
export const ASSISTANT_DEMO_AGENT = 'agent-atlas';
const OTHER_AGENT = 'agent-ledger';

const MINUTE = 60_000;

const ANSWER = [
  'Two changes landed in the scheduler this morning:',
  '',
  '- a retry now waits **30 s** at most between attempts;',
  '- a turn that hits a quota goes back in the queue instead of failing.',
  '',
  'The cap is one constant in `scheduler.rs`:',
  '',
  '```rust',
  'const RETRY_CAP: Duration = Duration::from_secs(30);',
  '```',
  '',
  'The [pull request](https://example.com/boite/pull/412) has the rest.'
].join('\n');

const FOLLOW_UP = [
  'It matches. The log shows three retries, at 2, 4 and 8 s, then the turn going back in the queue at 02:14 instead of failing.',
  '',
  'Nothing else stands out: the night ran its six turns.'
].join('\n');

/** A day's work: what each thread did, how long it ran, the files its tools changed. */
const DAY = [
  { title: 'Fix the flaky upload test', project: 'p-boite', minutes: 18, ago: 25, files: ['packages/core/src/upload.rs', 'packages/core/tests/upload.rs'] },
  { title: 'Sort last week into the journal', project: 'p-notes', minutes: 9, ago: 70, files: ['journal/2026-w40.md'] },
  { title: 'Give the file tree its rows', project: 'p-boite', minutes: 41, ago: 140, files: ['packages/ui/src/lib/tree.ts', 'packages/ui/src/components/Tree.svelte', 'packages/ui/src/lib/tree.test.ts'] },
  { title: 'Draft the release notes', project: 'p-boite', minutes: 12, ago: 210, files: ['CHANGELOG.md'] }
];

function at(now: number, ago: number): number {
  // Kept inside today, however early the demo runs.
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  return Math.max(midnight + MINUTE, now - ago * MINUTE);
}

function text(id: string, thread: string, turnId: string, role: Message['role'], parts: MessagePart[], createdAt: number): Message {
  return { id, threadId: thread, turnId, role, parts, state: 'complete', createdAt };
}

function idle(model: Thread, over: Partial<Thread>): Thread {
  return { ...structuredClone(model), status: 'idle', progress: null, runningSince: null, requestSince: null, doneAt: null, archived: false, unread: false, ...over } as Thread;
}

export function profile(id: string, name: string, domain: string, model: string | null, createdAt: number): AgentProfile {
  return {
    id, revision: 1, createdAt, updatedAt: createdAt, name, domain,
    instructions: `You are ${name}. Answer briefly and plainly.`,
    avatar: '',
    selection: { providerId: 'claude', accountId: 'a-claude-main', model, effort: 'high', permissionMode: 'default' },
    status: 'active',
    tools: ['messages', 'memory'],
    accountIntegration: 'provider'
  };
}

/**
 * The agents' rows, written in place: the fake only takes new ones through
 * calls that give them fresh ids and start a run for every message sent.
 */
export function rowsOf(ctx: FakeContext): Map<string, AgentRecord> {
  return (ctx.agents as unknown as { rows: Map<string, AgentRecord> }).rows;
}

function seedAgents(ctx: FakeContext, now: number): void {
  const rows = rowsOf(ctx);
  const made = at(now, 600);
  // Atlas chose no face (it wears B.O.T.S's), Ledger a retro robot.
  const agents = [
    profile(ASSISTANT_DEMO_AGENT, 'Atlas', 'Research and notes', 'claude-sonnet-5-5', made),
    { ...profile(OTHER_AGENT, 'Ledger', 'Invoices and accounts', null, made + MINUTE), avatar: 'bot:c.1.6.2.1' }
  ];
  for (const agent of agents) rows.set(`profile:${agent.id}`, agent);

  const asked = at(now, 50);
  const scope = directScope(ASSISTANT_DEMO_AGENT);
  const message = (id: string, from: string | null, body: string, createdAt: number, replyTo: string | null = null): AgentConversationMessage => ({
    id, revision: 1, createdAt, updatedAt: createdAt, scope,
    senderId: from, text: body, recipientIds: from === null ? [ASSISTANT_DEMO_AGENT] : [],
    replyTo, episodeId: `episode-${id}`, sourceRunId: null
  });
  const conversation = [
    message('m-atlas-1', null, 'What changed in the scheduler today?', asked),
    message('m-atlas-2', ASSISTANT_DEMO_AGENT, ANSWER, asked + 40_000, 'm-atlas-1'),
    message('m-atlas-3', null, withFiles('Here is last night’s log. Does it match?', ['C:\\Users\\demo\\Downloads\\night.log']), at(now, 9)),
    message('m-atlas-4', ASSISTANT_DEMO_AGENT, FOLLOW_UP, at(now, 8), 'm-atlas-3')
  ];
  for (const entry of conversation) rows.set(`message:${entry.id}`, entry);
}

export function seedAssistantDemo(ctx: FakeContext, methods: FakeMethods): void {
  const now = Date.now();
  seedAgents(ctx, now);

  const model = ctx.threads.get('t-scheduler');
  if (model) {
    DAY.forEach((entry, index) => {
      const id = `t-day-${index + 1}`;
      const finished = at(now, entry.ago);
      const started = finished - entry.minutes * MINUTE;
      const turnId = `turn-day-${index + 1}`;
      ctx.threads.set(
        id,
        idle(model, {
          id,
          projectId: entry.project,
          title: entry.title,
          sessionId: `sess-day-${index + 1}`,
          createdAt: started - MINUTE,
          updatedAt: finished,
          turns: [{ id: turnId, threadId: id, status: 'done', queuedAt: started, startedAt: started, finishedAt: finished, usage: null, error: null }],
          messages: [
            text(`m-day-${index + 1}-1`, id, turnId, 'user', [{ type: 'text', text: entry.title }], started),
            text(`m-day-${index + 1}-2`, id, turnId, 'assistant', [
              ...entry.files.map((path, file): MessagePart => ({
                type: 'tool',
                toolId: `tool-day-${index + 1}-${file}`,
                name: 'Edit',
                input: { file_path: path },
                output: null,
                status: 'done',
                documents: [{ kind: 'diff', path, oldText: '', newText: '' }]
              })),
              { type: 'text', text: 'Done.' }
            ], finished)
          ]
        })
      );
    });
  }

  // Boite's starred models, kept in the core's settings where its picker and Bots's read them.
  ctx.settings = {
    ...ctx.settings,
    modelFavorites: {
      at: now,
      items: [
        { providerId: 'claude', model: { id: 'claude-opus-5-5', name: 'Opus 5.5' }, account: 'Default login' },
        { providerId: 'claude', model: { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }, account: 'Default login' },
        { providerId: 'opencode', model: { id: 'nvidia/gpt-oss-120b', name: 'GPT-OSS 120B' }, account: 'Default' },
        { providerId: 'opencode', model: { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' }, account: 'Default' }
      ]
    }
  } as typeof ctx.settings;

  // Two subscriptions, the first one under a quarter left on its week.
  const quotas = (): AccountQuota[] => [
    {
      accountId: 'a-claude', providerId: 'claude', providerName: 'Claude', label: 'Claude Max · chris@…', enabled: true, status: 'ready', checkedAt: now, error: null,
      windows: [
        { id: 'five-hour', label: '5 hours', usedPercent: 38, resetsAt: now + 2 * 60 * MINUTE },
        { id: 'seven-day', label: 'Weekly', usedPercent: 81, resetsAt: now + 3 * 24 * 60 * MINUTE }
      ]
    },
    {
      accountId: 'a-codex', providerId: 'codex', providerName: 'Codex', label: 'ChatGPT Plus · chris@…', enabled: true, status: 'ready', checkedAt: now, error: null,
      windows: [
        { id: 'five-hour', label: '5 hours', usedPercent: 22, resetsAt: now + 4 * 60 * MINUTE },
        { id: 'seven-day', label: 'Weekly', usedPercent: 47, resetsAt: now + 5 * 24 * 60 * MINUTE }
      ]
    }
  ];

  // The subscription proxy (Douane) as a week in use rather than the seed's
  // Pro entry, out and cooling down: no entry reads empty, and the tightest
  // window left is the Claude Max week above, in amber.
  const CALM: Record<string, number> = { 'five-hour': 46, 'seven-day': 72 };
  const calm = (windows: QuotaWindow[]) => windows.map((window) => ({ ...window, usedPercent: CALM[window.id] ?? window.usedPercent }));
  const tense = (entryId: string | undefined) => entryId === 'claude-2';
  const proxyQuotas = methods['subscriptionProxy.quotas'];
  methods['subscriptionProxy.quotas'] = async (params) => {
    const state = await proxyQuotas(params);
    return {
      ...state,
      providers: state.providers.map((provider) => ({
        ...provider,
        entries: provider.entries.map((entry) => (tense(entry.id) ? { ...entry, status: 'ready' as const, windows: calm(entry.windows) } : entry))
      }))
    };
  };
  // Boite's accounts are the two above; the proxy's entries come after them, as the core lists them.
  const listed = methods['quotas.list'];
  methods['quotas.list'] = async (params) => [
    ...quotas(),
    ...(await listed(params))
      .filter((row) => row.gateway)
      .map((row) => (tense(row.gateway?.entryId) && row.gateway ? { ...row, windows: calm(row.windows), gateway: { ...row.gateway, status: 'ready' as const } } : row))
  ];
}
