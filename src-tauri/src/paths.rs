use crate::error::{LauncherError, Result};
use std::path::PathBuf;

/// Root of every file the launcher owns.
///
/// The layout mirrors the official launcher closely enough that instances stay
/// readable by other tools: shared `libraries/`, `assets/` and `versions/`
/// caches, with one isolated game directory per instance.
pub fn root_dir() -> Result<PathBuf> {
    let base = dirs::data_dir()
        .ok_or_else(|| LauncherError::msg("unable to locate the user data directory"))?;
    Ok(base.join("SurfaceClient"))
}

pub fn versions_dir() -> Result<PathBuf> {
    Ok(root_dir()?.join("versions"))
}

pub fn version_dir(version_id: &str) -> Result<PathBuf> {
    Ok(versions_dir()?.join(version_id))
}

pub fn libraries_dir() -> Result<PathBuf> {
    Ok(root_dir()?.join("libraries"))
}

pub fn assets_dir() -> Result<PathBuf> {
    Ok(root_dir()?.join("assets"))
}

pub fn natives_dir(version_id: &str) -> Result<PathBuf> {
    Ok(root_dir()?.join("natives").join(version_id))
}

pub fn instances_dir() -> Result<PathBuf> {
    Ok(root_dir()?.join("instances"))
}

/// The `.minecraft` directory handed to the game as `--gameDir`.
pub fn instance_game_dir(instance_id: &str) -> Result<PathBuf> {
    Ok(instances_dir()?.join(instance_id).join(".minecraft"))
}

pub fn instance_mods_dir(instance_id: &str) -> Result<PathBuf> {
    Ok(instance_game_dir(instance_id)?.join("mods"))
}

pub fn instance_screenshots_dir(instance_id: &str) -> Result<PathBuf> {
    Ok(instance_game_dir(instance_id)?.join("screenshots"))
}

pub fn instance_install_marker(instance_id: &str) -> Result<PathBuf> {
    Ok(instance_game_dir(instance_id)?.join(".surface-install.json"))
}

pub async fn ensure_dir(path: &PathBuf) -> Result<()> {
    tokio::fs::create_dir_all(path).await?;
    Ok(())
}
