/*
 * The settings panel: Bots's settings, drawn inside the island's window as a
 * panel that grows out of the open deck, under its bar
 * (`components/island/settings/SettingsPanel.svelte`). There is no settings
 * window any more: the deck's gear toggles the panel, and the tray, the
 * companion's gear and "Make an agent" ask for it through `requestSettings`,
 * on a section when they know which one.
 *
 * The page holds one panel (`settingsPanel`); the companion's window opens the
 * island for it, holds it open while it shows, and draws the island for it
 * even while the robots are loose on the desktop.
 */

/** The panel's sections, in the rail's order. */
export const SETTINGS_SECTIONS = ['place', 'mascot', 'crew', 'brain', 'island', 'clipboard', 'focus', 'reminders', 'missions', 'permissions'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The section the panel shows first. */
export const FIRST_SECTION: SettingsSection = 'place';

/** The panel's height: the most it takes, and the least on a short screen. */
export const PANEL_HEIGHT = { most: 560, least: 320 };
/** The deck's bar the panel hangs under, and the air under it for its shadow. */
export const PANEL_ABOVE = 52;
export const PANEL_BELOW = 36;

/**
 * The panel's height on a screen `screenHeight` logical pixels tall (its work
 * area): decided before it shows, so it never changes as the window grows.
 */
export function panelHeight(screenHeight: number): number {
  const room = Number.isFinite(screenHeight) ? screenHeight - PANEL_ABOVE - PANEL_BELOW : PANEL_HEIGHT.most;
  return Math.max(PANEL_HEIGHT.least, Math.min(PANEL_HEIGHT.most, Math.floor(room)));
}

/** The island's window while the panel shows: the bar, the panel and its shadow. */
export function panelWindowHeight(screenHeight: number): number {
  return PANEL_ABOVE + panelHeight(screenHeight) + PANEL_BELOW;
}

export function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** The section after or before `from` in the rail, wrapping around: the arrow keys move along it. */
export function stepSection(from: SettingsSection, by: 1 | -1): SettingsSection {
  const at = SETTINGS_SECTIONS.indexOf(from);
  return SETTINGS_SECTIONS[(at + by + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length]!;
}

export class SettingsPanel {
  open = $state(false);
  /** The section shown: the last one picked, kept from one opening to the next. */
  section = $state<SettingsSection>(FIRST_SECTION);

  /** Opens on `section` when it names one, else on the last one shown. */
  show(section?: string | null): void {
    if (isSettingsSection(section)) this.section = section;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }

  /** The deck's gear: opens on the last section, or closes. */
  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  pick(section: SettingsSection): void {
    this.section = section;
  }
}

/** The page's panel. */
export const settingsPanel = new SettingsPanel();

type Request = (section: SettingsSection | null) => void;
let handler: Request | null = null;

/**
 * Asks the page for the panel, on `section` when it names one (anything else
 * opens the last section). The companion's window answers it (`App.svelte`):
 * it opens the island first. Without a page to answer, the panel opens alone.
 */
export function requestSettings(section?: string | null): void {
  const wanted = isSettingsSection(section) ? section : null;
  if (handler) handler(wanted);
  else settingsPanel.show(wanted);
}

/** The page answers the requests. Returns the function that stops it. */
export function answerSettings(next: Request): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}
