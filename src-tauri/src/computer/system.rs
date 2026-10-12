//! The system tab's numbers: CPU, memory, fixed drives, uptime and the
//! busiest processes, read once per call, the processes' CPU measured since
//! the call before. Closing a process and the four power actions are each one
//! small function here; the page asks the user before it calls them.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, PoisonError};

/// How many processes each ranking keeps: by CPU and by memory.
const TOP: usize = 5;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    /// `C:`.
    pub mount: String,
    /// The volume's name, empty when it has none.
    pub label: String,
    pub total: u64,
    pub free: u64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Proc {
    pub pid: u32,
    pub name: String,
    /// Percent of the whole computer, all cores together.
    pub cpu: f32,
    /// Bytes in memory (the working set).
    pub memory: u64,
    /// Seconds since 1970 when it started: with the pid, which process this is.
    pub started: u64,
    /// The deck may not close it (`protected`).
    pub protected: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub cpu: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub drives: Vec<Drive>,
    /// Seconds since the computer started.
    pub uptime: u64,
    /// The busiest processes by CPU and by memory, together.
    pub processes: Vec<Proc>,
}

/// Processes Windows needs, whoever runs them: lowercase, without `.exe`.
const SYSTEM: &[&str] = &[
    "system", "idle", "system idle process", "registry", "memory compression", "secure system", "smss", "csrss", "wininit", "winlogon",
    "services", "lsass", "lsaiso", "svchost", "dwm", "fontdrvhost", "explorer", "sihost", "ctfmon", "taskhostw", "runtimebroker",
    "startmenuexperiencehost", "shellexperiencehost", "searchhost", "searchapp", "searchindexer", "textinputhost", "applicationframehost",
    "audiodg", "conhost", "spoolsv", "wudfhost", "dllhost", "smartscreen", "securityhealthsystray", "securityhealthservice", "msmpeng",
    "nissrv", "lockapp", "userinit", "taskmgr", "widgets", "widgetservice", "phoneexperiencehost",
];

/// Boite's agents: Boite stops them, not the deck.
const AGENTS: &[&str] = &["claude", "codex"];

/// A process name as the lists above have it.
pub(crate) fn short_name(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    lower.strip_suffix(".exe").map(str::to_owned).unwrap_or(lower)
}

/// Boite (`boite-core`, `boite-shell`) and Bots itself.
fn is_boite(name: &str) -> bool {
    let name = short_name(name);
    name.starts_with("boite") || name.starts_with("bots")
}

/// Whether the deck may not close a process: one that is not the user's, a
/// process of Windows, Boite, Bots, an agent, anything Boite or Bots started
/// (their `node` and `bun`, their webviews), or Bots's own.
pub(crate) fn protected(name: &str, users: bool, ancestors: &[String], ours: bool) -> bool {
    let short = short_name(name);
    !users
        || ours
        || short.is_empty()
        || SYSTEM.contains(&short.as_str())
        || AGENTS.contains(&short.as_str())
        || is_boite(&short)
        || ancestors.iter().any(|ancestor| is_boite(ancestor))
}

/// The `top` busiest by CPU and the `top` busiest by memory, each once,
/// the busiest by CPU first.
pub(crate) fn busiest(mut rows: Vec<Proc>, top: usize) -> Vec<Proc> {
    rows.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then(b.memory.cmp(&a.memory)));
    let mut kept: Vec<Proc> = rows.iter().take(top).cloned().collect();
    rows.sort_by_key(|row| std::cmp::Reverse(row.memory));
    for row in rows.into_iter().take(top) {
        if !kept.iter().any(|known| known.pid == row.pid) { kept.push(row); }
    }
    kept
}

/// The process reader, made on the first call: its CPU readings count from
/// the call before.
#[derive(Default, Clone)]
pub(crate) struct Sampler(Arc<Mutex<Option<imp::Reader>>>);

impl Sampler {
    pub(crate) fn sample(&self) -> Result<Sample, String> {
        let mut reader = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(reader.get_or_insert_with(imp::Reader::new).read())
    }

    pub(crate) fn close(&self, pid: u32, started: u64) -> Result<(), String> {
        let mut reader = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        reader.as_mut().ok_or_else(|| "the processes have not been read yet".to_owned())?.close(pid, started)
    }
}

/// What a power button does.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Power {
    Lock,
    Sleep,
    Restart,
    Shutdown,
}

/// What `shutdown.exe` is given for a restart or a shutdown, at once.
pub(crate) fn shutdown_args(action: Power) -> Option<[&'static str; 3]> {
    match action {
        Power::Restart => Some(["/r", "/t", "0"]),
        Power::Shutdown => Some(["/s", "/t", "0"]),
        Power::Lock | Power::Sleep => None,
    }
}

/// Locks, sleeps, restarts or shuts the computer down.
pub(crate) fn power(action: Power) -> Result<(), String> { imp::power(action) }

#[cfg(windows)]
mod imp {
    use super::{busiest, protected, shutdown_args, Drive, Power, Proc, Sample, TOP};
    use crate::computer::{from_wide, wide};
    use sysinfo::{MemoryRefreshKind, Pid, Process, ProcessRefreshKind, ProcessesToUpdate, System, Uid, UpdateKind};

    pub(crate) struct Reader {
        system: System,
        me: Pid,
    }

    impl Reader {
        pub(crate) fn new() -> Self {
            Reader { system: System::new(), me: sysinfo::get_current_pid().unwrap_or_else(|_| Pid::from_u32(0)) }
        }

        fn kinds() -> ProcessRefreshKind {
            ProcessRefreshKind::nothing().with_cpu().with_memory().with_user(UpdateKind::OnlyIfNotSet)
        }

        pub(crate) fn read(&mut self) -> Sample {
            self.system.refresh_cpu_usage();
            self.system.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
            self.system.refresh_processes_specifics(ProcessesToUpdate::All, true, Self::kinds());
            let cores = self.system.cpus().len().max(1) as f32;
            let own = self.owner();
            let rows = self
                .system
                .processes()
                .values()
                .filter(|process| process.pid().as_u32() != 0)
                .map(|process| Proc {
                    pid: process.pid().as_u32(),
                    name: process.name().to_string_lossy().into_owned(),
                    cpu: (process.cpu_usage() / cores).clamp(0.0, 100.0),
                    memory: process.memory(),
                    started: process.start_time(),
                    protected: self.is_protected(process, own.as_ref()),
                })
                .collect();
            Sample {
                cpu: self.system.global_cpu_usage().clamp(0.0, 100.0),
                memory_used: self.system.used_memory(),
                memory_total: self.system.total_memory(),
                drives: drives(),
                uptime: System::uptime(),
                processes: busiest(rows, TOP),
            }
        }

        /// The user running Bots: the deck closes their processes only.
        fn owner(&self) -> Option<Uid> {
            self.system.process(self.me).and_then(Process::user_id).cloned()
        }

        fn is_protected(&self, process: &Process, own: Option<&Uid>) -> bool {
            let users = own.is_some() && process.user_id() == own;
            let mut ours = process.pid() == self.me;
            let mut ancestors = Vec::new();
            let mut next = process.parent();
            // A few generations are enough, and a loop of reused pids ends.
            for _ in 0..12 {
                let Some(pid) = next else { break };
                if pid == self.me { ours = true; }
                let Some(parent) = self.system.process(pid) else { break };
                ancestors.push(parent.name().to_string_lossy().into_owned());
                next = parent.parent();
            }
            protected(&process.name().to_string_lossy(), users, &ancestors, ours)
        }

        /// Whether a process of the last reading is protected; `None` when it is not in it.
        #[cfg(test)]
        pub(crate) fn protects(&self, pid: u32) -> Option<bool> {
            let own = self.owner();
            self.system.process(Pid::from_u32(pid)).map(|process| self.is_protected(process, own.as_ref()))
        }

        /// Closes `pid` if it is still the process that started at `started` and may be closed.
        pub(crate) fn close(&mut self, pid: u32, started: u64) -> Result<(), String> {
            let pid = Pid::from_u32(pid);
            self.system.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, Self::kinds());
            let own = self.owner();
            let process = self.system.process(pid).ok_or_else(|| "the process has already ended".to_owned())?;
            if process.start_time() != started { return Err("another process has taken its number".into()); }
            if self.is_protected(process, own.as_ref()) { return Err("this process may not be closed from here".into()); }
            if terminate(process) { Ok(()) } else { Err("the process could not be closed".into()) }
        }
    }

    /// The one call that ends a process.
    fn terminate(process: &Process) -> bool {
        process.kill()
    }

    /// The fixed drives, their name and space.
    fn drives() -> Vec<Drive> {
        use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW};
        const DRIVE_FIXED: u32 = 3;
        // SAFETY: plain value.
        let mask = unsafe { GetLogicalDrives() };
        (0u8..26)
            .filter(|bit| mask & (1 << bit) != 0)
            .filter_map(|bit| {
                let letter = char::from(b'A' + bit);
                let root = wide(&format!("{letter}:\\"));
                // SAFETY: `root` is a NUL-terminated string that outlives the call.
                if unsafe { GetDriveTypeW(root.as_ptr()) } != DRIVE_FIXED { return None; }
                let (mut free, mut total) = (0u64, 0u64);
                // SAFETY: the out values outlive the call; the last one is optional.
                if unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut free, &mut total, std::ptr::null_mut()) } == 0 { return None; }
                let mut label = [0u16; 128];
                // SAFETY: the buffer and its length are this array's; the other outputs are optional.
                unsafe {
                    GetVolumeInformationW(root.as_ptr(), label.as_mut_ptr(), label.len() as u32, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0)
                };
                Some(Drive { mount: format!("{letter}:"), label: from_wide(&label), total, free })
            })
            .collect()
    }

    /// Turns on the right to shut down, which sleeping asks for.
    fn allow_shutdown() {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, LUID};
        use windows_sys::Win32::Security::{AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY};
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
        let mut token: HANDLE = std::ptr::null_mut();
        // SAFETY: the token is closed below; the pseudo handle needs no closing.
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut token) } == 0 { return; }
        let mut luid = LUID { LowPart: 0, HighPart: 0 };
        let name = wide("SeShutdownPrivilege");
        // SAFETY: `name` and `luid` outlive the call.
        if unsafe { LookupPrivilegeValueW(std::ptr::null(), name.as_ptr(), &mut luid) } != 0 {
            let privileges = TOKEN_PRIVILEGES { PrivilegeCount: 1, Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }] };
            // SAFETY: `privileges` outlives the call; the previous state is not asked for.
            unsafe { AdjustTokenPrivileges(token, 0, &privileges, 0, std::ptr::null_mut(), std::ptr::null_mut()) };
        }
        // SAFETY: opened above.
        unsafe { CloseHandle(token) };
    }

    pub(super) fn power(action: Power) -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Power::SetSuspendState;
        use windows_sys::Win32::System::Shutdown::LockWorkStation;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        match action {
            // SAFETY: no arguments.
            Power::Lock => if unsafe { LockWorkStation() } != 0 { Ok(()) } else { Err("the session could not be locked".into()) },
            Power::Sleep => {
                allow_shutdown();
                // SAFETY: plain values: sleep, not hibernate, wake events kept.
                if unsafe { SetSuspendState(false, false, false) } { Ok(()) } else { Err("the computer could not go to sleep".into()) }
            }
            Power::Restart | Power::Shutdown => {
                let args = shutdown_args(action).unwrap_or_default();
                // The system's own copy, whatever PATH says.
                let root = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| r"C:\Windows".into());
                let status = std::process::Command::new(root.join("System32").join("shutdown.exe")).args(args).creation_flags(CREATE_NO_WINDOW).status();
                match status {
                    Ok(status) if status.success() => Ok(()),
                    Ok(status) => Err(format!("shutdown.exe ended with {status}")),
                    Err(error) => Err(error.to_string()),
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{Power, Sample};

    pub(crate) struct Reader;

    impl Reader {
        pub(crate) fn new() -> Self { Reader }
        pub(crate) fn read(&mut self) -> Sample { Sample::default() }
        pub(crate) fn close(&mut self, _pid: u32, _started: u64) -> Result<(), String> { Err("not on this system".into()) }
    }

    pub(super) fn power(_action: Power) -> Result<(), String> { Err("not on this system".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pid: u32, cpu: f32, memory: u64) -> Proc {
        Proc { pid, name: format!("p{pid}.exe"), cpu, memory, started: 1, protected: false }
    }

    #[test]
    fn windows_boite_bots_and_the_agents_are_protected() {
        for name in ["csrss.exe", "svchost.exe", "explorer.exe", "dwm.exe", "System", "boite-core.exe", "boite-shell.exe", "bots-x86_64-pc-windows-msvc.exe", "claude.exe", "codex"] {
            assert!(protected(name, true, &[], false), "{name}");
        }
    }

    #[test]
    fn what_boite_or_bots_started_is_protected_and_the_users_own_apps_are_not() {
        assert!(protected("node.exe", true, &["boite-core.exe".into()], false));
        assert!(protected("bun.exe", true, &["cmd.exe".into(), "boite-core.exe".into()], false), "a grandchild");
        assert!(protected("msedgewebview2.exe", true, &["bots.exe".into()], false));
        assert!(protected("msedgewebview2.exe", true, &[], true), "Bots's own child, by pid");
        assert!(!protected("node.exe", true, &["Code.exe".into(), "explorer.exe".into()], false), "the user's own node");
        assert!(!protected("chrome.exe", true, &["explorer.exe".into()], false));
        assert!(!protected("Unity.exe", true, &[], false));
    }

    #[test]
    fn a_process_that_is_not_the_users_is_protected() {
        assert!(protected("chrome.exe", false, &[], false));
        assert!(protected("", true, &[], false), "a nameless one");
    }

    #[test]
    fn names_are_compared_without_case_or_exe() {
        assert_eq!(short_name(" Explorer.EXE "), "explorer");
        assert_eq!(short_name("claude"), "claude");
    }

    #[test]
    fn the_busiest_by_cpu_come_first_then_the_heaviest_not_listed_yet() {
        let rows = vec![row(1, 1.0, 900), row(2, 50.0, 10), row(3, 20.0, 20), row(4, 0.0, 800), row(5, 5.0, 5)];
        let pids: Vec<u32> = busiest(rows.clone(), 2).iter().map(|row| row.pid).collect();
        assert_eq!(pids, vec![2, 3, 1, 4]);
        assert_eq!(busiest(rows, 5).len(), 5, "each process once");
        assert!(busiest(Vec::new(), 5).is_empty());
    }

    #[test]
    fn only_restart_and_shutdown_go_through_shutdown_exe() {
        assert_eq!(shutdown_args(Power::Restart), Some(["/r", "/t", "0"]));
        assert_eq!(shutdown_args(Power::Shutdown), Some(["/s", "/t", "0"]));
        assert_eq!(shutdown_args(Power::Lock), None);
        assert_eq!(shutdown_args(Power::Sleep), None);
    }

    #[test]
    fn the_page_names_the_four_actions_and_nothing_else() {
        for (text, action) in [("\"lock\"", Power::Lock), ("\"sleep\"", Power::Sleep), ("\"restart\"", Power::Restart), ("\"shutdown\"", Power::Shutdown)] {
            assert_eq!(serde_json::from_str::<Power>(text).unwrap(), action);
        }
        assert!(serde_json::from_str::<Power>("\"hibernate\"").is_err());
    }

    /// Reads the real computer, nothing more: the numbers come and Bots itself is protected.
    #[cfg(windows)]
    #[test]
    fn a_reading_of_this_computer_has_numbers_and_protects_bots() {
        let sampler = Sampler::default();
        let first = sampler.sample().unwrap();
        assert!(first.memory_total > 0 && first.memory_used <= first.memory_total);
        assert!(first.uptime > 0);
        assert!(!first.drives.is_empty(), "a fixed drive at least");
        assert!(first.processes.len() <= TOP * 2 && !first.processes.is_empty());
        let reader = sampler.0.lock().unwrap();
        let mine = reader.as_ref().unwrap().protects(std::process::id());
        assert_eq!(mine, Some(true), "the test process itself is ours");
    }
}
