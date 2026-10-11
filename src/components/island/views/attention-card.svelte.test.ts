/*
 * The island's request card. The companion reads the requests again every few
 * seconds, and each read brings new objects for the same requests: what the
 * user typed or picked in a question must outlive them.
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { PermissionRequest, QuestionRequest, ThreadSummary } from '@boite/contracts';
import type { Companion, RequestAction } from '../../../lib/companion/companion.svelte';
import { viewContext, type ViewContext } from '../../../lib/island/contract';
import AttentionCard from './AttentionCard.svelte';

class FakeCompanion {
  threads = $state.raw<Pick<ThreadSummary, 'id' | 'title' | 'projectId'>[]>([{ id: 't-1', title: 'Release', projectId: null }]);
  projects = $state.raw(new Map<string, string>());
  permissions = $state.raw<PermissionRequest[]>([]);
  questions = $state.raw<QuestionRequest[]>([]);
  acted: RequestAction[] = [];

  async act(action: RequestAction): Promise<void> {
    this.acted.push(action);
  }
}

const question = (id: string, more: Partial<QuestionRequest> = {}): QuestionRequest => ({
  id,
  threadId: 't-1',
  turnId: 'turn-1',
  text: 'Which name?',
  options: [],
  allowText: true,
  multiple: false,
  createdAt: 1_000,
  ...more
});

let shown: { card: Record<string, unknown>; target: HTMLElement } | null = null;

function show(companion: FakeCompanion): HTMLElement {
  const target = document.body.appendChild(document.createElement('div'));
  const context = { companion: companion as unknown as Companion } as ViewContext;
  shown = { card: mount(AttentionCard, { target, context: viewContext(context) }), target };
  flushSync();
  return target;
}

afterEach(() => {
  if (shown) {
    unmount(shown.card);
    shown.target.remove();
    shown = null;
  }
});

function type(target: HTMLElement, text: string) {
  const input = target.querySelector<HTMLInputElement>('form.free input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

test('what is typed in the answer stays while the requests are read again', () => {
  const companion = new FakeCompanion();
  companion.questions = [question('q-1')];
  const target = show(companion);
  type(target, 'Bots');

  companion.questions = [question('q-1')];
  flushSync();
  expect(target.querySelector<HTMLInputElement>('form.free input')?.value).toBe('Bots');
  const send = target.querySelector<HTMLButtonElement>('form.free button[type="submit"]')!;
  expect(send.disabled).toBe(false);

  send.click();
  flushSync();
  expect(companion.acted).toEqual([{ kind: 'answer', question: companion.questions[0], optionIds: [], text: 'Bots' }]);
});

test('the options picked stay while the requests are read again', () => {
  const options = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' }
  ];
  const companion = new FakeCompanion();
  companion.questions = [question('q-1', { options, multiple: true, allowText: false })];
  const target = show(companion);
  target.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click();
  flushSync();

  companion.questions = [question('q-1', { options, multiple: true, allowText: false })];
  flushSync();
  expect([...target.querySelectorAll('button[aria-pressed]')].map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
});
