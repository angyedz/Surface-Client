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

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        roots.push(PathBuf::from(java_home));
    }

    let search_dirs: &[&str] = if cfg!(target_os = "windows") {
        &[
            "C:\\Program Files\\Java",
            "C:\\Program Files\\Eclipse Adoptium",
            "C:\\Program Files\\Microsoft\\jdk",
            "C:\\Program Files\\Zulu",
        ]
    } else if cfg!(target_os = "macos") {
        &["/Library/Java/JavaVirtualMachines"]
    } else {
        &["/usr/lib/jvm", "/usr/lib64/jvm", "/opt/java"]
    };

    for dir in search_dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                roots.push(path.clone());
                // macOS bundles nest the runtime inside the .jdk package.
                roots.push(path.join("Contents").join("Home"));
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

pub async fn install(major: u32) -> Result<JavaInstallation> {
    if !matches!(major, 8 | 17 | 21 | 25) {
        return Err(LauncherError::msg(format!("unsupported Java version: {major}")));
    }
    let api = format!(
        "https://api.adoptium.net/v3/assets/latest/{major}/hotspot?architecture=x64&os=linux&image_type=jdk&vendor=eclipse"
    );
    let assets: Vec<AdoptiumAsset> = net::get_json(&api).await?;
    let link = assets.first().ok_or_else(|| LauncherError::msg(format!("Java {major} is not available for this system")))?.binary.package.link.clone();
    let root = paths::root_dir()?.join("jvm");
    let archive = root.join(format!("java-{major}.tar.gz"));
    let target = root.join(format!("java-{major}"));
    tokio::fs::create_dir_all(&root).await?;
    tokio::fs::create_dir_all(&target).await?;
    net::download_file(&link, &archive, None).await?;

    let status = tokio::process::Command::new("tar")
        .args(["-xzf"])
        .arg(&archive)
        .arg("--strip-components=1")
        .arg("-C")
        .arg(&target)
        .status()
        .await?;
    if !status.success() {
        return Err(LauncherError::msg(format!("could not extract Java {major}")));
    }
    let binary = target.join("bin/java");
    probe(&binary)
}
