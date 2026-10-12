//! Small images for the deck: an app's icon or a wallpaper's thumbnail from
//! the shell (as Explorer shows them), encoded as PNG or JPEG and kept in the
//! app's cache folder, so a list opens without the shell again. The page gets
//! them as `data:` URLs, never the full image.

use std::path::Path;

/// How a picture is encoded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Format {
    /// Kept transparent: icons, the clipboard's images.
    Png,
    /// Smaller, opaque: the wallpapers' thumbnails.
    Jpeg,
}

impl Format {
    pub(crate) fn mime(self) -> &'static str {
        match self {
            Format::Png => "image/png",
            Format::Jpeg => "image/jpeg",
        }
    }

    pub(crate) fn extension(self) -> &'static str {
        match self {
            Format::Png => "png",
            Format::Jpeg => "jpg",
        }
    }
}

/// Pixels, four bytes each in blue, green, red, alpha order, rows from the top.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Pixels {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

/// The shell's picture flags (`SIIGBF_*`): only the icon, or only a thumbnail.
pub(crate) const ICON_ONLY: i32 = 0x4;
pub(crate) const THUMBNAIL_ONLY: i32 = 0x8;

/// `width` × `height` scaled down to fit in `side` × `side`, ratio kept, at least 1 × 1.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn fit(width: u32, height: u32, side: u32) -> (u32, u32) {
    if width == 0 || height == 0 { return (1, 1); }
    if width <= side && height <= side { return (width, height); }
    let scale = f64::from(side) / f64::from(width.max(height));
    (((f64::from(width) * scale).round() as u32).max(1), ((f64::from(height) * scale).round() as u32).max(1))
}

/// The shell gives premultiplied alpha, or no alpha at all (every pixel at
/// 0): straight alpha for the encoder, opaque when there was none.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn straighten(bgra: &mut [u8]) {
    if bgra.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 0) {
        for pixel in bgra.as_chunks_mut::<4>().0 { pixel[3] = 255; }
        return;
    }
    // A channel above its alpha: the image was not premultiplied, keep it.
    if bgra.as_chunks::<4>().0.iter().any(|pixel| pixel[0] > pixel[3] || pixel[1] > pixel[3] || pixel[2] > pixel[3]) { return; }
    for pixel in bgra.as_chunks_mut::<4>().0 {
        let alpha = u32::from(pixel[3]);
        if alpha == 0 || alpha == 255 { continue; }
        for channel in &mut pixel[..3] {
            *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
        }
    }
}

/// Shrinks pixels to fit in `side` × `side`, each new pixel the average of the ones it covers.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn shrink(image: &Pixels, side: u32) -> Pixels {
    let (width, height) = fit(image.width, image.height, side);
    if (width, height) == (image.width, image.height) { return image.clone(); }
    let (source_w, source_h) = (image.width as usize, image.height as usize);
    let mut bgra = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height as usize {
        let top = y * source_h / height as usize;
        let bottom = ((y + 1) * source_h / height as usize).max(top + 1).min(source_h);
        for x in 0..width as usize {
            let left = x * source_w / width as usize;
            let right = ((x + 1) * source_w / width as usize).max(left + 1).min(source_w);
            let mut sum = [0u64; 4];
            for row in top..bottom {
                for column in left..right {
                    let at = (row * source_w + column) * 4;
                    for (total, value) in sum.iter_mut().zip(&image.bgra[at..at + 4]) { *total += u64::from(*value); }
                }
            }
            let count = ((bottom - top) * (right - left)) as u64;
            bgra.extend(sum.iter().map(|total| ((total + count / 2) / count) as u8));
        }
    }
    Pixels { width, height, bgra }
}

/// A file's name in the cache: its path (whatever its case), its size and
/// date, and the picture's side, so a changed file gets a new picture.
pub(crate) fn cache_key(path: &str, modified: u64, length: u64, side: u32) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let text = format!("{}|{modified}|{length}|{side}", path.to_lowercase());
    for byte in text.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

pub(crate) fn data_url(format: Format, bytes: &[u8]) -> String {
    use base64::Engine;
    format!("data:{};base64,{}", format.mime(), base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// A file's picture from the cache, or made and kept there; `None` when it cannot be made.
pub(crate) fn cached(dir: &Path, file: &Path, side: u32, format: Format, make: impl FnOnce() -> Option<Vec<u8>>) -> Option<String> {
    let meta = std::fs::metadata(file).ok()?;
    let modified = meta.modified().ok().and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |since| since.as_secs());
    let key = cache_key(&file.to_string_lossy(), modified, meta.len(), side);
    let kept = dir.join(format!("{key}.{}", format.extension()));
    if let Ok(bytes) = std::fs::read(&kept) {
        if !bytes.is_empty() { return Some(data_url(format, &bytes)); }
    }
    let bytes = make()?;
    // The cache is a help: a picture that cannot be kept is still shown.
    let _ = std::fs::write(&kept, &bytes);
    Some(data_url(format, &bytes))
}

pub(crate) use imp::{encode, shell_image, Com};
#[cfg(windows)]
pub(crate) use imp::decode_png;

#[cfg(windows)]
mod imp {
    use super::{straighten, Format, Pixels};
    use windows::core::HSTRING;
    use windows::Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapEncoder, BitmapPixelFormat, BitmapTransform, ColorManagementMode, ExifOrientationMode,
    };
    use windows::Storage::Streams::{Buffer, DataReader, DataWriter, InMemoryRandomAccessStream, InputStreamOptions};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF};

    /// COM on this thread for as long as it lives.
    pub(crate) struct Com(bool);

    impl Com {
        pub(crate) fn mta() -> Com {
            // SAFETY: balanced by `drop` when it joined.
            Com(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
        }
    }

    impl Drop for Com {
        fn drop(&mut self) {
            // SAFETY: this thread joined COM in `mta`.
            if self.0 { unsafe { CoUninitialize() } }
        }
    }

    /// What the shell shows for a file, at most `side` × `side`, straight alpha.
    pub(crate) fn shell_image(path: &str, side: u32, flags: i32) -> Option<Pixels> {
        // SAFETY: COM is set up by the caller (`Com`); the path outlives the call.
        let factory: IShellItemImageFactory = unsafe { SHCreateItemFromParsingName(&HSTRING::from(path), None) }.ok()?;
        let side = i32::try_from(side).ok()?;
        // SAFETY: the bitmap is ours, deleted in `pixels_of`.
        let bitmap = unsafe { factory.GetImage(SIZE { cx: side, cy: side }, SIIGBF(flags)) }.ok()?;
        let mut pixels = pixels_of(bitmap)?;
        straighten(&mut pixels.bgra);
        Some(pixels)
    }

    /// A bitmap's pixels, top row first; the bitmap is deleted.
    fn pixels_of(bitmap: HBITMAP) -> Option<Pixels> {
        let mut info = BITMAP::default();
        // SAFETY: `info` is a BITMAP of the size given.
        let read = unsafe { GetObjectW(bitmap.into(), std::mem::size_of::<BITMAP>() as i32, Some((&raw mut info).cast())) };
        let result = (|| {
            if read == 0 || info.bmWidth <= 0 || info.bmHeight == 0 { return None; }
            let (width, height) = (info.bmWidth, info.bmHeight.abs());
            let mut header = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    // Negative: rows from the top.
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bgra = vec![0u8; width as usize * height as usize * 4];
            // SAFETY: the screen's DC is released below; `bgra` holds `height` rows of 32 bits.
            let copied = unsafe {
                let dc = GetDC(None);
                let copied = GetDIBits(dc, bitmap, 0, height as u32, Some(bgra.as_mut_ptr().cast()), &mut header, DIB_RGB_COLORS);
                ReleaseDC(None, dc);
                copied
            };
            (copied > 0).then_some(Pixels { width: width as u32, height: height as u32, bgra })
        })();
        // SAFETY: the shell gave this bitmap to us.
        unsafe {
            let _ = DeleteObject(bitmap.into());
        }
        result
    }

    /// Encodes pixels as PNG (transparent) or JPEG.
    pub(crate) fn encode(image: &Pixels, format: Format) -> Option<Vec<u8>> {
        let run = || -> windows::core::Result<Vec<u8>> {
            let output = InMemoryRandomAccessStream::new()?;
            let (id, alpha) = match format {
                Format::Png => (BitmapEncoder::PngEncoderId()?, BitmapAlphaMode::Straight),
                Format::Jpeg => (BitmapEncoder::JpegEncoderId()?, BitmapAlphaMode::Ignore),
            };
            let encoder = BitmapEncoder::CreateAsync(id, &output)?.get()?;
            encoder.SetPixelData(BitmapPixelFormat::Bgra8, alpha, image.width, image.height, 96.0, 96.0, &image.bgra)?;
            encoder.FlushAsync()?.get()?;
            let size = u32::try_from(output.Size()?).unwrap_or(u32::MAX);
            let filled = output.GetInputStreamAt(0)?.ReadAsync(&Buffer::Create(size)?, size, InputStreamOptions::None)?.get()?;
            let mut bytes = vec![0u8; filled.Length()? as usize];
            DataReader::FromBuffer(&filled)?.ReadBytes(&mut bytes)?;
            Ok(bytes)
        };
        run().ok().filter(|bytes| !bytes.is_empty())
    }

    /// A PNG back to pixels, straight alpha.
    pub(crate) fn decode_png(bytes: &[u8]) -> Option<Pixels> {
        let run = || -> windows::core::Result<Pixels> {
            let stream = InMemoryRandomAccessStream::new()?;
            let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0)?)?;
            writer.WriteBytes(bytes)?;
            writer.StoreAsync()?.get()?;
            writer.FlushAsync()?.get()?;
            writer.DetachStream()?;
            stream.Seek(0)?;
            let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
            let (width, height) = (decoder.PixelWidth()?, decoder.PixelHeight()?);
            let bgra = decoder
                .GetPixelDataTransformedAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Straight, &BitmapTransform::new()?, ExifOrientationMode::IgnoreExifOrientation, ColorManagementMode::DoNotColorManage)?
                .get()?
                .DetachPixelData()?
                .to_vec();
            Ok(Pixels { width, height, bgra })
        };
        run().ok().filter(|image| image.bgra.len() == image.width as usize * image.height as usize * 4)
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{Format, Pixels};

    pub(crate) struct Com;

    impl Com {
        pub(crate) fn mta() -> Com { Com }
    }

    pub(crate) fn shell_image(_path: &str, _side: u32, _flags: i32) -> Option<Pixels> { None }
    pub(crate) fn encode(_image: &Pixels, _format: Format) -> Option<Vec<u8>> { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_picture_fits_its_side_and_keeps_its_ratio() {
        assert_eq!(fit(1920, 1080, 320), (320, 180));
        assert_eq!(fit(1080, 1920, 320), (180, 320));
        assert_eq!(fit(40, 30, 64), (40, 30), "a small one is not enlarged");
        assert_eq!(fit(10_000, 1, 100), (100, 1), "never zero wide");
        assert_eq!(fit(0, 5, 64), (1, 1));
    }

    #[test]
    fn premultiplied_pixels_are_straightened() {
        let mut bgra = vec![64, 32, 0, 128, 0, 0, 0, 0, 255, 255, 255, 255];
        straighten(&mut bgra);
        assert_eq!(bgra, vec![128, 64, 0, 128, 0, 0, 0, 0, 255, 255, 255, 255]);
    }

    #[test]
    fn a_picture_without_alpha_turns_opaque_and_a_straight_one_is_kept() {
        let mut none = vec![10, 20, 30, 0, 40, 50, 60, 0];
        straighten(&mut none);
        assert_eq!(none, vec![10, 20, 30, 255, 40, 50, 60, 255]);
        let mut straight = vec![200, 10, 10, 100, 0, 0, 0, 0];
        straighten(&mut straight);
        assert_eq!(straight, vec![200, 10, 10, 100, 0, 0, 0, 0]);
    }

    #[test]
    fn shrinking_averages_the_pixels_it_covers() {
        let image = Pixels { width: 2, height: 2, bgra: vec![0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255] };
        let small = shrink(&image, 1);
        assert_eq!((small.width, small.height), (1, 1));
        assert_eq!(small.bgra, vec![100, 100, 100, 255]);
        assert_eq!(shrink(&image, 4), image, "a small one is kept");
        let wide = Pixels { width: 7, height: 3, bgra: vec![9; 7 * 3 * 4] };
        let shrunk = shrink(&wide, 4);
        assert_eq!(shrunk.bgra.len(), (shrunk.width * shrunk.height * 4) as usize);
    }

    #[test]
    fn the_cache_key_changes_with_the_file_and_not_with_case() {
        let key = cache_key(r"C:\Pics\Sea.jpg", 10, 2000, 320);
        assert_eq!(key, cache_key(r"c:\pics\sea.JPG", 10, 2000, 320));
        assert_ne!(key, cache_key(r"C:\Pics\Sea.jpg", 11, 2000, 320));
        assert_ne!(key, cache_key(r"C:\Pics\Sea.jpg", 10, 2001, 320));
        assert_ne!(key, cache_key(r"C:\Pics\Sea.jpg", 10, 2000, 64));
        assert_eq!(key.len(), 16);
    }

    #[test]
    fn a_kept_picture_is_read_back_without_making_it_again() {
        let dir = std::env::temp_dir().join(format!("bots-deck-cache-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("source.bin");
        std::fs::write(&file, b"source").unwrap();
        let first = cached(&dir, &file, 64, Format::Png, || Some(vec![1, 2, 3]));
        assert_eq!(first.as_deref(), Some("data:image/png;base64,AQID"));
        let again = cached(&dir, &file, 64, Format::Png, || panic!("made twice"));
        assert_eq!(again, first);
        assert_eq!(cached(&dir, &dir.join("missing"), 64, Format::Png, || Some(vec![1])), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
