//! Where Boite's core is. Boite starts Bots with `BOITE_CORE_URL` and
//! `BOITE_TOKEN`; started by hand, Bots reads the `core.json` the core writes
//! in Boite's data directory, the way Boite's CLI does. With neither, there
//! is no core yet and the page waits for one.

use serde::{Deserialize, Serialize};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Webview;

/// Long enough for a local core to accept, short enough to retry every few seconds.
const ALIVE_TIMEOUT: Duration = Duration::from_millis(300);

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct CoreEndpoint {
    pub url: String,
    pub token: String,
    /// `env` when Boite launched Bots, `file` when found in `core.json`.
    pub source: &'static str,
}

/// `<dataDir>/core.json`, written by the core on start.
#[derive(Deserialize)]
struct CoreFile {
    port: u16,
    host: Option<String>,
    token: String,
}

/// The endpoint Boite handed over in the environment, if both halves are there.
fn from_env(url: Option<String>, token: Option<String>) -> Option<CoreEndpoint> {
    let url = url.map(|url| url.trim().trim_end_matches('/').to_string()).filter(|url| !url.is_empty())?;
    let token = token.filter(|token| !token.trim().is_empty())?;
    Some(CoreEndpoint { url, token, source: "env" })
}

/// A core bound to every address is reached on the loopback; an IPv6 host
/// goes in brackets.
fn endpoint_of(file: CoreFile) -> CoreEndpoint {
    let host = match file.host.as_deref().map(str::trim) {
        Some("0.0.0.0") | Some("::") | Some("") | None => "127.0.0.1".to_string(),
        Some(host) if host.contains(':') && !host.starts_with('[') => format!("[{host}]"),
        Some(host) => host.to_string(),
    };
    CoreEndpoint { url: format!("http://{host}:{}", file.port), token: file.token, source: "file" }
}

fn read_core_file(path: &Path) -> Option<CoreEndpoint> {
    let text = std::fs::read_to_string(path).ok()?;
    let file: CoreFile = serde_json::from_str(&text).ok()?;
    if file.token.trim().is_empty() || file.port == 0 { return None; }
    Some(endpoint_of(file))
}

/// Boite's data directory: `BOITE_DATA_DIR`, else the stable install's.
fn data_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("BOITE_DATA_DIR").filter(|dir| !dir.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    default_data_dir()
}

#[cfg(windows)]
fn default_data_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|local| PathBuf::from(local).join("boite2"))
}

#[cfg(target_os = "macos")]
fn default_data_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library").join("Application Support").join("boite2"))
}

#[cfg(all(not(windows), not(target_os = "macos")))]
fn default_data_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from).or_else(dirs::home_dir);
    xdg_data_dir(home, std::env::var_os("XDG_DATA_HOME").map(PathBuf::from))
}

/// `$XDG_DATA_HOME/boite2` when it is absolute, unless only the older
/// `~/.local/share/boite2` has a journal yet: the rule Boite itself follows.
#[cfg(any(test, all(not(windows), not(target_os = "macos"))))]
fn xdg_data_dir(home: Option<PathBuf>, data_home: Option<PathBuf>) -> Option<PathBuf> {
    let legacy = home.map(|home| home.join(".local").join("share").join("boite2"));
    if let Some(directory) = data_home.filter(|path| path.is_absolute()).map(|path| path.join("boite2")) {
        if let Some(previous) = legacy.filter(|path| path.join("journal.db").exists() && !directory.join("journal.db").exists()) {
            return Some(previous);
        }
        return Some(directory);
    }
    legacy
}

/// Whether something listens where `url` points. A `core.json` outlives the
/// core that wrote it, and the page waits better than it fails to connect.
fn listening(url: &str) -> bool {
    let address = url.trim_start_matches("http://").trim_start_matches("https://");
    let address = address.split('/').next().unwrap_or_default();
    let found: Vec<SocketAddr> = address.to_socket_addrs().map(Iterator::collect).unwrap_or_default();
    found.iter().any(|address| TcpStream::connect_timeout(address, ALIVE_TIMEOUT).is_ok())
}

fn find() -> Option<CoreEndpoint> {
    if let Some(endpoint) = from_env(std::env::var("BOITE_CORE_URL").ok(), std::env::var("BOITE_TOKEN").ok()) {
        return Some(endpoint);
    }
    let endpoint = read_core_file(&data_dir()?.join("core.json"))?;
    listening(&endpoint.url).then_some(endpoint)
}

/// The core to connect to, or none yet. Only Bots's own pages may ask: the
/// answer carries the owner's token.
#[tauri::command]
pub async fn core_endpoint(webview: Webview) -> Result<Option<CoreEndpoint>, String> {
    crate::only_bots(&webview)?;
    tauri::async_runtime::spawn_blocking(find).await.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(host: Option<&str>) -> CoreFile {
        CoreFile { port: 4100, host: host.map(str::to_string), token: "t".into() }
    }

    #[test]
    fn boite_hands_the_core_over_in_the_environment() {
        assert_eq!(from_env(Some("http://127.0.0.1:4100/".into()), Some("tok".into())),
            Some(CoreEndpoint { url: "http://127.0.0.1:4100".into(), token: "tok".into(), source: "env" }));
        assert_eq!(from_env(Some("http://127.0.0.1:4100".into()), None), None);
        assert_eq!(from_env(Some(" ".into()), Some("tok".into())), None);
        assert_eq!(from_env(None, Some("tok".into())), None);
    }

    #[test]
    fn a_core_file_names_a_reachable_address() {
        assert_eq!(endpoint_of(file(None)).url, "http://127.0.0.1:4100");
        assert_eq!(endpoint_of(file(Some("0.0.0.0"))).url, "http://127.0.0.1:4100");
        assert_eq!(endpoint_of(file(Some("::"))).url, "http://127.0.0.1:4100");
        assert_eq!(endpoint_of(file(Some("::1"))).url, "http://[::1]:4100");
        assert_eq!(endpoint_of(file(Some("192.168.1.20"))).url, "http://192.168.1.20:4100");
        assert_eq!(endpoint_of(file(None)).source, "file");
    }

    #[test]
    fn a_broken_or_missing_core_file_is_no_core() {
        let dir = std::env::temp_dir().join(format!("bots-endpoint-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("core.json");
        assert_eq!(read_core_file(&path), None);
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(read_core_file(&path), None);
        std::fs::write(&path, r#"{"port":4100,"token":""}"#).unwrap();
        assert_eq!(read_core_file(&path), None);
        std::fs::write(&path, r#"{"port":4100,"host":"127.0.0.1","token":"abc","pid":1,"version":"2"}"#).unwrap();
        assert_eq!(read_core_file(&path).map(|found| found.token), Some("abc".into()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_core_file_left_by_a_stopped_core_is_not_taken() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(listening(&format!("http://127.0.0.1:{port}")));
        drop(listener);
        assert!(!listening(&format!("http://127.0.0.1:{port}")));
    }

    #[test]
    fn the_xdg_data_directory_keeps_an_older_journal_in_view() {
        let root = std::env::temp_dir().join(format!("bots-xdg-{}", std::process::id()));
        let (home, data_home) = (root.join("home"), root.join("data"));
        let legacy = home.join(".local").join("share").join("boite2");
        assert_eq!(xdg_data_dir(Some(home.clone()), None), Some(legacy.clone()));
        assert_eq!(xdg_data_dir(Some(home.clone()), Some(PathBuf::from("relative"))), Some(legacy.clone()));
        assert_eq!(xdg_data_dir(Some(home.clone()), Some(data_home.clone())), Some(data_home.join("boite2")));
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("journal.db"), []).unwrap();
        assert_eq!(xdg_data_dir(Some(home.clone()), Some(data_home.clone())), Some(legacy.clone()));
        std::fs::create_dir_all(data_home.join("boite2")).unwrap();
        std::fs::write(data_home.join("boite2").join("journal.db"), []).unwrap();
        assert_eq!(xdg_data_dir(Some(home), Some(data_home.clone())), Some(data_home.join("boite2")));
        let _ = std::fs::remove_dir_all(&root);
    }
}
