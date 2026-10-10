//! What the system media session is playing, and its play/pause, next and
//! previous buttons and its timeline: Windows'
//! GlobalSystemMediaTransportControls. A Spotify
//! session wins over whichever the system calls current. Elsewhere nothing
//! plays, as far as the shell can tell.

use serde::Serialize;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

#[derive(Serialize, Debug, Clone, PartialEq)]
pub(crate) struct MediaState {
    pub title: String,
    pub artist: String,
    /// The session's app id (`Spotify.exe`, `MSEdge`...), for the page to name.
    pub app: String,
    pub playing: bool,
    /// The cover, [`ART_SIDE`] pixels at most, as a `data:image/jpeg` URL.
    pub art: Option<String>,
    /// Where the track is, in milliseconds, at the moment of the read; `None`
    /// when the player tells no timeline.
    pub position: Option<f64>,
    /// How long the track lasts, in milliseconds; `None` as for `position`.
    pub duration: Option<f64>,
    /// The player takes a new position (`MediaAction::Seek`): its timeline
    /// is known and its session allows the move.
    pub seekable: bool,
}

/// Where a track is now: the position the player last reported, moved on by
/// the time since when it plays, never past its end.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn position_now(reported: f64, since: f64, playing: bool, duration: f64) -> f64 {
    let moved = if playing { reported + since.max(0.0) } else { reported };
    moved.clamp(0.0, duration.max(0.0))
}

/// The longer side of a cover as the page gets it: the pill shows it at 28 px.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) const ART_SIDE: u32 = 96;

/// A session can hand the previous track's cover for a moment after the
/// track changes: a new track's cover is read once more after this long.
const ART_SETTLE: Duration = Duration::from_secs(4);

/// The size a `width` × `height` picture is scaled to, its longer side at
/// most `side`, never enlarged.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn fit(width: u32, height: u32, side: u32) -> (u32, u32) {
    let longer = width.max(height);
    if longer <= side || longer == 0 { return (width.max(1), height.max(1)); }
    let scale = |length: u32| ((u64::from(length) * u64::from(side) + u64::from(longer) / 2) / u64::from(longer)).max(1) as u32;
    (scale(width), scale(height))
}

/// One cover per track, since the page reads the session every 2 seconds:
/// decoding and encoding it each time would be wasted.
struct ArtCache {
    track: String,
    art: Option<String>,
    read_at: Instant,
    /// Read twice already, the second time [`ART_SETTLE`] after the first.
    settled: bool,
}

impl ArtCache {
    /// The cover kept for `track`, or `None` when it has to be read.
    fn lookup(cache: Option<&Self>, track: &str, now: Instant) -> Option<Option<String>> {
        let entry = cache.filter(|entry| entry.track == track)?;
        (entry.settled || now.duration_since(entry.read_at) < ART_SETTLE).then(|| entry.art.clone())
    }

    fn store(cache: &mut Option<Self>, track: &str, art: Option<String>, now: Instant) {
        let settled = cache.as_ref().is_some_and(|entry| entry.track == track);
        *cache = Some(Self { track: track.to_owned(), art, read_at: now, settled });
    }
}

static ART: Mutex<Option<ArtCache>> = Mutex::new(None);

/// The cover of `track` from the cache, or from `read` when the cache has none.
#[cfg_attr(not(windows), allow(dead_code))]
fn cover_of(track: &str, read: impl FnOnce() -> Option<String>) -> Option<String> {
    let now = Instant::now();
    if let Some(art) = ArtCache::lookup(ART.lock().unwrap_or_else(PoisonError::into_inner).as_ref(), track, now) { return art; }
    let art = read();
    ArtCache::store(&mut ART.lock().unwrap_or_else(PoisonError::into_inner), track, art.clone(), now);
    art
}

/// The three buttons of the media session, a move along the track (to a
/// position in milliseconds), and bringing the player forward.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum MediaAction { Toggle, Next, Previous, Show, Seek(u64) }

impl MediaAction {
    /// `position`, in milliseconds, goes with `seek` only.
    pub(crate) fn parse(action: &str, position: Option<f64>) -> Result<Self, String> {
        match action {
            "toggle" => Ok(Self::Toggle),
            "next" => Ok(Self::Next),
            "previous" => Ok(Self::Previous),
            "show" => Ok(Self::Show),
            "seek" => match position {
                Some(ms) if ms.is_finite() && ms >= 0.0 => Ok(Self::Seek(ms.round() as u64)),
                _ => Err(format!("seek needs a position in milliseconds, not {position:?}")),
            },
            _ => Err(format!("media action must be toggle, next, previous, show or seek, not {action:?}")),
        }
    }
}

/// The address that brings a player forward, for the players that have one:
/// Spotify answers `spotify:` by showing its window. `None` for the others.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn player_uri(app: &str) -> Option<&'static str> {
    app.to_lowercase().contains("spotify").then_some("spotify:")
}

#[cfg(windows)]
mod imp {
    use super::{MediaAction, MediaState};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionMediaProperties as Properties,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };

    fn session() -> windows::core::Result<Option<Session>> {
        let manager = Manager::RequestAsync()?.get()?;
        for session in &manager.GetSessions()? {
            if session.SourceAppUserModelId()?.to_string().to_lowercase().contains("spotify") {
                return Ok(Some(session));
            }
        }
        Ok(manager.GetCurrentSession().ok())
    }

    pub(super) fn state() -> Result<Option<MediaState>, String> {
        let read = || -> windows::core::Result<Option<MediaState>> {
            let Some(session) = session()? else { return Ok(None) };
            let properties = session.TryGetMediaPropertiesAsync()?.get()?;
            let (title, artist, app) = (properties.Title()?.to_string(), properties.Artist()?.to_string(), session.SourceAppUserModelId()?.to_string());
            // A cover that cannot be read leaves the pill without one, not without the music.
            let art = super::cover_of(&format!("{app}\n{title}\n{artist}"), || cover(&properties).ok().flatten());
            let info = session.GetPlaybackInfo()?;
            let playing = info.PlaybackStatus()? == Status::Playing;
            // A timeline that cannot be read leaves the music without its progress.
            let (position, duration) = timeline(&session, playing).unwrap_or((None, None));
            let seekable = duration.is_some() && info.Controls().and_then(|controls| controls.IsPlaybackPositionEnabled()).unwrap_or(false);
            Ok(Some(MediaState { title, artist, app, playing, art, position, duration, seekable }))
        };
        read().map_err(|error| error.to_string())
    }

    /// The track's position now and its length, in milliseconds. Players
    /// report the position when it jumps (a play, a pause, a seek) with the
    /// time of that report: the position now counts on from it.
    fn timeline(session: &Session, playing: bool) -> windows::core::Result<(Option<f64>, Option<f64>)> {
        let timeline = session.GetTimelineProperties()?;
        // TimeSpan and DateTime count in 100 ns ticks.
        let ms = |ticks: i64| ticks as f64 / 10_000.0;
        let duration = ms(timeline.EndTime()?.Duration - timeline.StartTime()?.Duration);
        if duration <= 0.0 { return Ok((None, None)); }
        let reported = ms(timeline.Position()?.Duration);
        // DateTime counts from 1601, the system clock from 1970.
        const FROM_1601: i64 = 116_444_736_000_000_000;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |since| (since.as_nanos() / 100) as i64) + FROM_1601;
        let since = ms(now - timeline.LastUpdatedTime()?.UniversalTime);
        Ok((Some(super::position_now(reported, since, playing, duration)), Some(duration)))
    }

    /// The session's thumbnail, scaled to [`super::ART_SIDE`] and encoded as a
    /// JPEG `data:` URL; `None` when the track has none.
    fn cover(properties: &Properties) -> windows::core::Result<Option<String>> {
        use base64::Engine;
        use windows::Graphics::Imaging::{
            BitmapAlphaMode, BitmapDecoder, BitmapEncoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform, ColorManagementMode,
            ExifOrientationMode,
        };
        use windows::Storage::Streams::{Buffer, DataReader, InMemoryRandomAccessStream, InputStreamOptions};
        let Ok(reference) = properties.Thumbnail() else { return Ok(None) };
        let source = reference.OpenReadAsync()?.get()?;
        let decoder = BitmapDecoder::CreateAsync(&source)?.get()?;
        let (width, height) = super::fit(decoder.PixelWidth()?, decoder.PixelHeight()?, super::ART_SIDE);
        let transform = BitmapTransform::new()?;
        transform.SetScaledWidth(width)?;
        transform.SetScaledHeight(height)?;
        transform.SetInterpolationMode(BitmapInterpolationMode::Fant)?;
        let pixels = decoder
            .GetPixelDataTransformedAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Ignore, &transform, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage)?
            .get()?
            .DetachPixelData()?;
        let output = InMemoryRandomAccessStream::new()?;
        let encoder = BitmapEncoder::CreateAsync(BitmapEncoder::JpegEncoderId()?, &output)?.get()?;
        encoder.SetPixelData(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Ignore, width, height, 96.0, 96.0, &pixels)?;
        encoder.FlushAsync()?.get()?;
        let size = u32::try_from(output.Size()?).unwrap_or(u32::MAX);
        let filled = output.GetInputStreamAt(0)?.ReadAsync(&Buffer::Create(size)?, size, InputStreamOptions::None)?.get()?;
        let mut bytes = vec![0u8; filled.Length()? as usize];
        DataReader::FromBuffer(&filled)?.ReadBytes(&mut bytes)?;
        if bytes.is_empty() { return Ok(None); }
        Ok(Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
    }

    pub(super) fn control(action: MediaAction) -> Result<(), String> {
        let press = || -> windows::core::Result<()> {
            let session = session()?;
            if action == MediaAction::Show {
                // With no session, the player the page offers to open is Spotify.
                let app = match &session { Some(session) => session.SourceAppUserModelId()?.to_string(), None => "spotify".to_owned() };
                if let Some(uri) = super::player_uri(&app) { show(uri); }
                return Ok(());
            }
            let Some(session) = session else { return Ok(()) };
            match action {
                MediaAction::Toggle => session.TryTogglePlayPauseAsync()?.get()?,
                MediaAction::Next => session.TrySkipNextAsync()?.get()?,
                MediaAction::Previous => session.TrySkipPreviousAsync()?.get()?,
                // The timeline counts in 100 ns ticks.
                MediaAction::Seek(ms) => session.TryChangePlaybackPositionAsync(i64::try_from(ms).unwrap_or(i64::MAX).saturating_mul(10_000))?.get()?,
                MediaAction::Show => true,
            };
            Ok(())
        };
        press().map_err(|error| error.to_string())
    }

    /// The shell opens the player's address: the player comes forward, from
    /// the tray too. The click that asked for it lets the shell take the focus.
    fn show(uri: &str) {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if let Err(error) = std::process::Command::new("explorer.exe").arg(uri).creation_flags(CREATE_NO_WINDOW).spawn() {
            eprintln!("[bots] the player did not come forward: {error}");
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{MediaAction, MediaState};
    pub(super) fn state() -> Result<Option<MediaState>, String> { Ok(None) }
    pub(super) fn control(_: MediaAction) -> Result<(), String> { Ok(()) }
}

/// Blocks on the system's media service: call it off the UI thread.
pub(crate) fn media_state() -> Result<Option<MediaState>, String> { imp::state() }

/// Blocks like [`media_state`]. No session is not an error: nothing to press.
pub(crate) fn media_control(action: MediaAction) -> Result<(), String> { imp::control(action) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_three_buttons_show_and_seek_are_accepted() {
        assert_eq!(MediaAction::parse("toggle", None), Ok(MediaAction::Toggle));
        assert_eq!(MediaAction::parse("next", None), Ok(MediaAction::Next));
        assert_eq!(MediaAction::parse("previous", None), Ok(MediaAction::Previous));
        assert_eq!(MediaAction::parse("show", None), Ok(MediaAction::Show));
        assert!(MediaAction::parse("stop", None).unwrap_err().contains("\"stop\""));
    }

    #[test]
    fn a_seek_takes_a_position_in_milliseconds() {
        assert_eq!(MediaAction::parse("seek", Some(74_000.4)), Ok(MediaAction::Seek(74_000)));
        assert_eq!(MediaAction::parse("seek", Some(0.0)), Ok(MediaAction::Seek(0)));
        assert!(MediaAction::parse("seek", None).is_err(), "no position");
        assert!(MediaAction::parse("seek", Some(-1.0)).is_err(), "before the start");
        assert!(MediaAction::parse("seek", Some(f64::NAN)).is_err());
    }

    #[test]
    fn only_spotify_is_brought_forward_by_its_address() {
        assert_eq!(player_uri("Spotify.exe"), Some("spotify:"));
        assert_eq!(player_uri("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), Some("spotify:"));
        assert_eq!(player_uri("MSEdge"), None);
    }

    #[test]
    fn the_position_counts_on_while_the_track_plays() {
        assert_eq!(position_now(10_000.0, 2_500.0, true, 200_000.0), 12_500.0);
        assert_eq!(position_now(10_000.0, 2_500.0, false, 200_000.0), 10_000.0, "paused, it stays");
        assert_eq!(position_now(199_000.0, 5_000.0, true, 200_000.0), 200_000.0, "never past the end");
        assert_eq!(position_now(10_000.0, -400.0, true, 200_000.0), 10_000.0, "a report from the future counts as now");
    }

    #[test]
    fn a_cover_is_scaled_down_to_its_longer_side_and_never_up() {
        assert_eq!(fit(300, 300, 96), (96, 96));
        assert_eq!(fit(640, 360, 96), (96, 54));
        assert_eq!(fit(360, 640, 96), (54, 96));
        assert_eq!(fit(64, 64, 96), (64, 64), "small enough already");
        assert_eq!(fit(4000, 10, 96), (96, 1), "a side never reaches zero");
    }

    #[test]
    fn a_cover_is_read_once_per_track_and_once_more_after_it_settles() {
        let start = Instant::now();
        let mut cache = None;
        assert_eq!(ArtCache::lookup(cache.as_ref(), "a", start), None, "nothing read yet");
        ArtCache::store(&mut cache, "a", Some("old".into()), start);
        let soon = start + Duration::from_secs(2);
        assert_eq!(ArtCache::lookup(cache.as_ref(), "a", soon), Some(Some("old".into())));
        assert_eq!(ArtCache::lookup(cache.as_ref(), "b", soon), None, "another track");
        let later = start + ART_SETTLE;
        assert_eq!(ArtCache::lookup(cache.as_ref(), "a", later), None, "read again once the session settled");
        ArtCache::store(&mut cache, "a", Some("new".into()), later);
        let much_later = later + Duration::from_secs(600);
        assert_eq!(ArtCache::lookup(cache.as_ref(), "a", much_later), Some(Some("new".into())), "settled: kept for the track");
        ArtCache::store(&mut cache, "b", None, much_later);
        assert_eq!(ArtCache::lookup(cache.as_ref(), "b", much_later), Some(None), "a track without a cover is not read again at once");
    }
}
