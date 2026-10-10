import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { findCore, sameCore, waitForCore, watchEndpoint, type CoreEndpoint } from './connection';

const invoke = vi.fn<(command: string) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (command: string) => invoke(command) }));

const file: CoreEndpoint = { url: 'http://127.0.0.1:4100', token: 't1', source: 'file' };

beforeEach(() => {
  invoke.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__TAURI_INTERNALS__;
  history.replaceState(null, '', '/');
});

const inShell = () => (window.__TAURI_INTERNALS__ = {});

test('a browser page reads the core from the query', async () => {
  history.replaceState(null, '', '/?core=http://127.0.0.1:4100&token=abc');
  expect(await findCore()).toEqual({ url: 'http://127.0.0.1:4100', token: 'abc', source: 'query' });
  history.replaceState(null, '', '/?core=http://127.0.0.1:4100');
  expect(await findCore()).toBeNull();
});

test('the shell answers with the endpoint it found, and anything else is no core', async () => {
  inShell();
  invoke.mockResolvedValueOnce(file);
  expect(await findCore()).toEqual(file);
  invoke.mockResolvedValueOnce({ url: '', token: 'x', source: 'env' });
  expect(await findCore()).toBeNull();
  invoke.mockRejectedValueOnce(new Error('no command'));
  expect(await findCore()).toBeNull();
  expect(invoke).toHaveBeenCalledWith('core_endpoint');
});

test('waiting tells once, then looks again until Boite starts', async () => {
  inShell();
  invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(file);
  const onwait = vi.fn();
  const found = waitForCore(() => false, onwait, 1_000);
  await vi.advanceTimersByTimeAsync(2_500);
  expect(await found).toEqual(file);
  expect(onwait).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(3);
});

test('a stopped wait resolves null', async () => {
  inShell();
  invoke.mockResolvedValue(null);
  let stopped = false;
  const found = waitForCore(() => stopped, () => {}, 1_000);
  await vi.advanceTimersByTimeAsync(10);
  stopped = true;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await found).toBeNull();
});

test('a core restarted on another port reloads onto it, only while the socket is down', async () => {
  inShell();
  let ready = true;
  const onmoved = vi.fn();
  const stop = watchEndpoint(file, () => ready, onmoved, 1_000);
  invoke.mockResolvedValue({ ...file, url: 'http://127.0.0.1:4200' });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(onmoved).not.toHaveBeenCalled();
  ready = false;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(onmoved).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(onmoved).toHaveBeenCalledTimes(1);
  stop();
});

test('an endpoint from the environment is never watched', async () => {
  inShell();
  const onmoved = vi.fn();
  watchEndpoint({ ...file, source: 'env' }, () => false, onmoved, 1_000);
  invoke.mockResolvedValue({ ...file, token: 'other' });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(onmoved).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

test('two endpoints are the same core by address and token', () => {
  expect(sameCore(file, { ...file, source: 'env' })).toBe(true);
  expect(sameCore(file, { ...file, token: 't2' })).toBe(false);
});
