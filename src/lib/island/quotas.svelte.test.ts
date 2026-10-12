import type { AccountQuota, AccountQuotaGateway } from '@boite/contracts';
import { expect, test, vi } from 'vitest';
import { compactCount, QuotaWatch, quotaAccounts, resetIn, headroom, toneOf, tokensOf } from './quotas.svelte';

const HOUR = 3_600_000;

function row(accountId: string, used: number[], over: Partial<AccountQuota> = {}): AccountQuota {
  return {
    accountId,
    providerId: 'claude',
    providerName: 'Claude',
    label: accountId,
    enabled: true,
    status: 'ready',
    checkedAt: 0,
    error: null,
    windows: used.map((usedPercent, index) => ({ id: `w${index}`, label: index === 0 ? '5 hours' : 'Weekly', usedPercent, resetsAt: (index + 1) * HOUR })),
    ...over
  } as AccountQuota;
}

test('a window turns amber under 25 % left and red under 10 %', () => {
  expect(toneOf(25)).toBe('ok');
  expect(toneOf(24)).toBe('amber');
  expect(toneOf(10)).toBe('amber');
  expect(toneOf(9)).toBe('red');
});

test('the accounts come tightest first, each with its windows tightest first', () => {
  const accounts = quotaAccounts([row('roomy', [10, 40]), row('tight', [20, 81])]);
  expect(accounts.map((account) => account.id)).toEqual(['tight', 'roomy']);
  expect(accounts[0]!.bars.map((bar) => bar.left)).toEqual([19, 80]);
  expect(accounts[0]!.tone).toBe('amber');
  expect(headroom(accounts)).toMatchObject({ account: { id: 'roomy' }, bar: { label: 'Weekly', left: 60 } });
});

test('rows that say nothing are left out, and nothing left means no pill', () => {
  const accounts = quotaAccounts([
    row('off', [99], { enabled: false }),
    row('disabled', [99], { status: 'disabled' }),
    row('unread', [99], { status: 'unavailable' }),
    row('empty', [])
  ]);
  expect(accounts).toEqual([]);
  expect(headroom(accounts)).toBeNull();
});

test('a share used past the limit reads as nothing left, never below zero', () => {
  expect(quotaAccounts([row('over', [130])])[0]!.bars[0]!.left).toBe(0);
});

test('the proxy entries come in the same rows, as left, and Settings can leave them out', () => {
  const gateway = (entryId: string): AccountQuotaGateway => ({ kind: 'douane', entryId, display: 'accounts', plan: null, accounts: 1, status: 'ready', credits: [] });
  const rows = [row('core', [30]), row('proxy:claude:max', [64], { gateway: gateway('max') }), row('proxy:claude:pro', [93], { gateway: gateway('pro') })];
  const all = quotaAccounts(rows);
  expect(all.map((account) => [account.id, account.left, account.tone, account.proxy])).toEqual([
    ['proxy:claude:pro', 7, 'red', true],
    ['proxy:claude:max', 36, 'ok', true],
    ['core', 70, 'ok', false]
  ]);
  expect(all[0]!.bars[0]!.resetsAt).toBe(HOUR);
  const kept = quotaAccounts(rows, { shown: true, hidden: ['claude:pro'] });
  expect(kept.map((account) => account.id)).toEqual(['proxy:claude:max', 'core']);
  expect(headroom(kept)?.bar.left).toBe(70);
  expect(quotaAccounts(rows, { shown: false, hidden: [] })).toEqual([]);
});

test('the pill shows the room left where the work can go: each provider by its roomiest subscription, the provider with the least room', () => {
  const codex = { providerId: 'codex', providerName: 'Codex' };
  const accounts = quotaAccounts([row('spent', [0, 100]), row('roomy', [57, 52]), row('codex', [1], codex)]);
  expect(headroom(accounts)).toMatchObject({ account: { id: 'roomy' }, bar: { label: '5 hours', left: 43 } });
  expect(headroom(quotaAccounts([row('spent', [0, 100]), row('codex', [1], codex)]))).toMatchObject({ account: { id: 'spent' }, bar: { left: 0 } });
});

test('the reset time reads in minutes, hours or days, and not at all once past', () => {
  expect(resetIn(null, 0)).toBeNull();
  expect(resetIn(1_000, 2_000)).toBeNull();
  expect(resetIn(45 * 60_000, 0)).toEqual({ value: 45, unit: 'min' });
  expect(resetIn(3 * HOUR, 0)).toEqual({ value: 3, unit: 'h' });
  expect(resetIn(72 * HOUR, 0)).toEqual({ value: 3, unit: 'd' });
});

test('tokens add up the cache and read at a glance', () => {
  expect(tokensOf({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, costUsdEquivalent: null })).toBe(10);
  expect(tokensOf(null)).toBe(0);
  expect(compactCount(950)).toBe('950');
  expect(compactCount(340_400)).toBe('340k');
  expect(compactCount(1_240_000)).toBe('1.2M');
});

test('the watch reads the core, then takes what it pushes', async () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const client = {
    call: vi.fn(async (method: string) => (method === 'quotas.list' ? [row('a', [50])] : { byThread: {}, total: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsdEquivalent: null } })),
    on: vi.fn((event: string, handler: (value: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    })
  };
  const watch = new QuotaWatch();
  const stop = watch.follow(client as never);
  await vi.waitFor(() => expect(watch.read).toBe(true));
  expect(watch.headroom?.bar.left).toBe(50);
  await vi.waitFor(() => expect(tokensOf(watch.usage)).toBe(10));
  handlers.get('quotas.updated')!([row('a', [95])]);
  expect(watch.headroom?.bar.tone).toBe('red');
  stop();
  expect(handlers.size).toBe(0);
});
