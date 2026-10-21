/*
 * The memory warning over the deck. By default it is a slim strip, the full
 * card a press away; Settings can ask for the full card at once, or nothing.
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { Companion } from '../../../lib/companion/companion.svelte';
import { DEFAULT_COMPANION_PREFS, type MemoryAlert } from '../../../lib/companion/prefs';
import { viewContext, type ViewContext } from '../../../lib/island/contract';
import { MemoryWatch } from '../../../lib/island/pressure.svelte';
import MemoryCard from './MemoryCard.svelte';

const GB = 1024 * 1024 * 1024;

let shown: { card: Record<string, unknown>; target: HTMLElement } | null = null;

function show(memoryAlert: MemoryAlert = DEFAULT_COMPANION_PREFS.memoryAlert): HTMLElement {
  const memory = new MemoryWatch();
  memory.pose({ reason: 'machine', threadId: 't-1', title: 'Refonte dashboard', bytes: 0.6 * GB, used: 2.8 * GB, limit: 3.2 * GB });
  const target = document.body.appendChild(document.createElement('div'));
  const context = { companion: { prefs: { ...DEFAULT_COMPANION_PREFS, memoryAlert } } as unknown as Companion, core: { client: null, reachable: true }, memory } as unknown as ViewContext;
  shown = { card: mount(MemoryCard, { target, context: viewContext(context) }), target };
  flushSync();
  return target;
}

function hide() {
  if (!shown) return;
  unmount(shown.card);
  shown.target.remove();
  shown = null;
}

afterEach(hide);

const testid = (target: HTMLElement, id: string) => target.querySelector(`[data-testid="${id}"]`);

test('by default the warning is a slim strip, not the full card, and opens on a press', () => {
  const target = show();
  expect(testid(target, 'island-memory')).toBeNull();
  expect(testid(target, 'island-memory-strip')?.textContent).toContain('2.8 GB');
  (testid(target, 'memory-details') as HTMLButtonElement).click();
  flushSync();
  expect(testid(target, 'island-memory')).not.toBeNull();
  expect(testid(target, 'island-memory-strip')).toBeNull();
});

test('the panel setting shows the full card at once, off shows nothing', () => {
  expect(testid(show('panel'), 'island-memory')).not.toBeNull();
  hide();
  expect(show('off').querySelector('section')).toBeNull();
});
