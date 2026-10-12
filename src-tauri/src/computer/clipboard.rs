//! The clipboard tab: a history of what the user copied, text and images,
//! kept in memory only (never written to disk, never logged, lost on quit),
//! the last 30. A message-only window hears each change
//! (`AddClipboardFormatListener`); what asks to be left out of clipboard
//! history (password managers) is skipped. An entry goes back on the
//! clipboard, or to the chat, only when the user clicks it.

// The history is heard and kept on Windows only; elsewhere these helpers stay unused.
#![cfg_attr(not(windows), allow(dead_code))]

use super::images::{self, Format, Pixels};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use tauri::{AppHandle, Emitter};

/// How many entries are kept.
pub(crate) const KEEP: usize = 30;
/// The images' bytes kept at most, the oldest images dropped first.
const IMAGE_BUDGET: usize = 96 * 1024 * 1024;
/// A text longer than this (in UTF-16 units) is not recorded.
const TEXT_MAX: usize = 1_000_000;
/// An image larger than this (in pixels) is not recorded.
const PIXELS_MAX: u64 = 40_000_000;
/// The preview of a text the list shows.
const PREVIEW: usize = 2_000;
/// The side of an image's thumbnail in the list.
const THUMB: u32 = 160;
/// The event the page hears the list on.
pub(crate) const EVENT: &str = "companion://clipboard";

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Content {
    Text(String),
    Image { png: Vec<u8>, width: u32, height: u32, thumb: String },
}

impl Content {
    fn bytes(&self) -> usize {
        match self {
            Content::Text(_) => 0,
            Content::Image { png, .. } => png.len(),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Entry {
    pub id: u64,
    pub content: Content,
    /// Milliseconds since 1970 when it was copied.
    pub at: u64,
}

/// An entry as the list shows it: a text's start, or an image's thumbnail.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Listed {
    pub id: u64,
    /// `text` or `image`.
    pub kind: &'static str,
    pub text: Option<String>,
    /// The text's length in characters.
    pub chars: usize,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
    pub at: u64,
}

/// An entry whole, for the chat.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub text: Option<String>,
    /// A PNG `data:` URL.
    pub image: Option<String>,
}

/// The entries, newest first.
#[derive(Default)]
pub(crate) struct History {
    entries: VecDeque<Entry>,
    next: u64,
}

impl History {
    /// Records what was copied; copied again, an entry moves to the top. Returns its id.
    pub(crate) fn push(&mut self, content: Content, at: u64) -> u64 {
        if let Some(index) = self.entries.iter().position(|entry| entry.content == content) {
            let mut entry = self.entries.remove(index).unwrap_or_else(|| unreachable!());
            entry.at = at;
            let id = entry.id;
            self.entries.push_front(entry);
            return id;
        }
        self.next += 1;
        self.entries.push_front(Entry { id: self.next, content, at });
        self.trim();
        self.next
    }

    /// Keeps the newest [`KEEP`], and the images within their budget (the newest always kept).
    fn trim(&mut self) {
        self.entries.truncate(KEEP);
        while self.entries.iter().map(|entry| entry.content.bytes()).sum::<usize>() > IMAGE_BUDGET {
            let Some(oldest) = self.entries.iter().skip(1).rposition(|entry| entry.content.bytes() > 0) else { break };
            self.entries.remove(oldest + 1);
        }
    }

    /// Moves an entry to the top (it was copied back); whether it was there.
    pub(crate) fn touch(&mut self, id: u64, at: u64) -> bool {
        let Some(index) = self.entries.iter().position(|entry| entry.id == id) else { return false };
        let mut entry = self.entries.remove(index).unwrap_or_else(|| unreachable!());
        entry.at = at;
        self.entries.push_front(entry);
        true
    }

    pub(crate) fn remove(&mut self, id: u64) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.id != id);
        self.entries.len() != before
    }

    pub(crate) fn clear(&mut self) { self.entries.clear(); }

    pub(crate) fn get(&self, id: u64) -> Option<&Entry> { self.entries.iter().find(|entry| entry.id == id) }

    pub(crate) fn listed(&self) -> Vec<Listed> {
        self.entries
            .iter()
            .map(|entry| match &entry.content {
                Content::Text(text) => Listed {
                    id: entry.id,
                    kind: "text",
                    text: Some(text.chars().take(PREVIEW).collect()),
                    chars: text.chars().count(),
                    width: 0,
                    height: 0,
                    thumb: None,
                    at: entry.at,
                },
                Content::Image { width, height, thumb, .. } => Listed {
                    id: entry.id,
                    kind: "image",
                    text: None,
                    chars: 0,
                    width: *width,
                    height: *height,
                    thumb: Some(thumb.clone()),
                    at: entry.at,
                },
            })
            .collect()
    }
}

/// Whether the clipboard asks to be left out: a password manager's
/// `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory`
/// at 0, or the older `Clipboard Viewer Ignore`.
pub(crate) fn excluded(exclude: bool, can_include: Option<u32>, ignore: bool) -> bool {
    exclude || ignore || can_include == Some(0)
}

/// A text worth recording: not blank, not too long.
pub(crate) fn worth(text: &str) -> bool { !text.trim().is_empty() && text.encode_utf16().count() <= TEXT_MAX }

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> { bytes.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]])) }
fn u32_at(bytes: &[u8], at: usize) -> Option<u32> { bytes.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])) }

/// A `CF_DIB`'s pixels: 24 or 32 bits, uncompressed (or with the usual
/// masks), rows from the bottom or the top. `None` for anything else.
pub(crate) fn dib_pixels(bytes: &[u8]) -> Option<Pixels> {
    const BI_RGB: u32 = 0;
    const BI_BITFIELDS: u32 = 3;
    let header = u32_at(bytes, 0)? as usize;
    if header < 40 { return None; }
    let width = u32_at(bytes, 4)? as i32;
    let raw_height = u32_at(bytes, 8)? as i32;
    let bits = u16_at(bytes, 14)?;
    let compression = u32_at(bytes, 16)?;
    let used = u32_at(bytes, 32)? as usize;
    if width <= 0 || raw_height == 0 || raw_height == i32::MIN || !(bits == 24 || bits == 32) { return None; }
    let masks_after = match compression {
        BI_RGB => 0,
        BI_BITFIELDS if bits == 32 => {
            // Right after a 40-byte header, or inside a V4/V5 one: offset 40 both ways.
            let at = 40;
            let masks = (u32_at(bytes, at)?, u32_at(bytes, at + 4)?, u32_at(bytes, at + 8)?);
            if masks != (0x00ff_0000, 0x0000_ff00, 0x0000_00ff) { return None; }
            if header == 40 { 12 } else { 0 }
        }
        _ => return None,
    };
    let (width, height) = (width as u32, raw_height.unsigned_abs());
    if u64::from(width) * u64::from(height) > PIXELS_MAX { return None; }
    let start = header + masks_after + used * 4;
    let stride = (width as usize * bits as usize).div_ceil(32) * 4;
    let data = bytes.get(start..start.checked_add(stride.checked_mul(height as usize)?)?)?;
    let step = bits as usize / 8;
    let mut bgra = Vec::with_capacity(width as usize * height as usize * 4);
    for row in 0..height as usize {
        // Positive height: the bottom row first.
        let source = if raw_height > 0 { height as usize - 1 - row } else { row };
        let line = &data[source * stride..source * stride + width as usize * step];
        for pixel in line.chunks_exact(step) {
            bgra.extend_from_slice(&[pixel[0], pixel[1], pixel[2], if step == 4 { pixel[3] } else { 255 }]);
        }
    }
    // Many apps leave the fourth byte at 0: then the image is opaque.
    if step == 4 && bgra.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 0) {
        for pixel in bgra.as_chunks_mut::<4>().0 { pixel[3] = 255; }
    }
    Some(Pixels { width, height, bgra })
}

/// Pixels as a `CF_DIB`: 32 bits, rows from the bottom.
pub(crate) fn dib_of(image: &Pixels) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(40 + image.bgra.len());
    bytes.extend_from_slice(&40u32.to_le_bytes());
    bytes.extend_from_slice(&(image.width as i32).to_le_bytes());
    bytes.extend_from_slice(&(image.height as i32).to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&32u16.to_le_bytes());
    bytes.extend_from_slice(&0u32.to_le_bytes());
    bytes.extend_from_slice(&(image.bgra.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&[0u8; 16]);
    let stride = image.width as usize * 4;
    for row in (0..image.height as usize).rev() { bytes.extend_from_slice(&image.bgra[row * stride..(row + 1) * stride]); }
    bytes
}

/// An image copied, made into an entry: kept as PNG, with its thumbnail.
fn image_content(pixels: &Pixels) -> Option<Content> {
    let png = images::encode(pixels, Format::Png)?;
    let small = images::shrink(pixels, THUMB);
    let thumb = images::data_url(Format::Png, &images::encode(&small, Format::Png)?);
    Some(Content::Image { png, width: pixels.width, height: pixels.height, thumb })
}

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |since| since.as_millis() as u64)
}

struct Shared {
    history: Mutex<History>,
    paused: AtomicBool,
    /// The clipboard's number after our own copy: that change is not recorded.
    own: AtomicU32,
}

impl Shared {
    fn history(&self) -> std::sync::MutexGuard<'_, History> { self.history.lock().unwrap_or_else(PoisonError::into_inner) }

    fn publish(&self, app: &AppHandle) {
        let listed = self.history().listed();
        let _ = app.emit_to(crate::companion_window::LABEL, EVENT, listed);
    }
}

/// The history and its listener.
#[derive(Clone)]
pub(crate) struct Clipboard {
    shared: Arc<Shared>,
    listener: Arc<Mutex<Option<imp::Listener>>>,
}

impl Default for Clipboard {
    fn default() -> Self {
        Clipboard {
            shared: Arc::new(Shared { history: Mutex::default(), paused: AtomicBool::new(false), own: AtomicU32::new(0) }),
            listener: Arc::default(),
        }
    }
}

impl Clipboard {
    fn listener(&self) -> std::sync::MutexGuard<'_, Option<imp::Listener>> { self.listener.lock().unwrap_or_else(PoisonError::into_inner) }

    /// Starts or stops listening; stopped, the history is forgotten.
    pub(crate) fn watch(&self, app: &AppHandle, listen: bool, paused: bool) -> Result<(), String> {
        self.shared.paused.store(paused, Ordering::SeqCst);
        let mut listener = self.listener();
        if listen {
            if listener.is_none() { *listener = Some(imp::Listener::start(app.clone(), self.shared.clone())?); }
        } else {
            if let Some(running) = listener.take() { running.stop(); }
            self.shared.history().clear();
            self.shared.publish(app);
        }
        Ok(())
    }

    pub(crate) fn listed(&self) -> Vec<Listed> { self.shared.history().listed() }

    /// Puts an entry back on the clipboard, and at the top of the list.
    pub(crate) fn copy(&self, app: &AppHandle, id: u64) -> Result<(), String> {
        let content = self.shared.history().get(id).map(|entry| entry.content.clone()).ok_or_else(|| "this entry is gone".to_owned())?;
        let owner = self.listener().as_ref().map(imp::Listener::window).ok_or_else(|| "the clipboard history is off".to_owned())?;
        let sequence = imp::put(owner, &content)?;
        self.shared.own.store(sequence, Ordering::SeqCst);
        if self.shared.history().touch(id, now()) { self.shared.publish(app); }
        Ok(())
    }

    /// Forgets an entry, or every entry when `id` is `None`.
    pub(crate) fn remove(&self, app: &AppHandle, id: Option<u64>) {
        match id {
            Some(id) => { self.shared.history().remove(id); }
            None => self.shared.history().clear(),
        }
        self.shared.publish(app);
    }

    pub(crate) fn item(&self, id: u64) -> Option<Item> {
        let history = self.shared.history();
        Some(match &history.get(id)?.content {
            Content::Text(text) => Item { text: Some(text.clone()), image: None },
            Content::Image { png, .. } => Item { text: None, image: Some(images::data_url(Format::Png, png)) },
        })
    }
}

#[cfg(windows)]
mod imp {
    use super::{dib_of, dib_pixels, excluded, image_content, now, worth, Content, Shared, PIXELS_MAX};
    use crate::computer::{images, wide};
    use std::cell::RefCell;
    use std::sync::atomic::Ordering;
    use std::sync::Arc;
    use tauri::AppHandle;
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::DataExchange::{
        AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, RemoveClipboardFormatListener, SetClipboardData,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::{CF_DIB, CF_UNICODETEXT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW, PostQuitMessage, RegisterClassW, HWND_MESSAGE, MSG,
        WM_CLIPBOARDUPDATE, WM_CLOSE, WM_DESTROY, WNDCLASSW,
    };

    thread_local! {
        /// The listener thread's app and history, for its window's procedure.
        static CONTEXT: RefCell<Option<(AppHandle, Arc<Shared>)>> = const { RefCell::new(None) };
    }

    /// The listener's window, as a number (a window handle is not `Send`).
    pub(crate) struct Listener {
        window: isize,
        thread: Option<std::thread::JoinHandle<()>>,
    }

    impl Listener {
        pub(crate) fn start(app: AppHandle, shared: Arc<Shared>) -> Result<Listener, String> {
            let (sender, receiver) = std::sync::mpsc::channel();
            let thread = std::thread::Builder::new()
                .name("bots-clipboard".into())
                .spawn(move || run(app, shared, sender))
                .map_err(|error| error.to_string())?;
            match receiver.recv() {
                Ok(Ok(window)) => Ok(Listener { window, thread: Some(thread) }),
                Ok(Err(error)) => Err(error),
                Err(_) => Err("the clipboard listener did not start".into()),
            }
        }

        pub(crate) fn window(&self) -> isize { self.window }

        pub(crate) fn stop(mut self) {
            // SAFETY: the window is the listener's; closing it ends its thread's loop.
            unsafe { PostMessageW(self.window as HWND, WM_CLOSE, 0, 0) };
            if let Some(thread) = self.thread.take() { let _ = thread.join(); }
        }
    }

    fn run(app: AppHandle, shared: Arc<Shared>, ready: std::sync::mpsc::Sender<Result<isize, String>>) {
        // The images are encoded here (WinRT).
        let _com = images::Com::mta();
        let class = wide("BotsClipboardListener");
        // SAFETY: the class name outlives the window; registering twice fails harmlessly.
        let window = unsafe {
            let instance = GetModuleHandleW(std::ptr::null());
            let mut kind: WNDCLASSW = std::mem::zeroed();
            kind.lpfnWndProc = Some(procedure);
            kind.hInstance = instance;
            kind.lpszClassName = class.as_ptr();
            RegisterClassW(&kind);
            CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE, std::ptr::null_mut(), instance, std::ptr::null())
        };
        if window.is_null() {
            let _ = ready.send(Err("the clipboard listener's window could not be made".into()));
            return;
        }
        // SAFETY: the window is this thread's.
        if unsafe { AddClipboardFormatListener(window) } == 0 {
            // SAFETY: as above.
            unsafe { DestroyWindow(window) };
            let _ = ready.send(Err("the clipboard could not be listened to".into()));
            return;
        }
        CONTEXT.with(|context| *context.borrow_mut() = Some((app, shared)));
        let _ = ready.send(Ok(window as isize));
        // SAFETY: a plain message loop for this thread's window, until WM_QUIT.
        unsafe {
            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 { DispatchMessageW(&message); }
        }
        CONTEXT.with(|context| context.borrow_mut().take());
    }

    unsafe extern "system" fn procedure(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match message {
            WM_CLIPBOARDUPDATE => {
                let context = CONTEXT.with(|context| context.borrow().clone());
                if let Some((app, shared)) = context { changed(window, &app, &shared); }
                0
            }
            WM_CLOSE => {
                // SAFETY: our window, on its thread.
                unsafe { DestroyWindow(window) };
                0
            }
            WM_DESTROY => {
                // SAFETY: as above.
                unsafe {
                    RemoveClipboardFormatListener(window);
                    PostQuitMessage(0);
                }
                0
            }
            // SAFETY: the default handling of the other messages.
            _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
        }
    }

    /// What was just copied, recorded unless it asks not to be or the history is paused.
    fn changed(window: HWND, app: &AppHandle, shared: &Shared) {
        if shared.paused.load(Ordering::SeqCst) { return; }
        // SAFETY: plain value.
        if unsafe { GetClipboardSequenceNumber() } == shared.own.load(Ordering::SeqCst) { return; }
        let Some(read) = read(window) else { return };
        let content = match read {
            Read::Text(text) => Content::Text(text),
            Read::Dib(bytes) => match dib_pixels(&bytes).and_then(|pixels| image_content(&pixels)) {
                Some(content) => content,
                None => return,
            },
        };
        shared.history().push(content, now());
        shared.publish(app);
    }

    enum Read {
        Text(String),
        Dib(Vec<u8>),
    }

    /// The clipboard opened, a few tries while another app holds it.
    fn open(window: HWND) -> bool {
        for _ in 0..10 {
            // SAFETY: plain values; closed by the caller.
            if unsafe { OpenClipboard(window) } != 0 { return true; }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        false
    }

    fn format(name: &str) -> u32 {
        let name = wide(name);
        // SAFETY: NUL-terminated, outlives the call.
        unsafe { RegisterClipboardFormatW(name.as_ptr()) }
    }

    /// A global memory block's bytes, copied.
    ///
    /// # Safety
    /// `handle` is a clipboard handle, the clipboard still open.
    unsafe fn bytes_of(handle: HANDLE, cap: usize) -> Option<Vec<u8>> {
        if handle.is_null() { return None; }
        // SAFETY: the caller's.
        unsafe {
            let size = GlobalSize(handle);
            if size == 0 || size > cap { return None; }
            let pointer = GlobalLock(handle) as *const u8;
            if pointer.is_null() { return None; }
            let bytes = std::slice::from_raw_parts(pointer, size).to_vec();
            GlobalUnlock(handle);
            Some(bytes)
        }
    }

    /// Reads the text, or else the image, unless the clipboard asks to be left out.
    fn read(window: HWND) -> Option<Read> {
        let (exclude, history, ignore) = (format("ExcludeClipboardContentFromMonitorProcessing"), format("CanIncludeInClipboardHistory"), format("Clipboard Viewer Ignore"));
        if !open(window) { return None; }
        // SAFETY: the clipboard is open until `CloseClipboard` below; handles are only read.
        let read = unsafe {
            let can_include = if IsClipboardFormatAvailable(history) != 0 {
                bytes_of(GetClipboardData(history), 64).and_then(|bytes| bytes.get(..4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])))
            } else {
                None
            };
            if excluded(IsClipboardFormatAvailable(exclude) != 0, can_include, IsClipboardFormatAvailable(ignore) != 0) {
                None
            } else if IsClipboardFormatAvailable(u32::from(CF_UNICODETEXT)) != 0 {
                bytes_of(GetClipboardData(u32::from(CF_UNICODETEXT)), (super::TEXT_MAX + 1) * 2).and_then(|bytes| {
                    let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|&pair| u16::from_le_bytes(pair)).take_while(|&unit| unit != 0).collect();
                    let text = String::from_utf16_lossy(&units);
                    worth(&text).then_some(Read::Text(text))
                })
            } else if IsClipboardFormatAvailable(u32::from(CF_DIB)) != 0 {
                bytes_of(GetClipboardData(u32::from(CF_DIB)), PIXELS_MAX as usize * 4 + 4096).map(Read::Dib)
            } else {
                None
            }
        };
        // SAFETY: opened above.
        unsafe { CloseClipboard() };
        read
    }

    /// Puts an entry on the clipboard; the clipboard's number after it.
    pub(crate) fn put(owner: isize, content: &Content) -> Result<u32, String> {
        let (format, bytes) = match content {
            Content::Text(text) => (u32::from(CF_UNICODETEXT), text.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect::<Vec<u8>>()),
            Content::Image { png, .. } => {
                let _com = images::Com::mta();
                (u32::from(CF_DIB), dib_of(&images::decode_png(png).ok_or_else(|| "the image could not be read back".to_owned())?))
            }
        };
        if !open(owner as HWND) { return Err("another app holds the clipboard".into()); }
        // SAFETY: the clipboard is open until `CloseClipboard`; the block is the clipboard's once set, freed here otherwise.
        let result = unsafe {
            EmptyClipboard();
            let block = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            let pointer = if block.is_null() { std::ptr::null_mut() } else { GlobalLock(block) as *mut u8 };
            if pointer.is_null() {
                if !block.is_null() { GlobalFree(block); }
                Err("no memory for the clipboard".to_owned())
            } else {
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer, bytes.len());
                GlobalUnlock(block);
                if SetClipboardData(format, block).is_null() {
                    GlobalFree(block);
                    Err("the clipboard did not take it".to_owned())
                } else {
                    Ok(GetClipboardSequenceNumber())
                }
            }
        };
        // SAFETY: opened above.
        unsafe { CloseClipboard() };
        result
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{Content, Shared};
    use std::sync::Arc;
    use tauri::AppHandle;

    pub(crate) struct Listener;

    impl Listener {
        pub(crate) fn start(_app: AppHandle, _shared: Arc<Shared>) -> Result<Listener, String> { Err("not on this system".into()) }
        pub(crate) fn window(&self) -> isize { 0 }
        pub(crate) fn stop(self) {}
    }

    pub(crate) fn put(_owner: isize, _content: &Content) -> Result<u32, String> { Err("not on this system".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> Content { Content::Text(value.into()) }

    fn image(byte: u8, size: usize) -> Content { Content::Image { png: vec![byte; size], width: 2, height: 2, thumb: "data:".into() } }

    #[test]
    fn the_newest_comes_first_and_a_copy_again_moves_up() {
        let mut history = History::default();
        let first = history.push(text("one"), 1);
        history.push(text("two"), 2);
        let again = history.push(text("one"), 3);
        assert_eq!(again, first, "the same entry");
        let listed = history.listed();
        assert_eq!(listed.iter().map(|entry| entry.text.clone().unwrap()).collect::<Vec<_>>(), vec!["one", "two"]);
        assert_eq!(listed[0].at, 3);
    }

    #[test]
    fn only_the_last_thirty_are_kept() {
        let mut history = History::default();
        for index in 0..40 { history.push(text(&format!("entry {index}")), index); }
        let listed = history.listed();
        assert_eq!(listed.len(), KEEP);
        assert_eq!(listed[0].text.as_deref(), Some("entry 39"));
        assert_eq!(listed[KEEP - 1].text.as_deref(), Some("entry 10"));
    }

    #[test]
    fn the_oldest_images_go_when_they_weigh_too_much() {
        let mut history = History::default();
        history.push(image(1, IMAGE_BUDGET / 2), 1);
        history.push(text("kept"), 2);
        history.push(image(2, IMAGE_BUDGET / 2), 3);
        history.push(image(3, IMAGE_BUDGET / 2), 4);
        let kinds: Vec<&str> = history.listed().iter().map(|entry| entry.kind).collect();
        assert_eq!(kinds, vec!["image", "image", "text"]);
        let mut alone = History::default();
        alone.push(image(9, IMAGE_BUDGET * 2), 1);
        assert_eq!(alone.listed().len(), 1, "the newest stays, however big");
    }

    #[test]
    fn entries_are_removed_cleared_and_touched() {
        let mut history = History::default();
        let one = history.push(text("one"), 1);
        let two = history.push(text("two"), 2);
        assert!(history.touch(one, 5));
        assert_eq!(history.listed()[0].id, one);
        assert!(history.remove(two));
        assert!(!history.remove(two));
        assert!(!history.touch(two, 6));
        history.clear();
        assert!(history.listed().is_empty());
        assert_eq!(history.push(text("three"), 7), 3, "ids are never reused");
    }

    #[test]
    fn a_long_text_is_previewed_and_counted() {
        let mut history = History::default();
        let long = "é".repeat(PREVIEW + 10);
        history.push(Content::Text(long), 1);
        let listed = &history.listed()[0];
        assert_eq!(listed.text.as_ref().unwrap().chars().count(), PREVIEW);
        assert_eq!(listed.chars, PREVIEW + 10);
    }

    #[test]
    fn what_asks_to_be_left_out_is() {
        assert!(excluded(true, None, false));
        assert!(excluded(false, Some(0), false));
        assert!(excluded(false, None, true));
        assert!(!excluded(false, Some(1), false));
        assert!(!excluded(false, None, false));
    }

    #[test]
    fn blank_and_huge_texts_are_not_recorded() {
        assert!(worth("hello"));
        assert!(!worth("  \r\n\t"));
        assert!(!worth(&"a".repeat(TEXT_MAX + 1)));
    }

    #[test]
    fn a_dib_reads_back_to_the_same_pixels() {
        let pixels = Pixels { width: 2, height: 2, bgra: vec![1, 2, 3, 255, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 0] };
        assert_eq!(dib_pixels(&dib_of(&pixels)), Some(pixels));
    }

    #[test]
    fn a_24_bit_bottom_up_dib_is_read_with_its_padding() {
        // 1 × 2, 24 bits: each row 3 bytes padded to 4, the bottom row first.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&40u32.to_le_bytes());
        bytes.extend_from_slice(&1i32.to_le_bytes());
        bytes.extend_from_slice(&2i32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&24u16.to_le_bytes());
        bytes.extend_from_slice(&[0u8; 24]);
        bytes.extend_from_slice(&[10, 20, 30, 0, 40, 50, 60, 0]);
        let pixels = dib_pixels(&bytes).unwrap();
        assert_eq!((pixels.width, pixels.height), (1, 2));
        assert_eq!(pixels.bgra, vec![40, 50, 60, 255, 10, 20, 30, 255]);
    }

    #[test]
    fn a_32_bit_dib_without_alpha_turns_opaque_and_odd_ones_are_refused() {
        let pixels = Pixels { width: 1, height: 1, bgra: vec![1, 2, 3, 0] };
        assert_eq!(dib_pixels(&dib_of(&pixels)).unwrap().bgra, vec![1, 2, 3, 255]);
        let mut bytes = dib_of(&pixels);
        bytes[14] = 8;
        assert_eq!(dib_pixels(&bytes), None, "8 bits");
        let mut bytes = dib_of(&pixels);
        bytes[16] = 1;
        assert_eq!(dib_pixels(&bytes), None, "compressed");
        assert_eq!(dib_pixels(&dib_of(&pixels)[..41]), None, "cut short");
        assert_eq!(dib_pixels(&[0u8; 8]), None);
    }

    #[test]
    fn a_dib_with_the_usual_masks_is_read() {
        let mut bytes = dib_of(&Pixels { width: 1, height: 1, bgra: vec![1, 2, 3, 4] });
        bytes[16] = 3;
        let pixel = bytes.split_off(40);
        for mask in [0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff] { bytes.extend_from_slice(&mask.to_le_bytes()); }
        bytes.extend_from_slice(&pixel);
        assert_eq!(dib_pixels(&bytes).unwrap().bgra, vec![1, 2, 3, 4]);
    }
}
