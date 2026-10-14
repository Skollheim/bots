/*
 * The deck's chat tab: the conversation across the deck's width, nothing
 * beside it; the screen captures as two buttons in the composer, in the
 * shell only; the files dropped as chips above the field.
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { Attachment } from '@boite/contracts';
import type { Companion } from '../../../../lib/companion/companion.svelte';
import { viewContext, type ViewContext } from '../../../../lib/island/contract';
import { strings } from '../../../../lib/strings';
import ChatTab from './ChatTab.svelte';

/** An assistant with no agent picked yet: the head, the log and the composer, and nothing to talk to. */
class FakeAssistant {
  agent = null;
  agents = [];
  machine = null;
  placed = null;
  snapshot = null;
  bubbles = [];
  draft = $state('');
  running = false;
  stopping = false;
  sending = false;
  problem = '';
  failure = '';
  tool = null;
  hasOlder = false;
  loadingOlder = false;
  coreId = null;
}

class FakeCompanion {
  assistant = new FakeAssistant();
  attached = $state({ held: [] as Attachment[], reading: false, problem: '', over: false, remove: () => {} });
  shot = null;
  captured: boolean[] = [];

  async capture(zone: boolean): Promise<boolean> {
    this.captured.push(zone);
    return true;
  }
}

let shown: { tab: Record<string, unknown>; target: HTMLElement } | null = null;

function show(companion: FakeCompanion): HTMLElement {
  const target = document.body.appendChild(document.createElement('div'));
  const context = { companion: companion as unknown as Companion, hold: () => {} } as unknown as ViewContext;
  shown = { tab: mount(ChatTab, { target, context: viewContext(context) }), target };
  flushSync();
  return target;
}

afterEach(() => {
  if (shown) {
    unmount(shown.tab);
    shown.target.remove();
    shown = null;
  }
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

test('the conversation is alone in the tab: no drop zone waits beside it', () => {
  const target = show(new FakeCompanion());
  expect(target.querySelector('[data-testid=island-chat]')).not.toBeNull();
  expect(target.querySelector('[data-testid=island-drop]')).toBeNull();
  expect(target.textContent).not.toContain(strings.island.drop.title);
});

test('in the shell, the composer holds the two capture buttons, the screen and a zone', () => {
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  const companion = new FakeCompanion();
  const target = show(companion);
  const composer = target.querySelector('.composer')!;
  const screen = composer.querySelector<HTMLButtonElement>('[data-testid=island-capture]')!;
  const zone = composer.querySelector<HTMLButtonElement>('[data-testid=island-capture-zone]')!;
  expect(screen.getAttribute('aria-label')).toBe(strings.island.drop.capture);
  expect(zone.getAttribute('aria-label')).toBe(strings.island.drop.zone);
  screen.click();
  zone.click();
  expect(companion.captured).toEqual([false, true]);
});

test('out of the shell, no capture button shows', () => {
  const target = show(new FakeCompanion());
  expect(target.querySelector('[data-testid=island-capture]')).toBeNull();
});

test('the files dropped show as chips above the field, each to take back', () => {
  const companion = new FakeCompanion();
  companion.attached.held = [{ kind: 'file', mimeType: 'text/plain', data: 'ZGVtbw==', name: 'night.log' } as Attachment];
  const target = show(companion);
  const chips = target.querySelector('.composer [data-testid=companion-attachments]');
  expect(chips?.textContent).toContain('night.log');
  expect(chips?.querySelector(`[aria-label="${strings.companion.drop.remove.replace('{name}', 'night.log')}"]`)).not.toBeNull();
});
