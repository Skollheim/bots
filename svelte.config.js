import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** As Boite's (`vendor/boite/packages/ui/svelte.config.js`): its components compile here too. */
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
    cssHash: ({ css, filename, hash }) => `b${hash(filename === '(unknown)' ? css : filename ?? css)}`
  }
};
