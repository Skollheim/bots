//! The apps tab: the Start menu's shortcuts (both `Programs` folders, the
//! user's and everyone's), deduplicated by name, uninstallers left out; their
//! icons from the shell, cached; and opening one as a click on it would.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

/// The icons' side in pixels (shown at 32, sharp at 2×).
const ICON: u32 = 64;
/// How deep the Start menu's folders are walked.
const DEPTH: usize = 6;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct App {
    /// The shortcut's full path: what `computer_app_open` and `computer_app_icon` are given back.
    pub id: String,
    pub name: String,
}

/// Names of uninstallers, in the languages Start menus are often in.
const UNINSTALL: &[&str] = &["uninstall", "uninst", "deinstall", "désinstaller", "desinstaller", "désinstallation", "desinstallation", "deinstallieren", "disinstalla", "desinstalar"];

pub(crate) fn is_uninstaller(name: &str) -> bool {
    let lower = name.to_lowercase();
    UNINSTALL.iter().any(|word| lower.contains(word))
}

/// A shortcut the tab lists and opens: a `.lnk`, or a `.url` (a game's `steam://` link).
fn is_shortcut(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url"))
}

/// An internet shortcut's address, from its `URL=` line.
pub(crate) fn url_of(text: &str) -> Option<&str> {
    text.lines().find_map(|line| line.trim().strip_prefix("URL=")).map(str::trim)
}

/// A `.url` is listed when it opens something on the computer (a game), not a web page.
pub(crate) fn opens_locally(url: &str) -> bool {
    let lower = url.to_lowercase();
    !(lower.is_empty() || lower.starts_with("http:") || lower.starts_with("https:") || lower.starts_with("ftp:") || lower.starts_with("mailto:"))
}

/// The shortcuts found, by name, each name once, uninstallers left out.
pub(crate) fn tidy(found: Vec<PathBuf>) -> Vec<App> {
    let mut apps: Vec<App> = Vec::new();
    for path in found {
        let Some(name) = path.file_stem().and_then(|stem| stem.to_str()).map(str::trim) else { continue };
        if name.is_empty() || is_uninstaller(name) { continue; }
        if apps.iter().any(|app| app.name.to_lowercase() == name.to_lowercase()) { continue; }
        apps.push(App { id: path.to_string_lossy().into_owned(), name: name.to_owned() });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.name.cmp(&b.name)));
    apps
}

/// Whether `id` is a shortcut inside one of `roots`: the page may only open those.
pub(crate) fn allowed(id: &str, roots: &[PathBuf]) -> bool {
    let path = Path::new(id);
    path.is_absolute()
        && is_shortcut(path)
        && !path.components().any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        && roots.iter().any(|root| {
            let (path, root) = (id.to_lowercase(), root.to_string_lossy().to_lowercase());
            path.strip_prefix(&root).is_some_and(|rest| rest.starts_with('\\') || rest.starts_with('/'))
        })
}

/// Both `Programs` folders of the Start menu.
fn roots() -> Vec<PathBuf> {
    let programs = Path::new("Microsoft").join("Windows").join("Start Menu").join("Programs");
    ["APPDATA", "ProgramData"].iter().filter_map(std::env::var_os).map(|base| PathBuf::from(base).join(&programs)).collect()
}

fn walk(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if depth > 0 { walk(&path, depth - 1, found); }
        } else if is_shortcut(&path) {
            let is_url = path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("url"));
            if is_url && !std::fs::read_to_string(&path).ok().as_deref().and_then(url_of).is_some_and(opens_locally) { continue; }
            found.push(path);
        }
    }
}

/// The Start menu's apps, by name.
pub(crate) fn list() -> Vec<App> {
    let mut found = Vec::new();
    for root in roots() { walk(&root, DEPTH, &mut found); }
    tidy(found)
}

/// An app's icon as a PNG `data:` URL.
pub(crate) fn icon(dir: &Path, id: &str) -> Option<String> {
    if !allowed(id, &roots()) { return None; }
    super::images::cached(dir, Path::new(id), ICON, super::images::Format::Png, || {
        let _com = super::images::Com::mta();
        let pixels = super::images::shell_image(id, ICON, super::images::ICON_ONLY)?;
        super::images::encode(&pixels, super::images::Format::Png)
    })
}

/// Opens an app as a click on its shortcut would.
pub(crate) fn open(id: &str) -> Result<(), String> {
    if !allowed(id, &roots()) { return Err("this app is not in the Start menu".into()); }
    if !Path::new(id).is_file() { return Err("this app's shortcut is gone".into()); }
    imp::launch(id)
}

#[cfg(windows)]
mod imp {
    use crate::computer::wide;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    /// The one call that opens a shortcut.
    pub(super) fn launch(path: &str) -> Result<(), String> {
        let (verb, file) = (wide("open"), wide(path));
        // SAFETY: both strings are NUL-terminated and outlive the call; the rest is optional.
        let code = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
        // Above 32: it opened.
        if code as isize > 32 { Ok(()) } else { Err(format!("the app did not open ({})", code as isize)) }
    }
}

#[cfg(not(windows))]
mod imp {
    pub(super) fn launch(_path: &str) -> Result<(), String> { Err("not on this system".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninstallers_are_found_in_several_languages() {
        for name in ["Uninstall Foo", "Désinstaller Bar", "desinstaller baz", "Foo Uninst", "Deinstallieren", "UNINSTALL"] {
            assert!(is_uninstaller(name), "{name}");
        }
        for name in ["Steam", "Visual Studio Code", "Install guide", "Unity Hub"] {
            assert!(!is_uninstaller(name), "{name}");
        }
    }

    #[test]
    fn the_list_is_by_name_each_name_once_without_uninstallers() {
        let found = vec![
            PathBuf::from(r"C:\Users\me\Start Menu\Programs\zed.lnk"),
            PathBuf::from(r"C:\Users\me\Start Menu\Programs\Steam\Steam.lnk"),
            PathBuf::from(r"C:\ProgramData\Start Menu\Programs\steam.lnk"),
            PathBuf::from(r"C:\ProgramData\Start Menu\Programs\Foo\Uninstall Foo.lnk"),
            PathBuf::from(r"C:\ProgramData\Start Menu\Programs\Audacity.lnk"),
        ];
        let names: Vec<String> = tidy(found).into_iter().map(|app| app.name).collect();
        assert_eq!(names, vec!["Audacity", "Steam", "zed"]);
    }

    #[test]
    fn only_local_internet_shortcuts_are_listed() {
        assert_eq!(url_of("[InternetShortcut]\r\nIDList=\r\nURL=steam://rungameid/570\r\nIconIndex=0"), Some("steam://rungameid/570"));
        assert_eq!(url_of("[InternetShortcut]"), None);
        assert!(opens_locally("steam://rungameid/570"));
        assert!(opens_locally("com.epicgames.launcher://apps/fn"));
        assert!(!opens_locally("https://example.com"));
        assert!(!opens_locally("HTTP://example.com"));
        assert!(!opens_locally(""));
    }

    #[test]
    fn only_a_shortcut_inside_the_start_menu_may_be_opened() {
        let roots = vec![PathBuf::from(r"C:\Users\me\AppData\Roaming\Microsoft\Windows\Start Menu\Programs"), PathBuf::from(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs")];
        assert!(allowed(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Steam\Steam.lnk", &roots));
        assert!(allowed(r"c:\users\me\appdata\roaming\microsoft\windows\start menu\programs\Game.url", &roots), "whatever the case");
        assert!(!allowed(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\..\..\evil.lnk", &roots), "no way out");
        assert!(!allowed(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\tool.exe", &roots), "a shortcut only");
        assert!(!allowed(r"C:\Windows\System32\cmd.lnk", &roots), "outside the Start menu");
        assert!(!allowed(r"C:\ProgramData\Microsoft\Windows\Start Menu\ProgramsX\a.lnk", &roots), "a sibling folder");
        assert!(!allowed("Steam.lnk", &roots), "a full path only");
    }

    /// Reads the real Start menu, nothing more: shortcuts come, none an uninstaller.
    #[cfg(windows)]
    #[test]
    fn this_computers_start_menu_has_apps() {
        let apps = list();
        assert!(!apps.is_empty());
        assert!(apps.iter().all(|app| !is_uninstaller(&app.name) && allowed(&app.id, &roots())));
    }
}
