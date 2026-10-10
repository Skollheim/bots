//! OS integration. Window orchestration and IPC authorization stay outside it.
//! Ported from Boite's `apps/shell/src-tauri/src/platform/` at c4a8b0f7: only
//! what the companion uses.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub(crate) use windows::{idle_ms, keep_on_top, mouse_down};
#[cfg(not(windows))]
mod posix;
#[cfg(not(windows))]
pub(crate) use posix::{before_webview, idle_ms, keep_on_top, mouse_down};

/// WebView2 needs nothing set before its first webview.
#[cfg(windows)]
pub(crate) fn before_webview() {}

pub(crate) mod desktop;
pub(crate) mod games;
pub(crate) mod media;
pub(crate) mod region;
