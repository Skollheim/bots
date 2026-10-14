//! The island's bar: a link the user added there opens in the default browser, http and https only.

/// The longest link taken, in bytes.
const MAX: usize = 2048;

/// Whether `url` is a web address: http or https (any case), a host before the
/// first `/`, `?` or `#` with a letter or a digit in it (its port aside), and
/// no whitespace, control or quote-like characters.
pub(crate) fn valid(url: &str) -> bool {
    let Some((scheme, rest)) = url.split_once("://") else { return false };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    // The host alone: without what comes before an `@` and without its port; an IPv6 one keeps its brackets' inside.
    let host = authority.rsplit_once('@').map_or(authority, |(_, host)| host);
    let host = if host.starts_with('[') { host.split_once(']').map_or("", |(inside, _)| inside) } else { host.split(':').next().unwrap_or("") };
    (1..=MAX).contains(&url.len())
        && (scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https"))
        && host.chars().any(|c| c.is_ascii_alphanumeric())
        && !url.chars().any(|c| c.is_whitespace() || c.is_ascii_control() || matches!(c, '"' | '<' | '>' | '`'))
}

/// Opens a web link in the default browser; anything else is refused before a launch.
pub(crate) fn open(url: &str) -> Result<(), String> {
    if !valid(url) { return Err("this link is not a web address".into()); }
    imp::launch(url)
}

#[cfg(windows)]
mod imp {
    use crate::computer::wide;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    /// The shell opens the link with the default browser.
    pub(super) fn launch(url: &str) -> Result<(), String> {
        let (verb, file) = (wide("open"), wide(url));
        // SAFETY: both strings are NUL-terminated and outlive the call; the rest is optional.
        let code = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
        // Above 32: it opened.
        if code as isize > 32 { Ok(()) } else { Err(format!("the link did not open ({})", code as isize)) }
    }
}

#[cfg(target_os = "macos")]
mod imp {
    /// `open` hands the link to the default browser.
    pub(super) fn launch(url: &str) -> Result<(), String> {
        let mut child = std::process::Command::new("open").arg(url).spawn().map_err(|error| error.to_string())?;
        // Waited for apart, so it leaves no zombie behind.
        std::thread::spawn(move || child.wait());
        Ok(())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    /// `xdg-open` hands the link to the default browser.
    pub(super) fn launch(url: &str) -> Result<(), String> {
        let mut child = std::process::Command::new("xdg-open").arg(url).spawn().map_err(|error| error.to_string())?;
        // Waited for apart, so it leaves no zombie behind.
        std::thread::spawn(move || child.wait());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_addresses_are_accepted() {
        let longest = format!("https://{}", "a".repeat(MAX - 8));
        for url in ["https://example.com", "http://localhost:3000/x?y=1#z", "http://[::1]:8080/", "HTTPS://EXAMPLE.COM/path", longest.as_str()] {
            assert!(valid(url), "{url}");
        }
    }

    #[test]
    fn anything_else_is_refused() {
        let too_long = format!("https://{}", "a".repeat(MAX - 7));
        for url in [
            "", "example.com", "javascript:alert(1)", "file:///C:/x", "ftp://x.org", "https://", "https:///path", "https://?q",
            "https://:", "https://:80/x", "https://exa mple.com", "https://a\nb", " https://example.com", "https://a.com/\"x", "https://a.com/<x>", "https://a.com/`x`",
            too_long.as_str(),
        ] {
            assert!(!valid(url), "{url}");
        }
    }

    #[test]
    fn a_script_link_is_refused_before_anything_launches() {
        assert_eq!(open("javascript:alert(1)"), Err("this link is not a web address".to_string()));
    }
}
