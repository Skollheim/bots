//! Bots: Boite's desktop companion, as its own app. Boite starts it with the
//! core's address and the owner's token in the environment; started by hand,
//! it finds the core the way Boite's CLI does. Nothing here but the windows,
//! the tray and what the companion reads of the desktop: everything the
//! robots say and do lives in the page and in Boite's core.

#[cfg(test)]
mod acl;
mod companion_window;
mod endpoint;
mod island;
mod platform;
mod tray;

// Tauri links its manifest into binaries, but not the library test executable.
#[cfg(all(test, target_os = "windows"))]
#[link(name = "resource", kind = "static", modifiers = "-bundle")]
unsafe extern "C" {}

use tauri::Webview;

/// Bots's own pages, the companion and its settings: the only ones that may
/// ask for the core's token or list the screens.
pub(crate) fn only_bots(webview: &Webview) -> Result<(), String> {
    match webview.label() {
        companion_window::LABEL | tray::SETTINGS_LABEL => Ok(()),
        other => Err(format!("the webview {other:?} may not invoke this command")),
    }
}

// One expansion: on macOS generate_context also embeds the application plist.
fn bots_context<R: tauri::Runtime>() -> tauri::Context<R> {
    tauri::generate_context!()
}

pub fn run() {
    platform::before_webview();
    let app = tauri::Builder::default()
        // First: a second launch hands over to this one before anything opens.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| companion_window::summon(app)))
        .manage(companion_window::CompanionState::default())
        .manage(island::IslandState::default())
        .invoke_handler(tauri::generate_handler![
            endpoint::core_endpoint,
            companion_window::companion_monitors,
            companion_window::companion_place,
            companion_window::companion_hit_rects,
            companion_window::companion_media,
            companion_window::companion_media_control,
            companion_window::companion_configure,
            companion_window::companion_drag,
            companion_window::companion_capture,
            companion_window::companion_cover,
            companion_window::companion_focus,
            companion_window::companion_keep,
            island::island_place,
            tray::bots_settings,
            tray::bots_tray_labels,
        ])
        .setup(|app| {
            let handle = app.handle();
            // Bots works without a tray: the shortcut and a second launch still
            // bring the companion forward, and Boite stops it when it stops.
            if let Err(error) = tray::build_tray(handle) {
                eprintln!("[bots] the tray icon could not be created: {error}");
            }
            companion_window::open(handle)?;
            Ok(())
        })
        .build(bots_context());
    let app = match app {
        Ok(app) => app,
        // A broken WebView install, say. A non-zero code: Boite tries again later.
        Err(error) => {
            eprintln!("[bots] Bots could not start: {error}");
            std::process::exit(1);
        }
    };
    app.run(|_app, event| {
        // The settings window closing leaves the companion: Bots stops on Quit
        // alone, or when Boite stops it.
        if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event { api.prevent_exit(); }
    });
}
