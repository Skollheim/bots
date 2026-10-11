/**
 * The fake core « Serveur » of the group's demo (`machines-demo.ts`): in place
 * of the fake's seed, one project, Petites-Rives, with a thread at work on its
 * gameplay; with `ask`, that thread asks to push a moment after it starts.
 */
import type { Message, MessagePart, PermissionRequest, Thread } from '@boite/contracts';
import type { FakeContext } from '@boite/ui/lib/fake-client/context';

export const SERVER_THREAD = 't-srv-gameplay';
export const SERVER_PROJECT = 'p-srv-rives';
const ASK_AFTER_MS = 2_000;

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

function tool(toolId: string, name: string, input: unknown, status: ToolPart['status'], at: number): ToolPart {
  return { type: 'tool', toolId, name, input, output: null, status, startedAt: at, finishedAt: status === 'running' ? null : at + 800 };
}

/** The server's own seed in place of the fake's: one project, one thread at work, and in `ask` a request on its way. */
export function seedServerDemo(ctx: FakeContext, ask: boolean): void {
  const model = [...ctx.threads.values()].find((thread) => !thread.parentThreadId);
  const project = ctx.projects[0];
  if (!model || !project) return;
  const now = Date.now();
  const started = now - 5 * 60_000 - 12_000;
  const turnId = 'turn-srv-gameplay';
  const cwd = '/srv/petites-rives';
  ctx.threads.clear();
  ctx.pendingPermissions.clear();
  ctx.pendingQuestions.clear();
  ctx.importable = [];
  ctx.scheduler = { ...ctx.scheduler, running: [], queued: [] };
  ctx.projects = [{ ...structuredClone(project), id: SERVER_PROJECT, name: 'Petites-Rives', path: cwd }];
  const steps: Message = {
    id: 'm-srv-1',
    threadId: SERVER_THREAD,
    turnId,
    role: 'assistant',
    state: 'streaming',
    createdAt: started + 1_000,
    parts: [
      tool('sv-1', 'Read', { file_path: `${cwd}/Assets/Scripts/Player/PlayerController.cs` }, 'done', now - 80_000),
      tool('sv-2', 'Grep', { pattern: 'jumpBuffer' }, 'done', now - 50_000),
      tool('sv-3', 'Bash', { command: 'dotnet test Gameplay.Tests' }, 'running', now - 15_000)
    ]
  };
  const thread: Thread = {
    ...structuredClone(model),
    id: SERVER_THREAD,
    projectId: SERVER_PROJECT,
    title: 'Corriger le gameplay',
    titleSource: 'user',
    cwd,
    branch: 'fix/gameplay',
    status: 'running',
    archived: false,
    pinned: false,
    unread: false,
    sessionId: 'sess-srv-gameplay',
    load: null,
    context: null,
    createdAt: started - 1_000,
    updatedAt: started,
    turns: [{ id: turnId, threadId: SERVER_THREAD, status: 'running', queuedAt: started - 500, startedAt: started, finishedAt: null, usage: null, error: null }],
    messages: [steps],
    background: [],
    progress: { turnId, phase: 'tool', detail: 'Bash', at: now - 15_000, providerAt: now - 15_000 }
  };
  delete thread.parentThreadId;
  ctx.threads.set(thread.id, thread);
  ctx.scheduler.running.push({ turnId, threadId: thread.id, startedAt: started });
  if (ask) setTimeout(() => askToPush(ctx, thread), ASK_AFTER_MS);
}

function askToPush(ctx: FakeContext, thread: Thread): void {
  const request: PermissionRequest = {
    id: 'perm-srv-push',
    threadId: thread.id,
    turnId: thread.turns.at(-1)?.id ?? 'turn-srv-gameplay',
    toolName: 'Bash',
    input: { command: 'git push origin fix/gameplay', description: 'Push the gameplay fix' },
    description: 'git push origin fix/gameplay',
    createdAt: Date.now()
  };
  ctx.pendingPermissions.set(request.id, {
    request,
    resolve: () => {
      thread.status = 'running';
      ctx.touch(thread);
    }
  });
  thread.status = 'waiting';
  ctx.touch(thread);
  ctx.emit('permission.requested', structuredClone(request));
}
