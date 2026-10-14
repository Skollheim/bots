import { afterEach, expect, test, vi } from 'vitest';
import { answerSettings, FIRST_SECTION, isSettingsSection, PANEL_ABOVE, PANEL_BELOW, PANEL_HEIGHT, panelHeight, panelWindowHeight, requestSettings, SETTINGS_SECTIONS, SettingsPanel, settingsPanel, stepSection } from './settings-panel.svelte';

afterEach(() => {
  settingsPanel.close();
  settingsPanel.pick(FIRST_SECTION);
});

test('the gear opens the panel on the last section shown, and closes it', () => {
  const panel = new SettingsPanel();
  expect(panel.open).toBe(false);
  panel.toggle();
  expect(panel.open).toBe(true);
  expect(panel.section).toBe(FIRST_SECTION);
  panel.pick('focus');
  panel.toggle();
  expect(panel.open).toBe(false);
  panel.toggle();
  expect(panel.section).toBe('focus');
});

test('a request names a section, or keeps the last one when it names none it knows', () => {
  const panel = new SettingsPanel();
  panel.show('crew');
  expect(panel.section).toBe('crew');
  panel.close();
  panel.show('nowhere');
  expect([panel.open, panel.section]).toEqual([true, 'crew']);
  panel.show(null);
  expect(panel.section).toBe('crew');
});

test('the sections are the rail, the arrows move along it and wrap', () => {
  expect(SETTINGS_SECTIONS[0]).toBe(FIRST_SECTION);
  expect(SETTINGS_SECTIONS).toHaveLength(10);
  expect(isSettingsSection('brain')).toBe(true);
  expect(isSettingsSection('Brain')).toBe(false);
  expect(isSettingsSection(3)).toBe(false);
  expect(stepSection('place', 1)).toBe('mascot');
  expect(stepSection('place', -1)).toBe('permissions');
  expect(stepSection('permissions', 1)).toBe('place');
});

test('the page answers the requests; without it the panel opens alone', () => {
  requestSettings('missions');
  expect([settingsPanel.open, settingsPanel.section]).toEqual([true, 'missions']);
  settingsPanel.close();

  const heard = vi.fn();
  const stop = answerSettings(heard);
  requestSettings('crew');
  requestSettings('bogus');
  expect(heard.mock.calls).toEqual([['crew'], [null]]);
  expect(settingsPanel.open).toBe(false);
  stop();
  requestSettings();
  expect(settingsPanel.open).toBe(true);
});

test('a stale stop leaves the newer answer in place', () => {
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = answerSettings(first);
  const stopSecond = answerSettings(second);
  stopFirst();
  requestSettings('island');
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith('island');
  stopSecond();
});

test('the panel takes its full height on a usual screen, less on a short one, and keeps a floor', () => {
  expect(panelHeight(1040)).toBe(PANEL_HEIGHT.most);
  expect(panelHeight(728)).toBe(PANEL_HEIGHT.most);
  expect(panelHeight(600)).toBe(600 - PANEL_ABOVE - PANEL_BELOW);
  expect(panelHeight(300)).toBe(PANEL_HEIGHT.least);
  expect(panelHeight(Number.NaN)).toBe(PANEL_HEIGHT.most);
  expect(panelWindowHeight(1040)).toBe(PANEL_ABOVE + PANEL_HEIGHT.most + PANEL_BELOW);
});
