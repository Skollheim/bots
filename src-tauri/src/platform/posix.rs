//! macOS and Linux: what the companion can read of the desktop there.

/// The OS gives no session-wide idle time Bots can read everywhere here.
pub(crate) fn idle_ms() -> Option<u64> { None }

/// Asks again for the topmost band; the window manager may still decline.
pub(crate) fn keep_on_top<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_always_on_top(true);
}

/// No portable way to see a click given to another application: never.
pub(crate) fn mouse_down() -> bool {
    false
}

/// WebKitGTK's DMA-BUF renderer paints an empty window on the NVIDIA
/// proprietary driver. A user who set the variable either way keeps his choice.
pub(crate) fn before_webview() {
    if cfg!(target_os = "linux") && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && std::path::Path::new("/proc/driver/nvidia/version").exists() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
