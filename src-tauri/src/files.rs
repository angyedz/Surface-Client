//! Instance content on disk: mod jars and screenshots.

use crate::error::Result;
use crate::net;
use crate::paths;
use crate::logging;
use serde::{Deserialize, Serialize};

const DISABLED_SUFFIX: &str = ".disabled";

#[derive(Debug, Clone, Deserialize)]
pub struct ModFile {
    pub file_name: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct ModSyncReport {
    pub downloaded: Vec<String>,
    pub removed: Vec<String>,
    pub failed: Vec<String>,
}

/// Makes the instance's `mods/` directory match the mod list exactly.
///
/// Disabled mods keep their jar but gain the `.disabled` suffix that every
/// loader ignores, so toggling a mod never needs a re-download.
pub async fn sync_mods(instance_id: &str, mods: Vec<ModFile>) -> Result<ModSyncReport> {
    let mods_dir = paths::instance_mods_dir(instance_id)?;
    paths::ensure_dir(&mods_dir).await?;

    let mut report = ModSyncReport {
        downloaded: Vec::new(),
        removed: Vec::new(),
        failed: Vec::new(),
    };

    let mut expected: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in &mods {
        let target_name = if entry.enabled {
            entry.file_name.clone()
        } else {
            format!("{}{DISABLED_SUFFIX}", entry.file_name)
        };
        expected.insert(target_name.clone());

        let target = mods_dir.join(&target_name);
        let opposite = mods_dir.join(if entry.enabled {
            format!("{}{DISABLED_SUFFIX}", entry.file_name)
        } else {
            entry.file_name.clone()
        });

        // A toggle is a rename, never a download.
        if !target.exists() && opposite.exists() {
            tokio::fs::rename(&opposite, &target).await?;
            continue;
        }

        if net::is_file_valid(&target, entry.sha1.as_deref()).await {
            continue;
        }

        match net::download_file(&entry.url, &target, entry.sha1.as_deref()).await {
            Ok(_) => {
                logging::write("ModSync", "INFO", &format!("Downloaded {} for instance {}", entry.file_name, instance_id));
                report.downloaded.push(target_name)
            }
            Err(error) => {
                logging::write("ModSync", "ERROR", &format!("Failed {} for instance {}: {error}", entry.file_name, instance_id));
                report.failed.push(format!("{}: {error}", entry.file_name))
            }
        }
    }

    let mut dir = tokio::fs::read_dir(&mods_dir).await?;
    while let Some(entry) = dir.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_jar = name.ends_with(".jar") || name.ends_with(".jar.disabled");
        if is_jar && !expected.contains(&name) {
            tokio::fs::remove_file(entry.path()).await?;
            report.removed.push(name);
        }
    }

    Ok(report)
}

#[derive(Debug, Clone, Serialize)]
pub struct Screenshot {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    /// Unix milliseconds of the file's modification time.
    pub taken_at: u64,
}

/// Real screenshots the game wrote into the instance's `screenshots/` folder.
pub async fn list_screenshots(instance_id: &str) -> Result<Vec<Screenshot>> {
    let dir = paths::instance_screenshots_dir(instance_id)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut screenshots = Vec::new();
    let mut entries = tokio::fs::read_dir(&dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".png") {
            continue;
        }
        let metadata = entry.metadata().await?;
        let taken_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        screenshots.push(Screenshot {
            file_name: name,
            path: entry.path().to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            taken_at,
        });
    }

    screenshots.sort_by(|a, b| b.taken_at.cmp(&a.taken_at));
    Ok(screenshots)
}

pub async fn list_mod_files(instance_id: &str) -> Result<Vec<String>> {
    let dir = paths::instance_mods_dir(instance_id)?;
    if !dir.exists() { return Ok(Vec::new()); }
    let mut files = Vec::new();
    let mut entries = tokio::fs::read_dir(dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".jar") || name.ends_with(".jar.disabled") { files.push(name); }
    }
    files.sort();
    Ok(files)
}

pub async fn delete_screenshot(path: String) -> Result<()> {
    let screenshots_root = paths::instances_dir()?;
    let candidate = std::path::PathBuf::from(&path);
    // Never delete outside the launcher's own instance tree.
    if !candidate.starts_with(&screenshots_root) {
        return Err(crate::error::LauncherError::msg(
            "refusing to delete a file outside the instances directory",
        ));
    }
    tokio::fs::remove_file(candidate).await?;
    Ok(())
}

/// Strips any directory part from a user-supplied file name.
fn safe_file_name(name: &str) -> String {
    // The set Windows rejects is the widest, so applying it everywhere keeps an
    // export written on one platform readable on the others.
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
        .filter(|c| !c.is_control())
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.');
    if trimmed.is_empty() {
        "export.bin".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Writes an exported file into the launcher's `exports/` folder.
///
/// The webview cannot perform browser downloads, so anything the UI wants to
/// hand to the user is written here and the path is reported back.
pub async fn save_export(file_name: String, data: Vec<u8>) -> Result<String> {
    let dir = paths::root_dir()?.join("exports");
    paths::ensure_dir(&dir).await?;
    let target = dir.join(safe_file_name(&file_name));
    tokio::fs::write(&target, data).await?;
    Ok(target.to_string_lossy().to_string())
}

/// Opens a folder in the desktop file manager.
pub fn open_in_file_manager(path: &std::path::Path) -> Result<()> {
    let opener = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };

    std::process::Command::new(opener)
        .arg(path)
        .spawn()
        .map_err(|e| crate::error::LauncherError::msg(format!("could not open {path:?}: {e}")))?;
    Ok(())
}

/// Which folder of an instance to reveal.
pub async fn instance_folder(instance_id: &str, kind: &str) -> Result<std::path::PathBuf> {
    let path = match kind {
        "mods" => paths::instance_mods_dir(instance_id)?,
        "screenshots" => paths::instance_screenshots_dir(instance_id)?,
        _ => paths::instance_game_dir(instance_id)?,
    };
    paths::ensure_dir(&path).await?;
    Ok(path)
}
