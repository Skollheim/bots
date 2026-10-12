/*
 * The clipboard history, page side: the shell's listener records what is
 * copied (`computer/clipboard.rs`) and tells this page each change; the list
 * lives in the shell's memory alone and is lost on quit. Nothing here keeps,
 * logs or sends an entry: only a click on "Send to chat" does.
 *
 * `start` runs for as long as the island's page: the setting "Clipboard
 * history" (on by default) starts or stops the listener, from this page or
 * from Settings'. "Pause" holds for the session only.
 */
import { clipItem, copyClip, listClipboard, onClipboard, removeClip, watchClipboard, type ClipEntry, type ClipItem } from './native';
import { readWindowsPrefs, subscribeWindowsPrefs } from './prefs';

export class ClipboardHistory {
  entries = $state<ClipEntry[]>([]);
  enabled = $state(true);
  paused = $state(false);
  #started = 0;
  #stop: (() => void) | null = null;

  /** Starts the listener when the setting is on. Returns the function that stops. */
  start(): () => void {
    this.#started += 1;
    if (this.#started === 1) this.#run();
    return () => {
      this.#started -= 1;
      if (this.#started === 0) this.#halt();
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.enabled) void watchClipboard(true, paused).catch(() => {});
  }

  copy = (id: number): Promise<void> => copyClip(id);
  remove = (id: number): Promise<void> => removeClip(id);
  clear = (): Promise<void> => removeClip(null);
  item = (id: number): Promise<ClipItem | null> => clipItem(id);

  /** Pulls the list again, for a tab that opens. */
  async refresh(): Promise<void> {
    if (!this.enabled) return;
    this.entries = await listClipboard().catch(() => this.entries);
  }

  #run(): void {
    let alive = true;
    let unlisten: (() => void) | null = null;
    void onClipboard((entries) => (this.entries = entries)).then((stop) => {
      if (alive) unlisten = stop;
      else stop();
    });
    const apply = (on: boolean) => {
      this.enabled = on;
      if (!on) {
        this.entries = [];
        this.paused = false;
      }
      void watchClipboard(on, this.paused)
        .then(() => this.refresh())
        .catch(() => {});
    };
    apply(readWindowsPrefs().clipboard);
    const offPrefs = subscribeWindowsPrefs((prefs) => {
      if (prefs.clipboard !== this.enabled) apply(prefs.clipboard);
    });
    this.#stop = () => {
      alive = false;
      unlisten?.();
      offPrefs();
    };
  }

  #halt(): void {
    this.#stop?.();
    this.#stop = null;
  }
}

/** The one history of the page. */
export const clipboardHistory = new ClipboardHistory();
