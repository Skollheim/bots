//! The wallpaper tab: Windows' recent wallpapers (the registry's history), a
//! folder the user picks, small thumbnails made by the shell and cached, and
//! the one function that sets the wallpaper of every screen.

use serde::Serialize;
use std::path::Path;

/// The thumbnails' longest side in pixels.
const THUMB: u32 = 320;
/// The images of a folder listed at most.
const FOLDER_MAX: usize = 500;
/// Where Windows keeps its recent wallpapers.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) const HISTORY_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers";

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Wallpapers {
    pub recent: Vec<String>,
    /// The wallpaper on the screens now.
    pub current: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub images: Vec<String>,
    /// How many images the folder has, beyond those listed too.
    pub count: usize,
}

const IMAGE: &[&str] = &["jpg", "jpeg", "jpe", "jfif", "png", "bmp", "dib", "gif", "tif", "tiff", "webp", "heic", "heif", "avif", "wdp", "jxr"];

/// A file Windows can show as a wallpaper, by its extension.
pub(crate) fn is_image(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| IMAGE.iter().any(|known| ext.eq_ignore_ascii_case(known)))
}

/// The registry's history in order, each path once whatever its case, blanks dropped.
pub(crate) fn history_of(values: Vec<Option<String>>) -> Vec<String> {
    let mut recent: Vec<String> = Vec::new();
    for value in values.into_iter().flatten() {
        let value = value.trim().to_owned();
        if value.is_empty() || recent.iter().any(|known| same_path(known, &value)) { continue; }
        recent.push(value);
    }
    recent
}

pub(crate) fn same_path(a: &str, b: &str) -> bool {
    a.replace('/', "\\").trim_end_matches('\\').eq_ignore_ascii_case(b.replace('/', "\\").trim_end_matches('\\'))
}

/// The images of a folder (not its subfolders), by name.
pub(crate) fn folder(path: &str) -> Result<Folder, String> {
    let dir = Path::new(path);
    if !dir.is_absolute() || !dir.is_dir() { return Err("this folder is gone".into()); }
    let mut images: Vec<String> = std::fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .filter(|file| is_image(file))
        .map(|file| file.to_string_lossy().into_owned())
        .collect();
    images.sort_by_key(|file| file.to_lowercase());
    let count = images.len();
    images.truncate(FOLDER_MAX);
    Ok(Folder { path: path.to_owned(), images, count })
}

/// A file the page may ask a thumbnail of, or set: an image that exists.
pub(crate) fn usable(path: &str) -> bool {
    let file = Path::new(path);
    file.is_absolute() && is_image(file) && file.is_file()
}

/// The recent wallpapers that still exist, and the current one.
pub(crate) fn wallpapers() -> Wallpapers {
    let recent = history_of((0..5).map(imp::history).collect()).into_iter().filter(|path| Path::new(path).is_file()).collect();
    Wallpapers { recent, current: imp::current() }
}

/// A small JPEG `data:` URL of an image.
pub(crate) fn thumb(dir: &Path, path: &str) -> Option<String> {
    if !usable(path) { return None; }
    super::images::cached(dir, Path::new(path), THUMB, super::images::Format::Jpeg, || {
        let _com = super::images::Com::mta();
        let pixels = super::images::shell_image(path, THUMB, super::images::THUMBNAIL_ONLY)?;
        super::images::encode(&pixels, super::images::Format::Jpeg)
    })
}

/// Sets an image as the wallpaper of every screen; the wallpaper now.
pub(crate) fn set(path: &str) -> Result<Option<String>, String> {
    if !usable(path) { return Err("this image is gone".into()); }
    imp::apply(path)?;
    Ok(imp::current())
}

/// Asks for a folder with the system's dialog, above `owner`; `None` when cancelled.
pub(crate) fn pick(owner: isize) -> Result<Option<String>, String> {
    // The dialog wants a single-threaded apartment: a thread of its own.
    std::thread::spawn(move || imp::pick(owner)).join().map_err(|_| "the folder dialog failed".to_owned())?
}

#[cfg(windows)]
mod imp {
    use crate::computer::{from_wide, images::Com, wide};
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{DesktopWallpaper, FileOpenDialog, IDesktopWallpaper, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_GETDESKWALLPAPER, SPI_SETDESKWALLPAPER};

    /// `BackgroundHistoryPath<index>`, when set.
    pub(super) fn history(index: u8) -> Option<String> {
        let (key, value) = (wide(super::HISTORY_KEY), wide(&format!("BackgroundHistoryPath{index}")));
        let mut buffer = vec![0u16; 1024];
        let mut size = (buffer.len() * 2) as u32;
        // SAFETY: the strings are NUL-terminated; `size` is the buffer's size in bytes.
        let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut size) };
        (status == 0).then(|| from_wide(&buffer)).filter(|path| !path.is_empty())
    }

    /// The wallpaper of the first screen, from the shell, or else from the system's setting.
    pub(super) fn current() -> Option<String> {
        let _com = Com::mta();
        // SAFETY: COM is set up above; the strings the shell gives are freed here.
        let shell = unsafe {
            CoCreateInstance::<_, IDesktopWallpaper>(&DesktopWallpaper, None, CLSCTX_ALL).ok().and_then(|desktop| {
                let monitor = desktop.GetMonitorDevicePathAt(0).ok()?;
                let path = desktop.GetWallpaper(PCWSTR(monitor.0)).ok();
                CoTaskMemFree(Some(monitor.0 as _));
                let path = path?;
                let text = path.to_string().ok();
                CoTaskMemFree(Some(path.0 as _));
                text
            })
        };
        shell.filter(|path| !path.is_empty()).or_else(|| {
            let mut buffer = vec![0u16; 1024];
            // SAFETY: the buffer holds the 1024 characters announced.
            let read = unsafe { SystemParametersInfoW(SPI_GETDESKWALLPAPER, buffer.len() as u32, buffer.as_mut_ptr().cast(), 0) };
            (read != 0).then(|| from_wide(&buffer)).filter(|path| !path.is_empty())
        })
    }

    /// The one call that changes the wallpaper, on every screen.
    pub(super) fn apply(path: &str) -> Result<(), String> {
        let _com = Com::mta();
        // SAFETY: COM is set up above; a null monitor means every screen.
        let shell = unsafe { CoCreateInstance::<_, IDesktopWallpaper>(&DesktopWallpaper, None, CLSCTX_ALL).and_then(|desktop| desktop.SetWallpaper(PCWSTR::null(), &HSTRING::from(path))) };
        if shell.is_ok() { return Ok(()); }
        let mut file = wide(path);
        // SAFETY: the path is NUL-terminated and outlives the call.
        let set = unsafe { SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, file.as_mut_ptr().cast(), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE) };
        if set != 0 { Ok(()) } else { Err("the wallpaper could not be set".into()) }
    }

    pub(super) fn pick(owner: isize) -> Result<Option<String>, String> {
        // SAFETY: this thread is the dialog's; COM is closed below.
        let joined = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }.is_ok();
        // SAFETY: COM is set up; the path the shell gives is freed here.
        let picked = unsafe {
            (|| -> windows::core::Result<Option<String>> {
                let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_ALL)?;
                dialog.SetOptions(dialog.GetOptions()? | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM)?;
                let owner = (owner != 0).then_some(HWND(owner as *mut _));
                // Cancelled: an error, and no folder.
                if dialog.Show(owner).is_err() { return Ok(None); }
                let path = dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)?;
                let text = path.to_string().ok();
                CoTaskMemFree(Some(path.0 as _));
                Ok(text)
            })()
        };
        // SAFETY: joined above.
        if joined { unsafe { CoUninitialize() } }
        picked.map_err(|error| error.message())
    }
}

#[cfg(not(windows))]
mod imp {
    pub(super) fn history(_index: u8) -> Option<String> { None }
    pub(super) fn current() -> Option<String> { None }
    pub(super) fn apply(_path: &str) -> Result<(), String> { Err("not on this system".into()) }
    pub(super) fn pick(_owner: isize) -> Result<Option<String>, String> { Ok(None) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn images_are_known_by_their_extension() {
        for name in ["a.jpg", "b.JPEG", "c.png", "d.webp", "e.heic", "f.bmp", "g.Gif"] {
            assert!(is_image(Path::new(name)), "{name}");
        }
        for name in ["a.txt", "b.exe", "c", "d.jpg.lnk", "e.mp4"] {
            assert!(!is_image(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn the_history_keeps_its_order_each_path_once() {
        let values = vec![Some(r"C:\Pics\a.jpg".into()), None, Some(r"c:\pics\A.JPG".into()), Some("  ".into()), Some(r"C:\Pics\b.png".into())];
        assert_eq!(history_of(values), vec![r"C:\Pics\a.jpg".to_owned(), r"C:\Pics\b.png".to_owned()]);
        assert!(history_of(Vec::new()).is_empty());
    }

    #[test]
    fn paths_compare_without_case_or_slash_kind() {
        assert!(same_path(r"C:\Pics\a.jpg", "c:/pics/A.jpg"));
        assert!(same_path(r"C:\Pics\", r"C:\Pics"));
        assert!(!same_path(r"C:\Pics\a.jpg", r"C:\Pics\b.jpg"));
    }

    #[test]
    fn a_folder_lists_its_images_by_name_and_counts_them() {
        let dir = std::env::temp_dir().join(format!("bots-deck-folder-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        for name in ["b.png", "A.jpg", "notes.txt", "sub/c.jpg"] { std::fs::write(dir.join(name), b"x").unwrap(); }
        let listed = folder(&dir.to_string_lossy()).unwrap();
        let names: Vec<String> = listed.images.iter().map(|file| Path::new(file).file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["A.jpg", "b.png"]);
        assert_eq!(listed.count, 2);
        assert!(usable(&listed.images[0]));
        assert!(!usable(&dir.join("notes.txt").to_string_lossy()), "not an image");
        assert!(!usable(&dir.join("gone.jpg").to_string_lossy()), "missing");
        assert!(!usable("a.jpg"), "a full path only");
        std::fs::remove_dir_all(&dir).unwrap();
        assert!(folder(&dir.to_string_lossy()).is_err());
        assert!(folder("relative").is_err());
    }
}
