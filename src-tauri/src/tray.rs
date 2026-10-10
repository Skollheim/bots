//! The tray icon, its menu, the settings window and quitting.

use std::sync::{Mutex, PoisonError};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, Webview, WebviewUrl,
};

pub const SETTINGS_LABEL: &str = "settings";
pub const TRAY_ID: &str = "bots";

/// The tray menu's items and the settings window's title, kept so the page
/// can name them in its language.
struct Labels<R: Runtime> {
    tray: tauri::tray::TrayIcon<R>,
    settings: MenuItem<R>,
    quit: MenuItem<R>,
    title: Mutex<String>,
}

/// Quit: Bots stops with code 0, which Boite reads as stopped on purpose,
/// not as a crash to relaunch.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// Opens the settings window, or brings it forward when it is open.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        window.show()?;
        return window.set_focus();
    }
    let title = app.try_state::<Labels<R>>()
        .map(|labels| labels.title.lock().unwrap_or_else(PoisonError::into_inner).clone())
        .unwrap_or_else(|| "Bots settings".into());
    let query = crate::companion_window::demo_query();
    let page = if query.is_empty() { "index.html?view=settings".to_string() } else { format!("index.html?view=settings&{query}") };
    let window = tauri::WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App(page.into()))
        .title(title).inner_size(720.0, 760.0).min_inner_size(520.0, 480.0)
        .on_navigation(|url| matches!(url.scheme(), "tauri" | "http" | "https") && matches!(url.host_str(), Some("tauri.localhost") | Some("localhost")))
        .build()?;
    window.set_focus()
}

/// `companion://settings` from the companion: its settings, in their own window.
#[tauri::command]
pub async fn bots_settings(app: AppHandle, webview: Webview) -> Result<(), String> {
    crate::companion_window::only_companion(&webview)?;
    open_settings(&app).map_err(|error| error.to_string())
}

/// The tray is native and the sentences live in the page's catalogue: the
/// companion sends them at start and on every language change. English until
/// then.
#[tauri::command]
pub fn bots_tray_labels(app: AppHandle, webview: Webview, tooltip: String, settings: String, quit: String, title: String) -> Result<(), String> {
    crate::companion_window::only_companion(&webview)?;
    if [&tooltip, &settings, &quit, &title].iter().any(|label| label.trim().is_empty()) {
        return Err(format!("tray labels must not be empty: tooltip {tooltip:?}, settings {settings:?}, quit {quit:?}, title {title:?}"));
    }
    let Some(labels) = app.try_state::<Labels<tauri::Wry>>() else { return Ok(()) };
    labels.tray.set_tooltip(Some(tooltip)).map_err(|error| format!("the tray kept its tooltip: {error}"))?;
    labels.settings.set_text(settings).map_err(|error| format!("the tray's Settings item kept its label: {error}"))?;
    labels.quit.set_text(quit).map_err(|error| format!("the tray's Quit item kept its label: {error}"))?;
    *labels.title.lock().unwrap_or_else(PoisonError::into_inner) = title.clone();
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) { let _ = window.set_title(&title); }
    Ok(())
}

/// The tray: a click brings the companion forward; the menu has Settings and Quit.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let leave = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &leave])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Bots")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::companion_window::summon(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                if let Err(error) = open_settings(app) { eprintln!("[bots] the settings window did not open: {error}"); }
            }
            "quit" => quit(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    let tray = builder.build(app)?;
    app.manage(Labels { tray, settings, quit: leave, title: Mutex::new("Bots settings".into()) });
    Ok(())
}
