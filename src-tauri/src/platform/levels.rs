//! How loud the music plays, for the music bubble's meter: the peak level of
//! the player's own audio sessions (Spotify, the browser...), else of the
//! whole output. A thread samples it while the page asks for it and stops a
//! moment after the page stops asking: nothing runs while no meter shows.
//! Elsewhere than Windows nothing is measured.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};

/// The loudest peak since the last read, as `f32` bits: the bits of
/// non-negative floats order as the numbers, so `fetch_max` keeps the loudest.
static PEAK: AtomicU32 = AtomicU32::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
/// When the page last read, in milliseconds since [`epoch`].
static LAST_READ: AtomicU64 = AtomicU64::new(0);
/// What names the player's processes, as the page last told it.
static TARGET: Mutex<Option<String>> = Mutex::new(None);

/// How often the thread reads the meters.
#[cfg_attr(not(windows), allow(dead_code))]
const SAMPLE: Duration = Duration::from_millis(25);
/// How often it looks for the player's sessions again: they come and go with
/// the tracks, and the output device can change.
#[cfg_attr(not(windows), allow(dead_code))]
const RESCAN: Duration = Duration::from_secs(2);
/// How long the thread samples after the last read.
const IDLE_MS: u64 = 3_000;

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

fn now_ms() -> u64 { epoch().elapsed().as_millis() as u64 }

/// What a player's processes are called in their audio sessions, from the
/// media session's app id: `Spotify.exe` → `spotify`, `MSEdge` → `msedge`.
/// `None` for an id that names no process (a packaged app's hash): the meter
/// then follows the whole output.
pub(crate) fn process_key(app: &str) -> Option<String> {
    let id = app.to_lowercase();
    const KNOWN: [&str; 7] = ["spotify", "chrome", "msedge", "firefox", "deezer", "vlc", "brave"];
    if let Some(key) = KNOWN.iter().find(|key| id.contains(*key)) {
        return Some((*key).to_owned());
    }
    let last = id.rsplit(['\\', '/', '!']).next()?;
    let stem = last.strip_suffix(".exe")?;
    (stem.len() >= 3).then(|| stem.to_owned())
}

/// The loudest peak, 0 to 1, since the last read, for the player that `app`
/// names; the first read starts the sampling and gets 0. `None` where nothing
/// is measured.
pub(crate) fn read(app: &str) -> Option<f32> {
    if !cfg!(windows) { return None; }
    *TARGET.lock().unwrap_or_else(PoisonError::into_inner) = process_key(app);
    LAST_READ.store(now_ms(), Ordering::Release);
    if !RUNNING.swap(true, Ordering::AcqRel) {
        let started = std::thread::Builder::new().name("bots-levels".into()).spawn(|| {
            imp::run(
                || TARGET.lock().unwrap_or_else(PoisonError::into_inner).clone(),
                || now_ms().saturating_sub(LAST_READ.load(Ordering::Acquire)) < IDLE_MS,
                |peak| { PEAK.fetch_max(peak.clamp(0.0, 1.0).to_bits(), Ordering::AcqRel); },
            );
            RUNNING.store(false, Ordering::Release);
        });
        if let Err(error) = started {
            RUNNING.store(false, Ordering::Release);
            eprintln!("[bots] the music meter did not start: {error}");
            return Some(0.0);
        }
    }
    Some(f32::from_bits(PEAK.swap(0, Ordering::AcqRel)))
}

#[cfg(windows)]
mod imp {
    use super::{RESCAN, SAMPLE};
    use std::time::Instant;
    use windows::core::Interface;
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};

    pub(super) fn run(target: impl Fn() -> Option<String>, wanted: impl Fn() -> bool, record: impl Fn(f32)) {
        // SAFETY: this thread is ours; COM is set up once for it and closed below.
        let joined = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
        {
            let mut meters: Vec<IAudioMeterInformation> = Vec::new();
            let mut scanned: Option<(Instant, Option<String>)> = None;
            while wanted() {
                let key = target();
                let stale = match &scanned {
                    Some((at, scanned_for)) => at.elapsed() >= RESCAN || *scanned_for != key,
                    None => true,
                };
                if stale {
                    meters = meters_for(key.as_deref()).unwrap_or_default();
                    scanned = Some((Instant::now(), key));
                }
                // SAFETY: the meters live on this thread, which made them.
                let peak = meters.iter().filter_map(|meter| unsafe { meter.GetPeakValue() }.ok()).fold(0.0_f32, f32::max);
                record(peak);
                std::thread::sleep(SAMPLE);
            }
        }
        if joined {
            // SAFETY: every COM object of this thread is dropped above.
            unsafe { CoUninitialize() };
        }
    }

    /// The meters of the player's sessions on the default output, else the
    /// output's own meter.
    fn meters_for(key: Option<&str>) -> windows::core::Result<Vec<IAudioMeterInformation>> {
        // SAFETY: plain COM calls on this thread's apartment.
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            if let Some(key) = key {
                let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
                let sessions = manager.GetSessionEnumerator()?;
                let mut found = Vec::new();
                for index in 0..sessions.GetCount()? {
                    let Ok(control) = sessions.GetSession(index) else { continue };
                    let Ok(control) = control.cast::<IAudioSessionControl2>() else { continue };
                    if !identifier(&control).is_some_and(|id| id.to_lowercase().contains(key)) { continue; }
                    if let Ok(meter) = control.cast::<IAudioMeterInformation>() { found.push(meter); }
                }
                if !found.is_empty() { return Ok(found); }
            }
            Ok(vec![device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None)?])
        }
    }

    /// The session's identifier: it carries the path of the process's exe.
    fn identifier(control: &IAudioSessionControl2) -> Option<String> {
        // SAFETY: the string is the session's copy, ours to free once read.
        unsafe {
            let id = control.GetSessionIdentifier().ok()?;
            let text = id.to_string().ok();
            CoTaskMemFree(Some(id.0 as *const _));
            text
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub(super) fn run(_: impl Fn() -> Option<String>, _: impl Fn() -> bool, _: impl Fn(f32)) {}
}

#[cfg(test)]
mod tests {
    use super::process_key;

    #[test]
    fn players_are_known_by_their_process() {
        assert_eq!(process_key("Spotify.exe").as_deref(), Some("spotify"));
        assert_eq!(process_key("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify").as_deref(), Some("spotify"));
        assert_eq!(process_key("MSEdge").as_deref(), Some("msedge"));
        assert_eq!(process_key("Chrome").as_deref(), Some("chrome"));
        assert_eq!(process_key(r"C:\Apps\Tidal\TIDAL.exe").as_deref(), Some("tidal"));
        assert_eq!(process_key("308046B0AF4A39CB"), None, "a hash names no process");
    }
}
