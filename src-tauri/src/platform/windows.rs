//! Windows: the topmost band, the mouse buttons and the session's idle time.

/// How long the interactive session has gone without a key or a mouse move.
/// The lock screen gives no input to this session, so a locked PC counts up.
pub(crate) fn idle_ms() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: cbSize names the structure the call fills, which outlives it.
    if unsafe { GetLastInputInfo(&mut info) } == 0 { return None; }
    // SAFETY: no arguments. Both clocks wrap after 49.7 days, the difference does not.
    Some(u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime)))
}

/// Puts `window` back at the top of the topmost band without taking focus.
/// Tao applies `always_on_top` only when its own flag changes, so a window
/// another topmost window or a full-screen app went over stays under them;
/// this call is the one that lifts it again.
pub(crate) fn keep_on_top<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
    };
    let Ok(hwnd) = window.hwnd() else { return };
    // SAFETY: the handle is this live window's; the call keeps no pointer.
    unsafe { SetWindowPos(hwnd.0, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER) };
}

/// Whether a mouse button is down anywhere on the desktop, whichever window
/// gets the click. Both buttons count, so a swapped mouse reads the same.
pub(crate) fn mouse_down() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    // SAFETY: no pointer; the high bit is the button's current state.
    unsafe { (GetAsyncKeyState(i32::from(VK_LBUTTON)) as u16 & 0x8000) != 0 || (GetAsyncKeyState(i32::from(VK_RBUTTON)) as u16 & 0x8000) != 0 }
}
