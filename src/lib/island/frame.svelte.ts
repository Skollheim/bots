/*
 * The island's frame: its size (collapsed, peek, open), its tab, what keeps it
 * open, and its glow. It reads the companion through `FrameSource` and holds
 * no Boite state of its own, so it is tested with fake timers alone.
 *
 * - Hover gives the peek; a longer hover (with "open on hover") or a click opens.
 * - The pointer gone, it collapses `LEAVE_MS` later unless something holds it:
 *   a pin, an agent waiting on the user, or a view (`hold`, the chat field
 *   with the keyboard).
 * - `flash()` peeks green a few seconds: a turn finished; red when it failed.
 * - `hush(key, on)`: while something in the pill is being read (a request to
 *   answer, a dot's name), a hover peeks but does not open.
 */

export type IslandSize = 'collapsed' | 'peek' | 'open';
export type IslandTab = 'home' | 'chat' | 'drop';
/** Amber: the user is waited on. Green: done; red: failed. Blue-violet: the assistant talks. */
export type IslandGlow = 'none' | 'attention' | 'done' | 'failed' | 'talking';

export const ISLAND_TABS: readonly IslandTab[] = ['home', 'chat', 'drop'];
/** How long after the pointer leaves the island collapses. */
export const LEAVE_MS = 400;
/** How long a hover lasts before it opens the island, when it may. */
export const HOVER_OPEN_MS = 700;
/** How long the green peek of a finished turn lasts. */
export const FLASH_MS = 3000;

/** What the frame reads from the companion and tells it. */
export interface FrameSource {
  /** The panel is open (`Companion.open`). */
  isOpen(): boolean;
  setOpen(open: boolean): void;
  /** Hovering the island long enough opens it. */
  openOnHover(): boolean;
  /** An agent waits on the user: a permission or a question. */
  waiting(): boolean;
  /** A reply is on its way. */
  talking(): boolean;
}

export class IslandFrame {
  tab = $state<IslandTab>('home');
  pinned = $state(false);
  /** The pointer is on the island. */
  hovering = $state(false);
  /** The green peek of a finished turn. */
  flashing = $state(false);
  /** The peek tells of a failure: it glows red rather than green. */
  flashFailed = $state(false);
  /** The open island wants more height (a diff open in Home): its window grows for it, within the work area. */
  tall = $state(false);
  /** What the views hold the island open for, and the attention they asked for, by key. */
  private holds = $state<Record<string, true>>({});
  private calls = $state<Record<string, true>>({});
  /** What the pill shows to be read, by key: a hover does not open the island over it. */
  private readonly hushes = new Set<string>();
  /** Something in the pill is being read (`hush`). */
  hushed = $state(false);

  /** Something keeps the island open while the pointer is away. */
  readonly held = $derived.by(() => this.pinned || this.source.waiting() || Object.keys(this.holds).length > 0 || Object.keys(this.calls).length > 0);
  readonly attention = $derived.by(() => this.source.waiting() || Object.keys(this.calls).length > 0);
  readonly size = $derived.by<IslandSize>(() => (this.source.isOpen() ? 'open' : this.hovering || this.flashing ? 'peek' : 'collapsed'));
  readonly glow = $derived.by<IslandGlow>(() => (this.attention ? 'attention' : this.flashing ? (this.flashFailed ? 'failed' : 'done') : this.source.talking() ? 'talking' : 'none'));

  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly source: FrameSource) {}

  /** The pointer came onto the island, or left it. */
  hover(over: boolean): void {
    if (over === this.hovering) return;
    this.hovering = over;
    clearTimeout(this.openTimer);
    clearTimeout(this.leaveTimer);
    if (over) return this.armOpen();
    this.settle();
  }

  /** A hover opens the island `HOVER_OPEN_MS` later, when it may and nothing in the pill is being read. */
  private armOpen(): void {
    clearTimeout(this.openTimer);
    if (!this.hovering || this.hushes.size > 0 || !this.source.openOnHover() || this.source.isOpen()) return;
    this.openTimer = setTimeout(() => this.source.setOpen(true), HOVER_OPEN_MS);
  }

  /** Something in the pill is being read: a hover does not open the island meanwhile, and counts again from zero after. */
  hush(key: string, on: boolean): void {
    if (on === this.hushes.has(key)) return;
    if (on) {
      this.hushes.add(key);
      clearTimeout(this.openTimer);
    } else {
      this.hushes.delete(key);
      this.armOpen();
    }
    this.hushed = this.hushes.size > 0;
  }

  /** A click on the collapsed island opens it; on the open one's robot, it is a poke and changes nothing here. */
  click(): void {
    clearTimeout(this.openTimer);
    if (!this.source.isOpen()) this.source.setOpen(true);
  }

  /** Opens on a tab: the shortcut opens on Chat. */
  show(tab: IslandTab): void {
    this.tab = tab;
    clearTimeout(this.openTimer);
    if (!this.source.isOpen()) this.source.setOpen(true);
  }

  /** The pointer away and nothing holding it, the island collapses a moment later. */
  settle(): void {
    clearTimeout(this.leaveTimer);
    if (this.hovering || this.held || !this.source.isOpen()) return;
    this.leaveTimer = setTimeout(() => {
      if (!this.hovering && !this.held) this.source.setOpen(false);
    }, LEAVE_MS);
  }

  togglePin(): void {
    this.pinned = !this.pinned;
    if (!this.pinned) this.settle();
  }

  /** A view holds the island open, or lets it go. */
  hold(key: string, on: boolean): void {
    if (on === key in this.holds) return;
    if (on) this.holds = { ...this.holds, [key]: true };
    else {
      const { [key]: _gone, ...rest } = this.holds;
      this.holds = rest;
      this.settle();
    }
  }

  /** A view needs the user: the island opens and glows amber until the call is let go. */
  call(key: string): () => void {
    this.calls = { ...this.calls, [key]: true };
    if (!this.source.isOpen()) this.source.setOpen(true);
    return () => {
      if (!(key in this.calls)) return;
      const { [key]: _gone, ...rest } = this.calls;
      this.calls = rest;
      this.settle();
    };
  }

  /** A turn finished: the island peeks green a few seconds, red for a failure. A plain flash keeps the red of one under way. */
  flash(failed = this.flashing && this.flashFailed): void {
    this.flashing = true;
    this.flashFailed = failed;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => (this.flashing = false), FLASH_MS);
  }

  dispose(): void {
    clearTimeout(this.openTimer);
    clearTimeout(this.leaveTimer);
    clearTimeout(this.flashTimer);
  }
}
