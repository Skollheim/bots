/*
 * The bar as the island draws it: `bar.ts`'s layout, followed as either
 * window changes it. One per page, started by the page that draws it.
 */
import { LazyImages } from '../windows/images.svelte';
import { appIcon } from '../windows/native';
import { readBar, subscribeBar, writeBar, type BarLayout } from './bar';

export class Bar {
  layout = $state.raw<BarLayout>(readBar());

  /** Follows the other window's changes. Returns the function that stops. */
  start(): () => void {
    this.layout = readBar();
    return subscribeBar((next) => (this.layout = next));
  }

  /** Stores a change, which the other window hears. */
  set(next: BarLayout): void {
    this.layout = writeBar(next);
  }
}

/** The icons of the apps in the bar and in its palette, kept while the page lives: the deck comes and goes. */
export const appIcons = new LazyImages(appIcon);
