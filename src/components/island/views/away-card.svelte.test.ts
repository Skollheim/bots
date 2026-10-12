/*
 * The recap card: a line opens what it tells, a line with nothing to open is
 * plain text, and "OK" or Escape put the card away (Escape not while typing).
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { AwayLine } from '../../../lib/island/away';
import { fill, strings } from '../../../lib/strings';
import AwayCard from './AwayCard.svelte';

const copy = strings.island.away;
const lines: AwayLine[] = [
  { key: 'finish', icon: 'finished', text: 'Port the queue is done', tone: 'done', target: { kind: 'thread', threadId: 't-1' } },
  { key: 'quota', icon: 'quota', text: 'Claude: 12% left', tone: 'attention', target: null }
];

let shown: { card: Record<string, unknown>; target: HTMLElement } | null = null;

function show(onopen: (line: AwayLine) => void, ondismiss: () => void): HTMLElement {
  const target = document.body.appendChild(document.createElement('div'));
  shown = { card: mount(AwayCard, { target, props: { lines, span: '52 min', onopen, ondismiss } }), target };
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

test('the card tells how long, a line opens its target, OK dismisses', () => {
  const opened: string[] = [];
  let dismissed = 0;
  const target = show(
    (line) => opened.push(line.key),
    () => dismissed++
  );
  expect(target.textContent).toContain(fill(copy.gone, { span: '52 min' }));
  const rows = target.querySelectorAll('[data-testid="away-line"]');
  expect(rows).toHaveLength(2);
  // The quota line has nothing to open: it is no button.
  expect(rows[1]!.tagName).toBe('SPAN');
  (rows[0] as HTMLButtonElement).click();
  expect(opened).toEqual(['finish']);
  target.querySelector<HTMLButtonElement>('[data-testid="away-ok"]')!.click();
  expect(dismissed).toBe(1);
});

test('Escape dismisses, but not while a field has the keyboard', () => {
  let dismissed = 0;
  show(
    () => {},
    () => dismissed++
  );
  const input = document.body.appendChild(document.createElement('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(dismissed).toBe(0);
  input.remove();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(dismissed).toBe(1);
});
