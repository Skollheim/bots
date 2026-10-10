import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { lucideGlyph } from './vendor/boite/packages/ui/icon-plugin.ts';
import { alias } from './vendor.config.ts';

/** Boite's test setup (jsdom, its stubs), run on Bots's own tests. */
export default defineConfig({
  plugins: [lucideGlyph(), svelte()],
  resolve: { alias, conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vendor/boite/packages/ui/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    globals: false,
    testTimeout: 15_000,
    /* lucide ships .svelte sources; inlined so the plugin above compiles them too */
    server: { deps: { inline: ['@lucide/svelte'] } }
  }
});
