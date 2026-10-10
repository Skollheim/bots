//! The island: the companion's window hanging from the top edge of a screen,
//! centred, at the size the page asks for its state (collapsed, peek, open).
//! It is the same window as the desktop robots (`companion_window.rs`), so the
//! click-through, the pointer watch, the capture and the shortcut serve both;
//! the page says which of the two it draws by calling `island_place` or
//! `companion_place`.
//!
//! The island's place follows the screen: the watch asks `follow` twice a
//! second, and a work area that changed (a taskbar or top panel moved, a scale
//! changed, the screen unplugged) puts the window back at the top centre.

use crate::companion_window::{only_companion, pick_monitor, work_area, Area};
use serde::Serialize;
use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, Webview, WebviewWindow};

/// How close to the top of a work area a robot dropped on the desktop must be,
/// in logical pixels from its centre, to go back into the island.
pub const DOCK_REACH: f64 = 72.0;

/// The island the page asked for: the screen, and the window's logical size.
#[derive(Clone, Debug, PartialEq)]
struct Wanted { monitor: Option<String>, width: f64, height: f64 }

/// What the island asked for last, and where that put it.
#[derive(Default)]
pub struct IslandState {
    wanted: Mutex<Option<Wanted>>,
    placed: Mutex<Option<Frame>>,
}

/// A window's place, `(x, y, width, height)` in physical pixels.
type Frame = (i32, i32, u32, u32);

/// Where the island went, for the page: the screen's name and its scale.
#[derive(Serialize, Debug, PartialEq)]
pub struct Placed { monitor: String, scale: f64 }

/// The island's window on a work area: `size` logical pixels at `scale`,
/// never wider or taller than the area, centred and against its top edge.
pub fn island_frame(area: Area, scale: f64, size: (f64, f64)) -> Frame {
    let pixels = |value: f64, most: u32| ((value.max(1.0) * scale).round() as u32).min(most.max(1));
    let (width, height) = (pixels(size.0, area.2), pixels(size.1, area.3));
    (area.0 + (area.2 - width) as i32 / 2, area.1, width, height)
}

/// A robot dropped with its centre at `centre`, physical pixels, goes back
/// into the island when it is within `DOCK_REACH` of the work area's top edge.
pub fn docks(area: Area, scale: f64, centre: (i32, i32)) -> bool {
    let reach = (DOCK_REACH * scale).round() as i32;
    let (left, top, width, height) = area;
    centre.0 >= left && centre.0 < left + width as i32 && centre.1 >= top - reach && centre.1 < top.saturating_add(height as i32).min(top + reach)
}

fn frame_for<R: Runtime>(window: &WebviewWindow<R>, wanted: &Wanted) -> tauri::Result<Option<(Frame, String, f64)>> {
    let Some(monitor) = pick_monitor(window, wanted.monitor.as_deref())? else { return Ok(None) };
    let scale = monitor.scale_factor();
    let frame = island_frame(work_area(&monitor), scale, (wanted.width, wanted.height));
    Ok(Some((frame, crate::companion_window::monitor_name(&monitor), scale)))
}

fn set_frame<R: Runtime>(window: &WebviewWindow<R>, frame: Frame) -> tauri::Result<()> {
    // Onto the screen first: a screen of another scale resizes the window as it arrives.
    window.set_position(PhysicalPosition::new(frame.0, frame.1))?;
    window.set_size(PhysicalSize::new(frame.2, frame.3))?;
    window.set_position(PhysicalPosition::new(frame.0, frame.1))
}

/// The page draws the robots on the desktop again: the island stops following the screen.
pub fn forget<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<IslandState>();
    *state.wanted.lock().unwrap_or_else(PoisonError::into_inner) = None;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = None;
}

/// Called by the pointer watch: the island goes back to the top centre when
/// the screen under it changed. Nothing while the robots are on the desktop.
pub fn follow<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let state = app.state::<IslandState>();
    let Some(wanted) = state.wanted.lock().unwrap_or_else(PoisonError::into_inner).clone() else { return };
    let Ok(Some((frame, _, _))) = frame_for(window, &wanted) else { return };
    let mut placed = state.placed.lock().unwrap_or_else(PoisonError::into_inner);
    if *placed == Some(frame) { return; }
    if let Err(error) = set_frame(window, frame) {
        eprintln!("[bots] island follow: {error}");
        return;
    }
    *placed = Some(frame);
}

/// Hangs the island from the top edge of the screen named `monitor` (the
/// primary one when null or gone), `width` × `height` logical pixels.
#[tauri::command]
pub async fn island_place(app: AppHandle, webview: Webview, monitor: Option<String>, width: f64, height: f64) -> Result<Option<Placed>, String> {
    only_companion(&webview)?;
    if !(width.is_finite() && height.is_finite()) { return Err("the island's size must be finite".into()); }
    let window = app.get_webview_window(crate::companion_window::LABEL).ok_or("the companion window is closed")?;
    let wanted = Wanted { monitor, width, height };
    let state = app.state::<IslandState>();
    *state.wanted.lock().unwrap_or_else(PoisonError::into_inner) = Some(wanted.clone());
    let Some((frame, name, scale)) = frame_for(&window, &wanted).map_err(|error| error.to_string())? else { return Ok(None) };
    set_frame(&window, frame).map_err(|error| error.to_string())?;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = Some(frame);
    Ok(Some(Placed { monitor: name, scale }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_island_hangs_centred_from_the_top_of_the_work_area() {
        // A 1080p screen, its taskbar at the bottom.
        assert_eq!(island_frame((0, 0, 1920, 1040), 1.0, (680.0, 480.0)), (620, 0, 680, 480));
        // Scaled 150 %: the logical size grows in pixels, still centred.
        assert_eq!(island_frame((0, 0, 2560, 1400), 1.5, (680.0, 480.0)), (770, 0, 1020, 720));
        // A screen left of the primary one, under a taskbar at its top.
        assert_eq!(island_frame((-2560, 48, 2560, 1392), 1.0, (360.0, 96.0)), (-1460, 48, 360, 96));
        // A top panel on a screen above the primary one.
        assert_eq!(island_frame((0, -1032, 1920, 1032), 1.25, (360.0, 96.0)), (735, -1032, 450, 120));
    }

    #[test]
    fn the_island_never_outgrows_its_screen() {
        assert_eq!(island_frame((0, 0, 800, 300), 2.0, (680.0, 480.0)), (0, 0, 800, 300));
        assert_eq!(island_frame((100, 0, 1000, 700), 1.0, (0.0, -5.0)), (599, 0, 1, 1));
    }

    #[test]
    fn a_robot_dropped_near_the_top_edge_goes_back_into_the_island() {
        let area = (0, 40, 1920, 1000);
        assert!(docks(area, 1.0, (960, 60)), "just under a top taskbar");
        assert!(docks(area, 1.0, (10, 40 + 71)), "anywhere along the edge");
        assert!(!docks(area, 1.0, (960, 40 + 72)), "a little lower stays on the desktop");
        assert!(docks(area, 2.0, (960, 40 + 140)), "the reach scales with the screen");
        assert!(!docks(area, 1.0, (2000, 60)), "on another screen");
        assert!(!docks((-1920, 0, 1920, 1080), 1.0, (100, 30)), "the neighbour's top is not this one's");
    }
}
