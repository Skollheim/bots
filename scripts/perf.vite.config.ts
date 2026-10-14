/*
 * The page as it ships, with the demo poses in: `scripts/perf-probe.ts`
 * measures this build, since the dev server's Svelte traces every state
 * write and its numbers are mostly that tracing.
 *
 * `bun x vite build --config scripts/perf.vite.config.ts`, then
 * `bun x vite preview --config scripts/perf.vite.config.ts --port 5282`.
 */
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    // The demo gates (`import.meta.env.DEV && ...`) stay open in this production build.
    define: { 'import.meta.env.DEV': 'true' },
    build: { outDir: 'node_modules/.bots-perf', emptyOutDir: true }
  })
);
