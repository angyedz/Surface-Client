use crate::error::{LauncherError, Result};
use crate::paths;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

#[derive(Clone)]
struct LogConfig {
    launcher: Option<PathBuf>,
    mods: Option<PathBuf>,
}

static CONFIG: OnceLock<RwLock<LogConfig>> = OnceLock::new();

fn config() -> &'static RwLock<LogConfig> {
    CONFIG.get_or_init(|| RwLock::new(LogConfig { launcher: None, mods: None }))
}

fn default_path(name: &str) -> Result<PathBuf> {
    Ok(paths::root_dir()?.join("logs").join(name))
}

pub fn configure(launcher: Option<String>, mods: Option<String>) -> Result<()> {
    let launcher = launcher.filter(|v| !v.trim().is_empty()).map(PathBuf::from);
    let mods = mods.filter(|v| !v.trim().is_empty()).map(PathBuf::from);
    for path in [launcher.as_ref(), mods.as_ref()].into_iter().flatten() {
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
        OpenOptions::new().create(true).append(true).open(path)?;
    }
    *config().write().map_err(|_| LauncherError::msg("log configuration lock failed"))? = LogConfig { launcher, mods };
    Ok(())
}

pub fn write(logger: &str, level: &str, message: &str) {
    let is_mod = logger.to_lowercase().contains("mod") || logger.to_lowercase().contains("depend");
    let configured = config().read().ok().and_then(|value| if is_mod { value.mods.clone() } else { value.launcher.clone() });
    let path = configured.or_else(|| default_path(if is_mod { "mods.log" } else { "launcher.log" }).ok());
    let Some(path) = path else { return; };
    if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] [{}] {}", level, logger, message);
    }
}

pub fn defaults() -> Result<serde_json::Value> {
    Ok(serde_json::json!({
        "launcher": default_path("launcher.log")?,
        "mods": default_path("mods.log")?,
    }))
}
