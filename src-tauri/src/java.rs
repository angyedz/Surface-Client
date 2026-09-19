//! Discovery of Java runtimes installed on the host.

use crate::error::{LauncherError, Result};
use crate::{net, paths};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub major: u32,
    pub vendor: String,
}

fn executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "javaw.exe"
    } else {
        "java"
    }
}

/// Parses `java -version` output, which goes to stderr in the form
/// `openjdk version "21.0.2" 2024-01-16`.
fn parse_version(output: &str) -> Option<(String, u32, String)> {
    let line = output.lines().next()?;
    let version = line.split('"').nth(1)?.to_string();

    let mut parts = version.split(['.', '-', '_']);
    let first: u32 = parts.next()?.parse().ok()?;
    // Java 8 and older report as `1.8.0_402`; the real major is the second field.
    let major = if first == 1 {
        parts.next()?.parse().ok()?
    } else {
        first
    };

    let vendor = line
        .split_whitespace()
        .next()
        .unwrap_or("java")
        .to_string();
    Some((version, major, vendor))
}

pub fn probe(path: &Path) -> Result<JavaInstallation> {
    // `javaw` on Windows is windowless and prints nothing, so probing always
    // uses the console binary that sits next to it.
    let probe_path = if path.file_name().and_then(|n| n.to_str()) == Some("javaw.exe") {
        path.with_file_name("java.exe")
    } else {
        path.to_path_buf()
    };

    let output = Command::new(&probe_path)
        .arg("-version")
        .output()
        .map_err(|e| LauncherError::msg(format!("cannot run {}: {e}", probe_path.display())))?;

    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let (version, major, vendor) = parse_version(&text).ok_or_else(|| {
        LauncherError::msg(format!("{} did not report a Java version", probe_path.display()))
    })?;

    Ok(JavaInstallation {
        path: path.to_string_lossy().to_string(),
        version,
        major,
        vendor,
    })
}

/// Directories that commonly hold a JDK on this platform.
///
/// Windows paths come from the environment rather than a literal `C:\`, since a
/// machine that installs to another drive still reports it through
/// `%ProgramFiles%`. macOS and Linux both have a system-wide location and a
/// per-user one, and package managers add their own.
fn search_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir();
    let mut dirs: Vec<PathBuf> = Vec::new();

    // Runtimes the launcher downloaded itself must be found again after a
    // restart, otherwise installing Java appears to do nothing the next time.
    if let Ok(root) = crate::paths::root_dir() {
        dirs.push(root.join("jvm"));
    }

    if cfg!(target_os = "windows") {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            let Some(base) = std::env::var_os(variable).map(PathBuf::from) else {
                continue;
            };
            dirs.push(base.join("Java"));
            dirs.push(base.join("Eclipse Adoptium"));
            dirs.push(base.join("Microsoft").join("jdk"));
            dirs.push(base.join("Zulu"));
            dirs.push(base.join("Amazon Corretto"));
            dirs.push(base.join("BellSoft"));
        }
        // The official Minecraft launcher keeps its own runtimes here.
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            dirs.push(appdata.join(".minecraft").join("runtime"));
        }
    } else if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/Library/Java/JavaVirtualMachines"));
        dirs.push(PathBuf::from("/opt/homebrew/opt"));
        dirs.push(PathBuf::from("/usr/local/opt"));
        if let Some(home) = &home {
            dirs.push(home.join("Library/Java/JavaVirtualMachines"));
        }
    } else {
        dirs.push(PathBuf::from("/usr/lib/jvm"));
        dirs.push(PathBuf::from("/usr/lib64/jvm"));
        dirs.push(PathBuf::from("/usr/java"));
        dirs.push(PathBuf::from("/opt/java"));
        if let Some(home) = &home {
            dirs.push(home.join(".sdkman/candidates/java"));
        }
    }

    dirs
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        roots.push(PathBuf::from(java_home));
    }

    for dir in search_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                roots.push(path.clone());
                // macOS bundles nest the runtime inside the .jdk package, and
                // the official launcher's runtimes add one directory of their
                // own before it.
                roots.push(path.join("Contents").join("Home"));
                roots.push(path.join("jre.bundle").join("Contents").join("Home"));
            }
        }
    }

    roots
}

/// Every usable runtime found on the machine, newest major version first.
pub fn discover() -> Vec<JavaInstallation> {
    let mut candidates: BTreeSet<PathBuf> = BTreeSet::new();

    for root in candidate_roots() {
        let binary = root.join("bin").join(executable_name());
        if binary.exists() {
            candidates.insert(binary);
        }
    }

    // Whatever is on PATH counts too, and is often the only one on Linux.
    let which = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = Command::new(which).arg("java").output() {
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let path = PathBuf::from(line.trim());
            if path.exists() {
                candidates.insert(path);
            }
        }
    }

    let mut found: Vec<JavaInstallation> = candidates
        .iter()
        .filter_map(|path| probe(path).ok())
        .collect();

    found.sort_by(|a, b| b.major.cmp(&a.major).then(a.path.cmp(&b.path)));
    found.dedup_by(|a, b| a.path == b.path);
    found
}

/// Picks the runtime that exactly matches the major version a release requires.
///
/// Mod loaders are stricter than vanilla Minecraft: older Forge versions can
/// fail during module resolution on a newer JVM, so silently substituting Java
/// 25 for a Java 17 instance is unsafe.
pub fn select_for(required_major: u32) -> Option<JavaInstallation> {
    let installations = discover();
    installations.iter().find(|j| j.major == required_major).cloned()
}

/// A runtime to run launcher-side tooling with, such as the Forge installer.
///
/// `java` is not reliably on PATH — Windows installers do not add it and the
/// runtimes this launcher downloads never are — so a discovered installation is
/// used when there is one, newest first.
pub fn tooling_binary() -> std::ffi::OsString {
    discover()
        .first()
        .map(|installation| {
            // Tooling output has to be readable, so use the console binary
            // rather than the windowless one discovery reports.
            let path = Path::new(&installation.path);
            if path.file_name().and_then(|n| n.to_str()) == Some("javaw.exe") {
                path.with_file_name("java.exe").into_os_string()
            } else {
                std::ffi::OsString::from(&installation.path)
            }
        })
        .unwrap_or_else(|| std::ffi::OsString::from("java"))
}

#[derive(serde::Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

#[derive(serde::Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(serde::Deserialize)]
struct AdoptiumPackage {
    link: String,
}

/// The operating system name Adoptium uses in its asset queries.
fn adoptium_os() -> Result<&'static str> {
    Ok(if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        return Err(LauncherError::msg(
            "Adoptium does not publish builds for this operating system; install Java manually",
        ));
    })
}

/// The architecture name Adoptium uses, including the ARM builds.
///
/// Apple Silicon and the 64-bit ARM boards both report `aarch64`; 32-bit ARM,
/// which still turns up on single-board machines, is published as `arm`.
fn adoptium_arch() -> Result<&'static str> {
    Ok(if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "arm") {
        "arm"
    } else if cfg!(target_arch = "x86") {
        "x86"
    } else if cfg!(target_arch = "riscv64") {
        "riscv64"
    } else if cfg!(target_arch = "powerpc64") {
        "ppc64le"
    } else {
        return Err(LauncherError::msg(
            "Adoptium does not publish builds for this CPU architecture; install Java manually",
        ));
    })
}

/// Unpacks a downloaded JDK, dropping the single top-level directory the
/// archive wraps everything in.
///
/// Windows gets a zip, every other platform a gzipped tar. The zip goes through
/// the crate the launcher already uses for natives; the tar goes through the
/// system `tar`, which ships with both macOS and every Linux distribution.
async fn extract_jdk(archive: &Path, target: &Path, is_zip: bool) -> Result<()> {
    if !is_zip {
        let status = tokio::process::Command::new("tar")
            .arg("-xzf")
            .arg(archive)
            .arg("--strip-components=1")
            .arg("-C")
            .arg(target)
            .status()
            .await?;
        if !status.success() {
            return Err(LauncherError::msg("could not unpack the downloaded JDK archive"));
        }
        return Ok(());
    }

    let archive = archive.to_path_buf();
    let target = target.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&archive)?)?;
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index)?;
            let Some(path) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
                continue;
            };
            // Strip the wrapper directory, so the layout matches the tar path.
            let mut components = path.components();
            components.next();
            let relative = components.as_path();
            if relative.as_os_str().is_empty() {
                continue;
            }

            let out = target.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&out)?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut file = std::fs::File::create(&out)?;
            std::io::copy(&mut entry, &mut file)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| LauncherError::msg(format!("unpacking the JDK failed: {e}")))?
}

/// Finds the java binary inside an unpacked JDK.
///
/// macOS builds nest the runtime under `Contents/Home`, everything else puts
/// `bin` at the top level.
fn java_binary_in(root: &Path) -> Result<PathBuf> {
    for prefix in ["bin", "Contents/Home/bin"] {
        let dir = root.join(prefix);
        // Prefer the windowless launcher where there is one, so starting the
        // game does not also open a console window.
        for name in [executable_name(), "java.exe", "java"] {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }
    Err(LauncherError::msg(format!(
        "the unpacked JDK at {} contains no java binary",
        root.display()
    )))
}

/// Downloads an Eclipse Temurin JDK for this machine and reports it like any
/// other discovered installation.
pub async fn install(major: u32) -> Result<JavaInstallation> {
    // Minecraft and its loaders only ever ask for these, and Adoptium keeps
    // builds of all of them across every platform the launcher runs on.
    if !matches!(major, 8 | 11 | 16 | 17 | 21 | 25) {
        return Err(LauncherError::msg(format!("unsupported Java version: {major}")));
    }

    let os = adoptium_os()?;
    let arch = adoptium_arch()?;
    let api = format!(
        "https://api.adoptium.net/v3/assets/latest/{major}/hotspot\
         ?architecture={arch}&os={os}&image_type=jdk&vendor=eclipse"
    );

    let assets: Vec<AdoptiumAsset> = net::get_json(&api).await?;
    let link = assets
        .first()
        .ok_or_else(|| {
            LauncherError::msg(format!(
                "Eclipse Temurin has no Java {major} build for {os}/{arch}"
            ))
        })?
        .binary
        .package
        .link
        .clone();

    let is_zip = link.ends_with(".zip");
    let root = paths::root_dir()?.join("jvm");
    let archive = root.join(format!("java-{major}{}", if is_zip { ".zip" } else { ".tar.gz" }));
    let target = root.join(format!("java-{major}"));

    // A half-unpacked directory from an interrupted run would shadow the real
    // binary, so the target always starts empty.
    if target.exists() {
        tokio::fs::remove_dir_all(&target).await?;
    }
    tokio::fs::create_dir_all(&target).await?;

    net::download_file(&link, &archive, None).await?;
    extract_jdk(&archive, &target, is_zip).await?;
    let _ = tokio::fs::remove_file(&archive).await;

    let binary = java_binary_in(&target)?;

    // The tar and zip readers both drop the executable bit.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = tokio::fs::metadata(&binary).await?.permissions();
        permissions.set_mode(permissions.mode() | 0o755);
        tokio::fs::set_permissions(&binary, permissions).await?;
    }

    probe(&binary)
}
