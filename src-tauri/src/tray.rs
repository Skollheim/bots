//! The tray icon, its menu, opening the settings and quitting.
//!
//! The settings have no window of their own: they are a panel of the island,
//! in the companion's window (`components/island/settings/`). Settings brings
//! that window forward and asks its page for the panel (`companion://settings`).

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, Webview,
};

pub const TRAY_ID: &str = "bots";
/// The longest section name the page may ask the panel to open on.
const SECTION_MAX: usize = 24;

/// The tray menu's items, kept so the page can name them in its language.
struct Labels<R: Runtime> {
    tray: tauri::tray::TrayIcon<R>,
    settings: MenuItem<R>,
    quit: MenuItem<R>,
}

/// Quit: Bots stops with code 0, which Boite reads as stopped on purpose,
/// not as a crash to relaunch.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// A section the page may name: a short lowercase word. The page knows its
/// sections (`lib/island/settings-panel.svelte.ts`) and opens the last one
/// shown on any name it does not.
fn is_section(name: &str) -> bool {
    !name.is_empty() && name.len() <= SECTION_MAX && name.bytes().all(|byte| byte.is_ascii_lowercase())
}

/// The companion's window comes forward with the keyboard and opens its
/// settings panel, on `section` when one is named.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>, section: Option<&str>) -> tauri::Result<()> {
    let Some(window) = crate::companion_window::bring_forward(app) else { return Ok(()) };
    window.emit("companion://settings", section)
}

/// The companion asks for its settings panel, on a section or the last one shown.
#[tauri::command]
pub async fn bots_settings(app: AppHandle, webview: Webview, section: Option<String>) -> Result<(), String> {
    crate::companion_window::only_companion(&webview)?;
    if let Some(name) = section.as_deref().filter(|name| !is_section(name)) {
        return Err(format!("{name:?} is not a settings section"));
    }
    open_settings(&app, section.as_deref()).map_err(|error| error.to_string())
}

/// The tray is native and the sentences live in the page's catalogue: the
/// companion sends them at start and on every language change. English until
/// then.
#[tauri::command]
pub fn bots_tray_labels(app: AppHandle, webview: Webview, tooltip: String, settings: String, quit: String) -> Result<(), String> {
    crate::companion_window::only_companion(&webview)?;
    if [&tooltip, &settings, &quit].iter().any(|label| label.trim().is_empty()) {
        return Err(format!("tray labels must not be empty: tooltip {tooltip:?}, settings {settings:?}, quit {quit:?}"));
    }
    let Some(labels) = app.try_state::<Labels<tauri::Wry>>() else { return Ok(()) };
    labels.tray.set_tooltip(Some(tooltip)).map_err(|error| format!("the tray kept its tooltip: {error}"))?;
    labels.settings.set_text(settings).map_err(|error| format!("the tray's Settings item kept its label: {error}"))?;
    labels.quit.set_text(quit).map_err(|error| format!("the tray's Quit item kept its label: {error}"))?;
    Ok(())
}

/// The tray: a click brings the companion forward; the menu has Settings and Quit.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let leave = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &leave])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("B.O.T.S")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::companion_window::summon(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                if let Err(error) = open_settings(app, None) { eprintln!("[bots] the settings did not open: {error}"); }
            }
            "quit" => quit(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    let tray = builder.build(app)?;
    app.manage(Labels { tray, settings, quit: leave });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_section_is_a_short_lowercase_word() {
        for name in ["place", "crew", "permissions"] {
            assert!(is_section(name), "{name}");
        }
        for name in ["", "Crew", "crew settings", "../crew", "brain-model", "a".repeat(SECTION_MAX + 1).as_str()] {
            assert!(!is_section(name), "{name:?}");
        }
    }
}
