import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { lucideGlyph } from './vendor/boite/packages/ui/icon-plugin.ts';
import { alias, publicDir } from './vendor.config.ts';

/**
 * The page the shell loads: `index.html` is the companion's window, and
 * `index.html?view=settings` Bots's settings window. The dev server's port is
 * Boite's plus one, so both can run side by side.
 */
export default defineConfig({
  plugins: [lucideGlyph(), svelte()],
  resolve: { alias },
  publicDir,
  clearScreen: false,
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5174, strictPort: true }
});
