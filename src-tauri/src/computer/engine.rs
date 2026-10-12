//! Wallpaper Engine (Steam app 431960) in the wallpaper tab, when it is
//! installed: found through Steam's libraries, its wallpapers listed from
//! their `project.json`, and driven by its documented command line
//! (`wallpaper64.exe -control …`), each argument passed apart, never as one
//! shell string. Only a `project.json` the listing would find is applied.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

/// Wallpaper Engine's Steam app id: its Workshop folder.
const APP_ID: &str = "431960";
/// The previews' thumbnails' longest side.
const THUMB: u32 = 320;
/// How long a `-control` command may take.
#[cfg_attr(not(windows), allow(dead_code))]
const WAIT: Duration = Duration::from_secs(10);

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Wallpaper {
    /// Its `project.json`'s full path: what the page gives back to apply it.
    pub id: String,
    pub title: String,
    /// `scene`, `video`, `web`, `application`, or `other`.
    pub kind: String,
    /// Whether it has a preview the thumbnail is made from.
    pub preview: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Engine {
    pub running: bool,
    /// The screens, for "every screen" or one of them.
    pub monitors: u32,
    pub wallpapers: Vec<Wallpaper>,
}

/// What a `project.json` tells.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Project {
    pub title: Option<String>,
    pub kind: String,
    pub preview: Option<String>,
}

/// Reads a `project.json`, whatever is missing or odd in it.
pub(crate) fn project(text: &str) -> Option<Project> {
    let value: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let object = value.as_object()?;
    let title = object.get("title").and_then(|title| title.as_str()).map(str::trim).filter(|title| !title.is_empty()).map(str::to_owned);
    let kind = object.get("type").and_then(|kind| kind.as_str()).map(str::trim).map(str::to_lowercase).unwrap_or_default();
    let kind = match kind.as_str() {
        "scene" | "video" | "web" | "application" => kind,
        _ => "other".to_owned(),
    };
    // A file name next to it only: no folder, no way out.
    let preview = object
        .get("preview")
        .and_then(|preview| preview.as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty() && !name.contains(['/', '\\', ':']) && *name != ".." && *name != ".")
        .map(str::to_owned);
    Some(Project { title, kind, preview })
}

/// The libraries' paths in Steam's `libraryfolders.vdf`.
pub(crate) fn library_paths(vdf: &str) -> Vec<PathBuf> {
    vdf.lines()
        .filter_map(|line| {
            let line = line.trim();
            let rest = line.strip_prefix("\"path\"")?.trim();
            let value = rest.strip_prefix('"')?.strip_suffix('"')?;
            Some(PathBuf::from(value.replace("\\\\", "\\")))
        })
        .collect()
}

/// Where Wallpaper Engine is: its program, its folder, and Steam's libraries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Install {
    pub exe: PathBuf,
    pub root: PathBuf,
    pub libraries: Vec<PathBuf>,
}

impl Install {
    /// The folders whose subfolders are wallpapers.
    pub(crate) fn sources(&self) -> Vec<PathBuf> {
        let mut sources: Vec<PathBuf> = self.libraries.iter().map(|library| library.join("steamapps").join("workshop").join("content").join(APP_ID)).collect();
        sources.push(self.root.join("projects").join("myprojects"));
        sources.push(self.root.join("projects").join("defaultprojects"));
        sources
    }
}

/// Finds Wallpaper Engine from Steam's folder; `None` when it is not installed.
pub(crate) fn find(steam: &Path) -> Option<Install> {
    let mut libraries = vec![steam.to_path_buf()];
    if let Ok(vdf) = std::fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        for path in library_paths(&vdf) {
            if !libraries.iter().any(|known| super::wallpaper::same_path(&known.to_string_lossy(), &path.to_string_lossy())) { libraries.push(path); }
        }
    }
    // A library on an unplugged drive is skipped quietly.
    libraries.retain(|library| library.is_dir());
    let root = libraries.iter().map(|library| library.join("steamapps").join("common").join("wallpaper_engine")).find(|root| root.is_dir())?;
    let exe = ["wallpaper64.exe", "wallpaper32.exe"].iter().map(|name| root.join(name)).find(|exe| exe.is_file())?;
    Some(Install { exe, root, libraries })
}

/// Every wallpaper of the install, by title.
pub(crate) fn list(install: &Install) -> Vec<Wallpaper> {
    let mut wallpapers = Vec::new();
    for source in install.sources() {
        let Ok(entries) = std::fs::read_dir(&source) else { continue };
        for entry in entries.flatten() {
            let file = entry.path().join("project.json");
            let Some(project) = std::fs::read_to_string(&file).ok().as_deref().and_then(project) else { continue };
            let folder = entry.file_name().to_string_lossy().into_owned();
            let preview = project.preview.as_ref().is_some_and(|name| entry.path().join(name).is_file());
            wallpapers.push(Wallpaper { id: file.to_string_lossy().into_owned(), title: project.title.unwrap_or(folder), kind: project.kind, preview });
        }
    }
    wallpapers.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()).then(a.id.cmp(&b.id)));
    wallpapers
}

/// Whether `id` is a `project.json` the listing finds: one folder down a source, readable.
pub(crate) fn listed(id: &str, install: &Install) -> bool {
    let file = Path::new(id);
    if !file.is_absolute() || file.components().any(|part| matches!(part, Component::ParentDir | Component::CurDir)) { return false; }
    if !file.file_name().is_some_and(|name| name.eq_ignore_ascii_case("project.json")) { return false; }
    let Some(source) = file.parent().and_then(Path::parent) else { return false };
    install.sources().iter().any(|known| super::wallpaper::same_path(&known.to_string_lossy(), &source.to_string_lossy()))
        && std::fs::read_to_string(file).ok().as_deref().and_then(project).is_some()
}

/// The arguments that apply a wallpaper, on one screen or every screen.
pub(crate) fn open_args(file: &str, monitor: Option<u32>, monitors: u32) -> Result<Vec<String>, String> {
    let mut args = vec!["-control".to_owned(), "openWallpaper".to_owned(), "-file".to_owned(), file.to_owned()];
    if let Some(monitor) = monitor {
        if monitor >= monitors.max(1) { return Err("this screen does not exist".into()); }
        args.extend(["-monitor".to_owned(), monitor.to_string()]);
    }
    Ok(args)
}

/// The small controls of the tab, and starting the app.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Control {
    Pause,
    Play,
    Mute,
    Unmute,
    Next,
    /// Starts Wallpaper Engine, which is not running.
    Start,
}

/// The `-control` command of a control; `None` for `Start`.
pub(crate) fn control_args(control: Control) -> Option<Vec<String>> {
    let command = match control {
        Control::Pause => "pause",
        Control::Play => "play",
        Control::Mute => "mute",
        Control::Unmute => "unmute",
        Control::Next => "nextWallpaper",
        Control::Start => return None,
    };
    Some(vec!["-control".to_owned(), command.to_owned()])
}

/// What `getWallpaper` printed: the current wallpaper's path, if any.
pub(crate) fn printed_path(output: &str) -> Option<String> {
    output.lines().map(str::trim).map(|line| line.trim_matches('"')).find(|line| !line.is_empty()).map(str::to_owned)
}

/// Wallpaper Engine as installed here, from Steam's own setting.
fn install() -> Option<Install> { find(&imp::steam()?) }

/// Wallpaper Engine's wallpapers, and whether it runs; `None` when it is not installed.
pub(crate) fn engine() -> Option<Engine> {
    let install = install()?;
    Some(Engine { running: imp::running(), monitors: imp::monitors(), wallpapers: list(&install) })
}

/// A wallpaper's preview as a small JPEG `data:` URL (the first frame of a GIF).
pub(crate) fn thumb(dir: &Path, id: &str) -> Option<String> {
    let install = install()?;
    if !listed(id, &install) { return None; }
    let file = Path::new(id);
    let preview = file.parent()?.join(project(&std::fs::read_to_string(file).ok()?)?.preview?);
    if !preview.is_file() { return None; }
    super::images::cached(dir, &preview, THUMB, super::images::Format::Jpeg, || {
        let _com = super::images::Com::mta();
        let pixels = super::images::shell_image(&preview.to_string_lossy(), THUMB, super::images::THUMBNAIL_ONLY)?;
        super::images::encode(&pixels, super::images::Format::Jpeg)
    })
}

/// Applies a wallpaper the listing found, on one screen or every screen.
pub(crate) fn apply(id: &str, monitor: Option<u32>) -> Result<(), String> {
    let install = install().ok_or_else(|| "Wallpaper Engine is not installed".to_owned())?;
    if !listed(id, &install) { return Err("this wallpaper is not in Wallpaper Engine".into()); }
    if !imp::running() { return Err("Wallpaper Engine is not running".into()); }
    imp::control(&install.exe, &open_args(id, monitor, imp::monitors())?).map(drop)
}

/// The wallpaper of each screen, as Wallpaper Engine prints it.
pub(crate) fn current() -> Result<Vec<String>, String> {
    let install = install().ok_or_else(|| "Wallpaper Engine is not installed".to_owned())?;
    if !imp::running() { return Ok(Vec::new()); }
    let mut current = Vec::new();
    for monitor in 0..imp::monitors().clamp(1, 8) {
        let output = imp::control(&install.exe, &["-control".into(), "getWallpaper".into(), "-monitor".into(), monitor.to_string()])?;
        if let Some(path) = printed_path(&output) { current.push(path); }
    }
    Ok(current)
}

/// Pauses, plays, mutes, unmutes, skips, or starts Wallpaper Engine.
pub(crate) fn control(control: Control) -> Result<(), String> {
    let install = install().ok_or_else(|| "Wallpaper Engine is not installed".to_owned())?;
    match control_args(control) {
        None => if imp::running() { Ok(()) } else { imp::start(&install) },
        Some(args) => {
            if !imp::running() { return Err("Wallpaper Engine is not running".into()); }
            imp::control(&install.exe, &args).map(drop)
        }
    }
}

#[cfg(windows)]
mod imp {
    use super::{Install, WAIT};
    use crate::computer::{from_wide, wide};
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// Steam's folder, from its own setting.
    pub(super) fn steam() -> Option<PathBuf> {
        use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
        let (key, value) = (wide(r"Software\Valve\Steam"), wide("SteamPath"));
        let mut buffer = vec![0u16; 1024];
        let mut size = (buffer.len() * 2) as u32;
        // SAFETY: the strings are NUL-terminated; `size` is the buffer's size in bytes.
        let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut size) };
        (status == 0).then(|| PathBuf::from(from_wide(&buffer).replace('/', "\\"))).filter(|path| path.is_dir())
    }

    /// Whether Wallpaper Engine runs (its 64 or 32 bits program).
    pub(super) fn running() -> bool {
        use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
        let mut system = System::new();
        system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
        system.processes().values().any(|process| {
            let name = process.name().to_string_lossy().to_lowercase();
            name == "wallpaper64.exe" || name == "wallpaper32.exe"
        })
    }

    pub(super) fn monitors() -> u32 {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CMONITORS};
        // SAFETY: plain value.
        u32::try_from(unsafe { GetSystemMetrics(SM_CMONITORS) }).unwrap_or(1).max(1)
    }

    /// The one call that sends Wallpaper Engine a command; what it printed.
    pub(super) fn control(exe: &Path, args: &[String]) -> Result<String, String> {
        let mut command = std::process::Command::new(exe);
        command.args(args).creation_flags(CREATE_NO_WINDOW);
        if let Some(dir) = exe.parent() { command.current_dir(dir); }
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || { let _ = sender.send(command.output()); });
        let output = receiver.recv_timeout(WAIT).map_err(|_| "Wallpaper Engine did not answer".to_owned())?.map_err(|error| error.to_string())?;
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) } else { Err(format!("Wallpaper Engine refused ({})", output.status)) }
    }

    /// The one call that starts Wallpaper Engine.
    pub(super) fn start(install: &Install) -> Result<(), String> {
        std::process::Command::new(&install.exe).current_dir(&install.root).spawn().map(drop).map_err(|error| error.to_string())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Install;
    use std::path::{Path, PathBuf};

    pub(super) fn steam() -> Option<PathBuf> { None }
    pub(super) fn running() -> bool { false }
    pub(super) fn monitors() -> u32 { 1 }
    pub(super) fn control(_exe: &Path, _args: &[String]) -> Result<String, String> { Err("not on this system".into()) }
    pub(super) fn start(_install: &Install) -> Result<(), String> { Err("not on this system".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_is_read_whatever_is_odd_in_it() {
        let full = project("\u{feff}{\"title\":\" Rainy city \",\"type\":\"Scene\",\"preview\":\"preview.gif\",\"file\":\"scene.json\"}").unwrap();
        assert_eq!(full, Project { title: Some("Rainy city".into()), kind: "scene".into(), preview: Some("preview.gif".into()) });
        let bare = project("{}").unwrap();
        assert_eq!(bare, Project { title: None, kind: "other".into(), preview: None });
        let odd = project("{\"title\":42,\"type\":\"preset\",\"preview\":[\"a\"]}").unwrap();
        assert_eq!(odd, Project { title: None, kind: "other".into(), preview: None });
        assert_eq!(project("{\"type\":\"video\"}").unwrap().kind, "video");
        assert_eq!(project("{\"type\":\"web\"}").unwrap().kind, "web");
        assert_eq!(project("{\"type\":\"application\"}").unwrap().kind, "application");
        assert_eq!(project("not json"), None);
        assert_eq!(project("[1,2]"), None);
    }

    #[test]
    fn a_preview_must_sit_next_to_its_project() {
        for name in ["../evil.jpg", "sub/preview.jpg", r"C:\x.jpg", r"..\x.jpg", "..", " "] {
            let text = format!("{{\"preview\":{}}}", serde_json::to_string(name).unwrap());
            assert_eq!(project(&text).unwrap().preview, None, "{name}");
        }
    }

    #[test]
    fn steams_libraries_are_read_from_its_vdf() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t\t\"label\"\t\t\"\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t}\n}\n";
        assert_eq!(library_paths(vdf), vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]);
        assert!(library_paths("").is_empty());
        assert!(library_paths("\"path\" broken").is_empty());
    }

    #[test]
    fn the_arguments_go_apart_and_the_screen_is_checked() {
        let file = r"D:\Steam\steamapps\workshop\content\431960\123\project.json";
        assert_eq!(open_args(file, None, 2).unwrap(), vec!["-control", "openWallpaper", "-file", file]);
        assert_eq!(open_args(file, Some(1), 2).unwrap(), vec!["-control", "openWallpaper", "-file", file, "-monitor", "1"]);
        assert!(open_args(file, Some(2), 2).is_err());
        assert!(open_args(file, Some(1), 0).is_err(), "one screen at least");
        assert_eq!(control_args(Control::Next), Some(vec!["-control".to_owned(), "nextWallpaper".to_owned()]));
        assert_eq!(control_args(Control::Pause).unwrap()[1], "pause");
        assert_eq!(control_args(Control::Start), None);
        assert!(serde_json::from_str::<Control>("\"next\"").is_ok());
        assert!(serde_json::from_str::<Control>("\"quit\"").is_err());
    }

    #[test]
    fn getwallpaper_prints_one_path() {
        assert_eq!(printed_path("\r\n\"D:\\a\\project.json\"\r\n").as_deref(), Some(r"D:\a\project.json"));
        assert_eq!(printed_path("  \n"), None);
    }

    /// A fake Steam: two libraries (one on a missing drive), the app in the second, Workshop items in both.
    #[test]
    fn a_fake_install_is_found_and_listed_and_only_its_projects_are_accepted() {
        let base = std::env::temp_dir().join(format!("bots-deck-we-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let steam = base.join("Steam");
        let second = base.join("Library");
        let write = |path: PathBuf, text: &str| {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        };
        let vdf = format!(
            "\"libraryfolders\"\n{{\n\"0\" {{ \n\"path\"\t\"{}\"\n}}\n\"1\"\n{{\n\"path\"\t\"{}\"\n}}\n\"2\"\n{{\n\"path\"\t\"Q:\\\\Gone\"\n}}\n}}",
            steam.to_string_lossy().replace('\\', "\\\\"),
            second.to_string_lossy().replace('\\', "\\\\")
        );
        write(steam.join("steamapps").join("libraryfolders.vdf"), &vdf);
        let root = second.join("steamapps").join("common").join("wallpaper_engine");
        write(root.join("wallpaper32.exe"), "");
        let workshop = |library: &Path, id: &str| library.join("steamapps").join("workshop").join("content").join(APP_ID).join(id);
        write(workshop(&steam, "111").join("project.json"), "{\"title\":\"Zen garden\",\"type\":\"video\",\"preview\":\"preview.jpg\"}");
        write(workshop(&steam, "111").join("preview.jpg"), "x");
        write(workshop(&second, "222").join("project.json"), "\u{feff}{\"title\":\"Aurora\",\"type\":\"scene\",\"preview\":\"preview.gif\"}");
        write(workshop(&second, "333").join("readme.txt"), "no project");
        write(root.join("projects").join("myprojects").join("mine").join("project.json"), "{\"type\":\"web\"}");
        write(root.join("projects").join("defaultprojects").join("broken").join("project.json"), "{oops");

        let install = find(&steam).unwrap();
        assert_eq!(install.exe, root.join("wallpaper32.exe"), "the 32 bits one as a fallback");
        assert_eq!(install.libraries.len(), 2, "the missing drive skipped");
        let wallpapers = list(&install);
        let titles: Vec<&str> = wallpapers.iter().map(|wallpaper| wallpaper.title.as_str()).collect();
        assert_eq!(titles, vec!["Aurora", "mine", "Zen garden"], "untitled: its folder's name");
        assert_eq!(wallpapers.iter().map(|wallpaper| wallpaper.preview).collect::<Vec<_>>(), vec![false, false, true], "a preview that exists");
        assert_eq!(wallpapers[1].kind, "web");
        for wallpaper in &wallpapers { assert!(listed(&wallpaper.id, &install), "{}", wallpaper.id); }
        let broken = root.join("projects").join("defaultprojects").join("broken").join("project.json");
        assert!(!listed(&broken.to_string_lossy(), &install), "unreadable");
        let outside = base.join("elsewhere").join("x").join("project.json");
        write(outside.clone(), "{}");
        assert!(!listed(&outside.to_string_lossy(), &install), "outside the sources");
        let sneaky = format!("{}\\..\\..\\elsewhere\\x\\project.json", workshop(&steam, "111").to_string_lossy());
        assert!(!listed(&sneaky, &install), "no way out");
        assert!(!listed(&workshop(&steam, "111").join("preview.jpg").to_string_lossy(), &install), "a project.json only");

        std::fs::remove_dir_all(&base).unwrap();
        assert_eq!(find(&steam), None, "not installed");
    }
}
