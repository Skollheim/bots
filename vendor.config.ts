import { fileURLToPath } from 'node:url';
import type { Alias } from 'vite';

/**
 * Boite's shared UI and contracts, from the submodule at `vendor/boite`: the
 * same paths as `tsconfig.json`. A file under the submodule importing a bare
 * package (`svelte`, `@lucide/svelte`) finds it in Bots's own node_modules.
 */
const vendor = (path: string) => fileURLToPath(new URL(`./vendor/boite/packages/${path}`, import.meta.url));

export const alias: Alias[] = [
  { find: /^@boite\/contracts$/, replacement: vendor('contracts/src/index.ts') },
  { find: /^@boite\/ui\//, replacement: `${vendor('ui/src')}/` }
];

/** Boite's fonts, which its stylesheet loads from `/fonts`. */
export const publicDir = vendor('ui/public');
