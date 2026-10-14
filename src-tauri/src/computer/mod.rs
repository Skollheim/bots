//! The computer's tabs of the island's deck: its numbers and power
//! (`system`), its Start menu apps (`apps`), a clipboard history kept in
//! memory (`clipboard`) and its wallpapers (`wallpaper`). Each command is the
//! companion's alone (`only_companion`) and each action that changes the
//! computer sits behind one small function of its module, which the page
//! calls only after the user confirmed it.
//!
//! Other systems than Windows answer with nothing: an empty list, no image,
//! or an error for an action. The one exception is `links`, which opens a web
//! link of the island's bar on macOS and Linux as well.

pub(crate) mod apps;
pub(crate) mod clipboard;
pub(crate) mod engine;
mod images;
pub(crate) mod links;
pub(crate) mod system;
pub(crate) mod wallpaper;

use crate::companion_window::only_companion;
use tauri::{AppHandle, Manager, State, Webview};

/// What the computer's tabs keep between two calls: the process sampler and
/// the clipboard's history.
#[derive(Default)]
pub struct ComputerState {
    pub(crate) system: system::Sampler,
    pub(crate) clipboard: clipboard::Clipboard,
}

/// Runs a job that blocks (COM, the disk, a dialog) off the command thread.
async fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|error| error.to_string())?
}

/// A NUL-terminated UTF-16 string for Windows.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// A UTF-16 buffer up to its first NUL.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn from_wide(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|&unit| unit == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

/// Where the icons and thumbnails are kept, made on first use.
fn cache_dir(app: &AppHandle, kind: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("deck").join(kind);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/// One reading: CPU, memory, fixed drives, uptime and the busiest processes.
#[tauri::command]
pub async fn computer_system(webview: Webview, state: State<'_, ComputerState>) -> Result<system::Sample, String> {
    only_companion(&webview)?;
    let sampler = state.system.clone();
    blocking(move || sampler.sample()).await
}

/// Closes a process of the last reading, if it is still the same one and not protected.
#[tauri::command]
pub async fn computer_close(webview: Webview, state: State<'_, ComputerState>, pid: u32, started: u64) -> Result<(), String> {
    only_companion(&webview)?;
    let sampler = state.system.clone();
    blocking(move || sampler.close(pid, started)).await
}

/// Locks, sleeps, restarts or shuts the computer down.
#[tauri::command]
pub async fn computer_power(webview: Webview, action: system::Power) -> Result<(), String> {
    only_companion(&webview)?;
    blocking(move || system::power(action)).await
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

/// The Start menu's apps, by name.
#[tauri::command]
pub async fn computer_apps(webview: Webview) -> Result<Vec<apps::App>, String> {
    only_companion(&webview)?;
    blocking(|| Ok(apps::list())).await
}

/// An app's icon as a small PNG `data:` URL, from the cache when it was made before.
#[tauri::command]
pub async fn computer_app_icon(app: AppHandle, webview: Webview, id: String) -> Result<Option<String>, String> {
    only_companion(&webview)?;
    let dir = cache_dir(&app, "icons")?;
    blocking(move || Ok(apps::icon(&dir, &id))).await
}

/// Opens an app of the Start menu, as a click on its shortcut would.
#[tauri::command]
pub async fn computer_app_open(webview: Webview, id: String) -> Result<(), String> {
    only_companion(&webview)?;
    blocking(move || apps::open(&id)).await
}

/// Opens a web link the user added to the island's bar, in the default browser; http and https only.
#[tauri::command]
pub async fn computer_link_open(webview: Webview, url: String) -> Result<(), String> {
    only_companion(&webview)?;
    blocking(move || links::open(&url)).await
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/// Starts or stops the clipboard's listener. Stopped, the history is
/// cleared; paused, the listener stays and records nothing.
#[tauri::command]
pub async fn computer_clipboard_watch(app: AppHandle, webview: Webview, state: State<'_, ComputerState>, listen: bool, paused: bool) -> Result<(), String> {
    only_companion(&webview)?;
    state.clipboard.watch(&app, listen, paused)
}

/// The history, newest first.
#[tauri::command]
pub async fn computer_clipboard_list(webview: Webview, state: State<'_, ComputerState>) -> Result<Vec<clipboard::Listed>, String> {
    only_companion(&webview)?;
    Ok(state.clipboard.listed())
}

/// Puts an entry back on the clipboard.
#[tauri::command]
pub async fn computer_clipboard_copy(app: AppHandle, webview: Webview, state: State<'_, ComputerState>, id: u64) -> Result<(), String> {
    only_companion(&webview)?;
    let clipboard = state.clipboard.clone();
    blocking(move || clipboard.copy(&app, id)).await
}

/// Forgets an entry, or every entry when `id` is null.
#[tauri::command]
pub async fn computer_clipboard_remove(app: AppHandle, webview: Webview, state: State<'_, ComputerState>, id: Option<u64>) -> Result<(), String> {
    only_companion(&webview)?;
    state.clipboard.remove(&app, id);
    Ok(())
}

/// An entry whole, for the chat: its text, or its image as a PNG `data:` URL.
#[tauri::command]
pub async fn computer_clipboard_item(webview: Webview, state: State<'_, ComputerState>, id: u64) -> Result<Option<clipboard::Item>, String> {
    only_companion(&webview)?;
    Ok(state.clipboard.item(id))
}

// ---------------------------------------------------------------------------
// Wallpaper
// ---------------------------------------------------------------------------

/// Windows' recent wallpapers and the one on the screens now.
#[tauri::command]
pub async fn computer_wallpapers(webview: Webview) -> Result<wallpaper::Wallpapers, String> {
    only_companion(&webview)?;
    blocking(|| Ok(wallpaper::wallpapers())).await
}

/// The images of a folder, by name.
#[tauri::command]
pub async fn computer_wallpaper_folder(webview: Webview, path: String) -> Result<wallpaper::Folder, String> {
    only_companion(&webview)?;
    blocking(move || wallpaper::folder(&path)).await
}

/// Asks for a folder with the system's dialog; null when the user cancels.
#[tauri::command]
pub async fn computer_wallpaper_pick(webview: Webview) -> Result<Option<String>, String> {
    only_companion(&webview)?;
    // The dialog belongs to the companion's window, above it.
    #[cfg(windows)]
    let owner = webview.window().hwnd().map(|hwnd| hwnd.0 as isize).unwrap_or_default();
    #[cfg(not(windows))]
    let owner = 0isize;
    blocking(move || wallpaper::pick(owner)).await
}

/// A small JPEG `data:` URL of an image, from the cache when it was made before.
#[tauri::command]
pub async fn computer_wallpaper_thumb(app: AppHandle, webview: Webview, path: String) -> Result<Option<String>, String> {
    only_companion(&webview)?;
    let dir = cache_dir(&app, "thumbs")?;
    blocking(move || Ok(wallpaper::thumb(&dir, &path))).await
}

/// Sets an image as the wallpaper of every screen; the wallpaper now.
#[tauri::command]
pub async fn computer_wallpaper_set(webview: Webview, path: String) -> Result<Option<String>, String> {
    only_companion(&webview)?;
    blocking(move || wallpaper::set(&path)).await
}

// ---------------------------------------------------------------------------
// Wallpaper Engine
// ---------------------------------------------------------------------------

/// Wallpaper Engine's wallpapers and whether it runs; null when it is not installed.
#[tauri::command]
pub async fn computer_engine(webview: Webview) -> Result<Option<engine::Engine>, String> {
    only_companion(&webview)?;
    blocking(|| Ok(engine::engine())).await
}

/// A Wallpaper Engine wallpaper's preview as a small JPEG `data:` URL, cached.
#[tauri::command]
pub async fn computer_engine_thumb(app: AppHandle, webview: Webview, id: String) -> Result<Option<String>, String> {
    only_companion(&webview)?;
    let dir = cache_dir(&app, "engine")?;
    blocking(move || Ok(engine::thumb(&dir, &id))).await
}

/// Applies a wallpaper of the listing, on one screen (from 0) or every screen (null).
#[tauri::command]
pub async fn computer_engine_apply(webview: Webview, id: String, monitor: Option<u32>) -> Result<(), String> {
    only_companion(&webview)?;
    blocking(move || engine::apply(&id, monitor)).await
}

/// The `project.json` of each screen's wallpaper, as Wallpaper Engine tells it.
#[tauri::command]
pub async fn computer_engine_current(webview: Webview) -> Result<Vec<String>, String> {
    only_companion(&webview)?;
    blocking(engine::current).await
}

/// Pauses, plays, mutes, unmutes or skips; or starts Wallpaper Engine.
#[tauri::command]
pub async fn computer_engine_control(webview: Webview, control: engine::Control) -> Result<(), String> {
    only_companion(&webview)?;
    blocking(move || engine::control(control)).await
}
