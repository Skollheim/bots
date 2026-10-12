/*
 * The icons and thumbnails of the computer tabs, asked of the shell only for
 * the tiles on screen, four at a time, and kept for the session: a tile that
 * scrolls back in shows at once. The shell keeps them on disk as well.
 */
import { SvelteMap } from 'svelte/reactivity';
import type { Attachment } from 'svelte/attachments';

export const LOAD_AT_ONCE = 4;

export class LazyImages {
  /** Each key's image as a URL; null once known to have none. */
  readonly images = new SvelteMap<string, string | null>();
  readonly #load: (key: string) => Promise<string | null>;
  readonly #limit: number;
  #queue: string[] = [];
  #asked = new Set<string>();
  #running = 0;

  constructor(load: (key: string) => Promise<string | null>, limit = LOAD_AT_ONCE) {
    this.#load = load;
    this.#limit = limit;
  }

  /** The image of `key`: undefined while unknown. */
  get(key: string): string | null | undefined {
    return this.images.get(key);
  }

  /** Asks for `key` once; the answer lands in `images`. */
  want(key: string): void {
    if (this.#asked.has(key)) return;
    this.#asked.add(key);
    this.#queue.push(key);
    this.#pump();
  }

  /** Forgets the queue: the tab went away. What is loaded stays. */
  drop(): void {
    for (const key of this.#queue) this.#asked.delete(key);
    this.#queue = [];
  }

  /** An attachment that wants `key` once its element nears the screen. */
  when(key: string): Attachment<HTMLElement> {
    return (element) => {
      if (typeof IntersectionObserver === 'undefined') {
        this.want(key);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            this.want(key);
          }
        },
        { rootMargin: '120px' }
      );
      observer.observe(element);
      return () => observer.disconnect();
    };
  }

  #pump(): void {
    while (this.#running < this.#limit && this.#queue.length > 0) {
      const key = this.#queue.shift()!;
      this.#running += 1;
      this.#load(key)
        .catch(() => null)
        .then((image) => this.images.set(key, image))
        .finally(() => {
          this.#running -= 1;
          this.#pump();
        });
    }
  }
}
