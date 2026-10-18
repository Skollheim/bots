//! The island: the companion's window against the top or the bottom edge of a
//! screen, on its left, its centre or its right (`Layout`, the place the user
//! picked), at the size the page asks for its state (collapsed, peek, open).
//! It is the same window as the desktop robots (`companion_window.rs`), so the
//! click-through, the pointer watch, the capture and the shortcut serve both;
//! the page says which of the two it draws by calling `island_place` or
//! `companion_place`.
//!
//! The window sits flush with the work area's edge and side: the page keeps
//! the island's margin from the side itself, so its shadow and halo have room.
//!
//! The island's place follows the screen: the watch asks `follow` twice a
//! second, and a work area that changed (a taskbar or top panel moved, a scale
//! changed, the screen unplugged) puts the window back at its place.
//!
//! While the user drags the island to another place, the window spans the
//! whole work area and takes every click (`island_span`), so the page can draw
//! the places it may go to and carry the island over them. The pointer taken
//! to another screen takes the span there (`follow_span`), so the island can
//! land on that screen's places. A span the page never ends, its button let
//! go long ago, is given up: the window goes back to the island's place.

use crate::companion_window::{monitor_name, only_companion, origin, pick_monitor, work_area, Area, Edge, Layout};
use serde::Serialize;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, Webview, WebviewWindow};

/// How close to the island's edge of a work area a robot dropped on the
/// desktop must be, in logical pixels from its centre, to go back into it.
pub const DOCK_REACH: f64 = 72.0;

/// How long a span may outlast the button: the island's landing takes well under it.
const SPAN_GIVE_UP: Duration = Duration::from_secs(3);

/// The island the page asked for: the screen, its place, and the window's logical size.
#[derive(Clone, Debug, PartialEq)]
struct Wanted { monitor: Option<String>, place: Layout, width: f64, height: f64 }

/// The window spans a screen's work area for a drag: which screen, and since
/// when no button is down.
struct Span { monitor: String, released: Option<Instant> }

/// What the island asked for last, where that put it, and the span of a drag.
#[derive(Default)]
pub struct IslandState {
    wanted: Mutex<Option<Wanted>>,
    placed: Mutex<Option<Frame>>,
    span: Mutex<Option<Span>>,
}

/// A window's place, `(x, y, width, height)` in physical pixels.
type Frame = (i32, i32, u32, u32);

/// Where the island went, for the page: the screen's name and its scale.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Placed { monitor: String, scale: f64 }

/// The island's window on a work area: `size` logical pixels at `scale`,
/// never wider or taller than the area, against the edge and on the side of `place`.
pub fn island_frame(area: Area, scale: f64, size: (f64, f64), place: Layout) -> Frame {
    let pixels = |value: f64, most: u32| ((value.max(1.0) * scale).round() as u32).min(most.max(1));
    let (width, height) = (pixels(size.0, area.2), pixels(size.1, area.3));
    let (x, top) = origin(area, width, place.align, 0);
    let y = match place.edge { Edge::Top => top, Edge::Bottom => top + (area.3 - height) as i32 };
    (x, y, width, height)
}

/// A robot dropped with its centre at `centre`, physical pixels, goes back
/// into the island when it is within `DOCK_REACH` of the island's edge of the
/// work area, on the island's side: anywhere along the edge for a centred
/// island, the left or the right half for one on a side.
pub fn docks(area: Area, scale: f64, centre: (i32, i32), place: Layout) -> bool {
    let reach = (DOCK_REACH * scale).round() as i32;
    let (left, top, width, height) = area;
    let (right, bottom) = (left.saturating_add(width as i32), top.saturating_add(height as i32));
    let middle = left + (width / 2) as i32;
    let (from, to) = match place.align {
        crate::companion_window::Anchor::Left => (left, middle),
        crate::companion_window::Anchor::Center => (left, right),
        crate::companion_window::Anchor::Right => (middle, right),
    };
    let along = centre.0 >= from && centre.0 < to;
    let near = match place.edge {
        Edge::Top => centre.1 >= top - reach && centre.1 < bottom.min(top + reach),
        Edge::Bottom => centre.1 < bottom + reach && centre.1 >= top.max(bottom - reach),
    };
    along && near
}

/// Which of `screens` (whole screens, physical pixels, as the system lays
/// them out: left of or above the primary one at negative coordinates, each
/// at its own scale) holds `point`, in physical pixels; the nearest one for a
/// point in a gap between them. None without screens.
pub fn screen_at(screens: &[Area], point: (i32, i32)) -> Option<usize> {
    let away = |&(left, top, width, height): &Area| {
        let gap = |at: i64, start: i64, length: i64| if at < start { start - at } else if at >= start + length { at - (start + length) + 1 } else { 0 };
        let (x, y) = (gap(point.0.into(), left.into(), width.into()), gap(point.1.into(), top.into(), height.into()));
        x * x + y * y
    };
    screens.iter().enumerate().min_by_key(|(_, screen)| away(screen)).map(|(index, _)| index)
}

fn whole(monitor: &Monitor) -> Area { (monitor.position().x, monitor.position().y, monitor.size().width, monitor.size().height) }

fn frame_for<R: Runtime>(window: &WebviewWindow<R>, wanted: &Wanted) -> tauri::Result<Option<(Frame, String, f64)>> {
    let Some(monitor) = pick_monitor(window, wanted.monitor.as_deref())? else { return Ok(None) };
    let scale = monitor.scale_factor();
    let frame = island_frame(work_area(&monitor), scale, (wanted.width, wanted.height), wanted.place);
    Ok(Some((frame, crate::companion_window::monitor_name(&monitor), scale)))
}

fn set_frame<R: Runtime>(window: &WebviewWindow<R>, frame: Frame) -> tauri::Result<()> {
    // Onto the screen first: a screen of another scale resizes the window as it arrives.
    window.set_position(PhysicalPosition::new(frame.0, frame.1))?;
    window.set_size(PhysicalSize::new(frame.2, frame.3))?;
    window.set_position(PhysicalPosition::new(frame.0, frame.1))
}

/// The drag over: the window takes clicks only over the page's areas again.
fn end_span<R: Runtime>(app: &AppHandle<R>) {
    *app.state::<IslandState>().span.lock().unwrap_or_else(PoisonError::into_inner) = None;
    crate::companion_window::take_every_click(app, false);
}

/// The page draws the robots on the desktop again: the island stops following the screen.
pub fn forget<R: Runtime>(app: &AppHandle<R>) {
    end_span(app);
    let state = app.state::<IslandState>();
    *state.wanted.lock().unwrap_or_else(PoisonError::into_inner) = None;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = None;
}

/// Called by the pointer watch: the island goes back to its place when the
/// screen under it changed. Nothing while the robots are on the desktop, or
/// while the island is being dragged.
pub fn follow<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let state = app.state::<IslandState>();
    if state.span.lock().unwrap_or_else(PoisonError::into_inner).is_some() { return; }
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

/// Puts the island at `place` (`top` or `bottom`, `left`, `center` or
/// `right`) of the screen named `monitor` (the primary one when null or
/// gone), `width` × `height` logical pixels. Ends a drag's span.
#[tauri::command]
pub async fn island_place(app: AppHandle, webview: Webview, monitor: Option<String>, place: Option<Layout>, width: f64, height: f64) -> Result<Option<Placed>, String> {
    only_companion(&webview)?;
    if !(width.is_finite() && height.is_finite()) { return Err("the island's size must be finite".into()); }
    let window = app.get_webview_window(crate::companion_window::LABEL).ok_or("the companion window is closed")?;
    let wanted = Wanted { monitor, place: place.unwrap_or_default(), width, height };
    end_span(&app);
    let state = app.state::<IslandState>();
    *state.wanted.lock().unwrap_or_else(PoisonError::into_inner) = Some(wanted.clone());
    let Some((frame, name, scale)) = frame_for(&window, &wanted).map_err(|error| error.to_string())? else { return Ok(None) };
    set_frame(&window, frame).map_err(|error| error.to_string())?;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = Some(frame);
    Ok(Some(Placed { monitor: name, scale }))
}

/// While the user drags the island to another place: with `span`, the window
/// covers the work area of the screen under the pointer, the island's, and
/// takes every click, and the answer is that screen; without, it goes back to
/// the island's place (a drag dropped where it began). A drag that picked a
/// new place ends with `island_place` instead.
#[tauri::command]
pub async fn island_span(app: AppHandle, webview: Webview, span: bool) -> Result<Option<Placed>, String> {
    only_companion(&webview)?;
    let window = app.get_webview_window(crate::companion_window::LABEL).ok_or("the companion window is closed")?;
    let state = app.state::<IslandState>();
    let Some(wanted) = state.wanted.lock().unwrap_or_else(PoisonError::into_inner).clone() else { return Ok(None) };
    if !span {
        end_span(&app);
        put_back(&window, &state, &wanted).map_err(|error| error.to_string())?;
        return Ok(None);
    }
    let pointed = monitor_under_pointer(&window).map_err(|error| error.to_string())?;
    let monitor = match pointed {
        Some(monitor) => monitor,
        None => match pick_monitor(&window, wanted.monitor.as_deref()).map_err(|error| error.to_string())? { Some(monitor) => monitor, None => return Ok(None) },
    };
    // Every click first, so the press carrying the island is not let through as the window grows.
    crate::companion_window::take_every_click(&app, true);
    let mut current = state.span.lock().unwrap_or_else(PoisonError::into_inner);
    span_over(&window, &state, &monitor).map_err(|error| error.to_string())?;
    *current = Some(Span { monitor: monitor_name(&monitor), released: None });
    Ok(Some(Placed { monitor: monitor_name(&monitor), scale: monitor.scale_factor() }))
}

/// The window back at the island's place.
fn put_back<R: Runtime>(window: &WebviewWindow<R>, state: &IslandState, wanted: &Wanted) -> tauri::Result<()> {
    let Some((frame, _, _)) = frame_for(window, wanted)? else { return Ok(()) };
    set_frame(window, frame)?;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = Some(frame);
    Ok(())
}

/// The window over `monitor`'s work area.
fn span_over<R: Runtime>(window: &WebviewWindow<R>, state: &IslandState, monitor: &Monitor) -> tauri::Result<()> {
    let area = work_area(monitor);
    set_frame(window, area)?;
    *state.placed.lock().unwrap_or_else(PoisonError::into_inner) = Some(area);
    Ok(())
}

/// The screen under the pointer, or the nearest one.
fn monitor_under_pointer<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<Option<Monitor>> {
    let cursor = window.cursor_position()?;
    let mut monitors = window.available_monitors()?;
    let screens: Vec<Area> = monitors.iter().map(whole).collect();
    Ok(screen_at(&screens, (cursor.x.round() as i32, cursor.y.round() as i32)).map(|index| monitors.swap_remove(index)))
}

/// Called by the pointer watch while the island is carried: the pointer on
/// another screen takes the span there, and tells the page the screen
/// (`companion://span`). A span whose button has been up for `SPAN_GIVE_UP`
/// lost its drag (the page missed the release): the window goes back to the
/// island's place and stops taking every click (`companion://span-lost`).
pub fn follow_span<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let state = app.state::<IslandState>();
    // Held while the window moves: `island_place` waits, so the place after it is not undone.
    let mut current = state.span.lock().unwrap_or_else(PoisonError::into_inner);
    let Some(span) = current.as_mut() else { return };
    if !crate::platform::mouse_down() {
        let released = *span.released.get_or_insert_with(Instant::now);
        if released.elapsed() < SPAN_GIVE_UP { return; }
        *current = None;
        drop(current);
        end_span(app);
        let wanted = state.wanted.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some(wanted) = wanted {
            if let Err(error) = put_back(window, &state, &wanted) { eprintln!("[bots] island span: {error}"); }
        }
        let _ = window.emit("companion://span-lost", ());
        return;
    }
    span.released = None;
    let Ok(Some(monitor)) = monitor_under_pointer(window) else { return };
    let name = monitor_name(&monitor);
    if name == span.monitor { return; }
    if let Err(error) = span_over(window, &state, &monitor) {
        eprintln!("[bots] island span: {error}");
        return;
    }
    span.monitor = name.clone();
    let _ = window.emit("companion://span", Placed { monitor: name, scale: monitor.scale_factor() });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::companion_window::Anchor;

    const fn at(edge: Edge, align: Anchor) -> Layout { Layout { align, edge } }
    const TOP: Layout = at(Edge::Top, Anchor::Center);

    #[test]
    fn the_island_hangs_centred_from_the_top_of_the_work_area() {
        // A 1080p screen, its taskbar at the bottom.
        assert_eq!(island_frame((0, 0, 1920, 1040), 1.0, (680.0, 480.0), TOP), (620, 0, 680, 480));
        // Scaled 150 %: the logical size grows in pixels, still centred.
        assert_eq!(island_frame((0, 0, 2560, 1400), 1.5, (680.0, 480.0), TOP), (770, 0, 1020, 720));
        // A screen left of the primary one, under a taskbar at its top.
        assert_eq!(island_frame((-2560, 48, 2560, 1392), 1.0, (360.0, 96.0), TOP), (-1460, 48, 360, 96));
        // A top panel on a screen above the primary one.
        assert_eq!(island_frame((0, -1032, 1920, 1032), 1.25, (360.0, 96.0), TOP), (735, -1032, 450, 120));
    }

    #[test]
    fn the_island_never_outgrows_its_screen() {
        assert_eq!(island_frame((0, 0, 800, 300), 2.0, (680.0, 480.0), TOP), (0, 0, 800, 300));
        assert_eq!(island_frame((100, 0, 1000, 700), 1.0, (0.0, -5.0), TOP), (599, 0, 1, 1));
        assert_eq!(island_frame((0, 0, 800, 300), 2.0, (680.0, 480.0), at(Edge::Bottom, Anchor::Right)), (0, 0, 800, 300));
    }

    #[test]
    fn the_island_sits_flush_with_the_edge_and_the_side_of_its_place() {
        // A 1080p screen, its taskbar at the bottom: the bottom places sit just above it.
        let area = (0, 0, 1920, 1040);
        let size = (940.0, 150.0);
        assert_eq!(island_frame(area, 1.0, size, at(Edge::Top, Anchor::Left)), (0, 0, 940, 150));
        assert_eq!(island_frame(area, 1.0, size, at(Edge::Top, Anchor::Right)), (980, 0, 940, 150));
        assert_eq!(island_frame(area, 1.0, size, at(Edge::Bottom, Anchor::Left)), (0, 890, 940, 150));
        assert_eq!(island_frame(area, 1.0, size, at(Edge::Bottom, Anchor::Center)), (490, 890, 940, 150));
        assert_eq!(island_frame(area, 1.0, size, at(Edge::Bottom, Anchor::Right)), (980, 890, 940, 150));
    }

    #[test]
    fn the_places_follow_a_taskbar_on_any_side_and_any_scale() {
        // Taskbar on the left, 62 px wide: the left places start past it.
        let left_bar = (62, 0, 1858, 1080);
        assert_eq!(island_frame(left_bar, 1.0, (940.0, 150.0), at(Edge::Top, Anchor::Left)), (62, 0, 940, 150));
        assert_eq!(island_frame(left_bar, 1.0, (940.0, 150.0), at(Edge::Bottom, Anchor::Right)), (980, 930, 940, 150));
        // Taskbar on the right: the right places stop before it.
        let right_bar = (0, 0, 1858, 1080);
        assert_eq!(island_frame(right_bar, 1.0, (940.0, 150.0), at(Edge::Top, Anchor::Right)), (918, 0, 940, 150));
        // Taskbar at the top of a 150 % screen left of the primary one: the top places hang under it, the bottom ones sit on the screen's foot.
        let top_bar = (-2880, 72, 2880, 1548);
        assert_eq!(island_frame(top_bar, 1.5, (940.0, 150.0), at(Edge::Top, Anchor::Center)), (-2145, 72, 1410, 225));
        assert_eq!(island_frame(top_bar, 1.5, (940.0, 150.0), at(Edge::Bottom, Anchor::Left)), (-2880, 1395, 1410, 225));
        assert_eq!(island_frame(top_bar, 1.5, (940.0, 150.0), at(Edge::Bottom, Anchor::Right)), (-1410, 1395, 1410, 225));
        // A 1366 px laptop at 125 %: the window is narrower than the deck's room, kept on the screen.
        let laptop = (0, 0, 1366, 728);
        assert_eq!(island_frame(laptop, 1.25, (940.0, 530.0), at(Edge::Top, Anchor::Right)), (191, 0, 1175, 663));
        assert_eq!(island_frame(laptop, 1.25, (940.0, 530.0), at(Edge::Bottom, Anchor::Left)), (0, 65, 1175, 663));
    }

    #[test]
    fn a_robot_dropped_near_the_top_edge_goes_back_into_the_island() {
        let area = (0, 40, 1920, 1000);
        assert!(docks(area, 1.0, (960, 60), TOP), "just under a top taskbar");
        assert!(docks(area, 1.0, (10, 40 + 71), TOP), "anywhere along the edge");
        assert!(!docks(area, 1.0, (960, 40 + 72), TOP), "a little lower stays on the desktop");
        assert!(docks(area, 2.0, (960, 40 + 140), TOP), "the reach scales with the screen");
        assert!(!docks(area, 1.0, (2000, 60), TOP), "on another screen");
        assert!(!docks((-1920, 0, 1920, 1080), 1.0, (100, 30), TOP), "the neighbour's top is not this one's");
    }

    #[test]
    fn a_robot_docks_near_the_edge_and_on_the_side_of_the_island() {
        // The taskbar at the bottom, the island at the bottom right.
        let area = (0, 0, 1920, 1040);
        let place = at(Edge::Bottom, Anchor::Right);
        assert!(docks(area, 1.0, (1700, 1000), place), "just above the taskbar, on the right");
        assert!(docks(area, 1.0, (1700, 1060), place), "dropped over the taskbar");
        assert!(!docks(area, 1.0, (1700, 1040 - 73), place), "a little higher stays on the desktop");
        assert!(!docks(area, 1.0, (400, 1000), place), "the left half is not the island's");
        assert!(!docks(area, 1.0, (1700, 30), place), "the top edge is not the island's");
        // The island at the top left of a 200 % screen left of the primary one, under a top taskbar.
        let area = (-3840, 96, 3840, 2064);
        let place = at(Edge::Top, Anchor::Left);
        assert!(docks(area, 2.0, (-3700, 96 + 143), place));
        assert!(!docks(area, 2.0, (-3700, 96 + 145), place));
        assert!(!docks(area, 2.0, (-1000, 120), place), "the right half");
        // A taskbar on the right: the right half ends before it.
        assert!(!docks((0, 0, 1858, 1080), 1.0, (1880, 20), at(Edge::Top, Anchor::Right)), "over the taskbar, off the work area");
    }

    #[test]
    fn the_screen_under_the_pointer_side_by_side() {
        // A 1440p screen at 125 % left of a 1080p primary one: the left one at negative x.
        let screens = [(0, 0, 1920, 1080), (-2560, 0, 2560, 1440)];
        assert_eq!(screen_at(&screens, (960, 540)), Some(0));
        assert_eq!(screen_at(&screens, (0, 0)), Some(0), "the primary's top left corner is its own");
        assert_eq!(screen_at(&screens, (-1, 0)), Some(1), "one pixel left is the neighbour's");
        assert_eq!(screen_at(&screens, (-2560, 1439)), Some(1));
        assert_eq!(screen_at(&screens, (-1280, 1300)), Some(1), "below the primary's foot, still on the taller screen");
        assert_eq!(screen_at(&screens, (1919, 1079)), Some(0));
        assert_eq!(screen_at(&[], (0, 0)), None);
    }

    #[test]
    fn the_screen_under_the_pointer_stacked_and_scaled() {
        // A 4K screen at 150 % above a 1080p primary at 100 %, a 1366 px laptop at 125 % right of the primary.
        let screens = [(0, 0, 1920, 1080), (-960, -2160, 3840, 2160), (1920, 200, 1366, 768)];
        assert_eq!(screen_at(&screens, (100, -1)), Some(1), "just above the primary");
        assert_eq!(screen_at(&screens, (-900, -2160)), Some(1));
        assert_eq!(screen_at(&screens, (100, 1079)), Some(0));
        assert_eq!(screen_at(&screens, (1920, 500)), Some(2), "the laptop's left edge");
        assert_eq!(screen_at(&screens, (3285, 967)), Some(2), "the laptop's last pixel");
    }

    #[test]
    fn a_pointer_in_a_gap_takes_the_nearest_screen() {
        // The laptop lower than the primary: a gap above it, right of the primary.
        let screens = [(0, 0, 1920, 1080), (1920, 200, 1366, 768)];
        assert_eq!(screen_at(&screens, (1925, 50)), Some(0), "just right of the primary, far above the laptop");
        assert_eq!(screen_at(&screens, (2600, 100)), Some(1), "just above the laptop, far right of the primary");
        assert_eq!(screen_at(&screens, (1921, 190)), Some(0), "2 px right of the primary, 10 px above the laptop");
        assert_eq!(screen_at(&screens, (1921, 199)), Some(1), "2 px right of the primary, 1 px above the laptop");
        assert_eq!(screen_at(&screens, (-50, 500)), Some(0), "left of everything");
    }

    #[test]
    fn the_pointer_over_a_taskbar_is_on_its_screen() {
        // The screens are whole, the taskbar included: over a 62 px taskbar on the left of the second screen is that screen.
        let screens = [(0, 0, 1920, 1080), (1920, 0, 2560, 1440)];
        assert_eq!(screen_at(&screens, (1930, 700)), Some(1));
        // A taskbar at the bottom of the primary, the pointer over it.
        assert_eq!(screen_at(&screens, (900, 1060)), Some(0));
    }
}
