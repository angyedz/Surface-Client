//! Builds the JVM command line and supervises the running game process.

use crate::error::{LauncherError, Result};
use crate::install::InstalledVersion;
use crate::java;
use crate::meta::{self, VersionJson};
use crate::paths;
use crate::reporter::Reporter;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

/// Everything the UI must supply to start a game session.
#[derive(Debug, Clone, Deserialize)]
pub struct LaunchOptions {
    pub instance_id: String,
    pub instance_name: String,
    pub mc_version: String,
    pub loader: String,
    #[serde(default)]
    pub loader_version: String,
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    #[serde(default)]
    pub jvm_args: String,
    /// Absolute path to a java binary, or `auto` to pick one automatically.
    #[serde(default)]
    pub java_path: String,
    #[serde(default)]
    pub java_version: Option<u32>,
    #[serde(default)]
    pub resolution_width: Option<u32>,
    #[serde(default)]
    pub resolution_height: Option<u32>,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub server_auto_connect: Option<String>,
    pub username: String,
    pub uuid: String,
    /// `0` for offline sessions; a real Minecraft token otherwise.
    pub access_token: String,
    /// `legacy` for offline sessions, `msa` for Microsoft accounts.
    pub user_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LaunchedGame {
    pub pid: u32,
    pub java_path: String,
    pub command: Vec<String>,
}

/// Running children, keyed by instance id, so the UI can stop a session.
static RUNNING: Mutex<Option<HashMap<String, Child>>> = Mutex::new(None);

fn with_running<T>(f: impl FnOnce(&mut HashMap<String, Child>) -> T) -> T {
    let mut guard = RUNNING.lock().expect("process registry poisoned");
    f(guard.get_or_insert_with(HashMap::new))
}

fn substitute(template: &str, values: &HashMap<&str, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in values {
        result = result.replace(&format!("${{{key}}}"), value);
    }
    result
}

/// Flattens Mojang's argument arrays: plain strings are taken as is, objects
/// are kept only when their rules match this platform.
fn collect_arguments(
    raw: &[Value],
    values: &HashMap<&str, String>,
    features: &HashMap<String, bool>,
) -> Vec<String> {
    let mut out = Vec::new();
    for item in raw {
        match item {
            Value::String(text) => out.push(substitute(text, values)),
            Value::Object(map) => {
                let rules: Option<Vec<meta::Rule>> = map
                    .get("rules")
                    .and_then(|r| serde_json::from_value(r.clone()).ok());
                if !meta::rules_allow(&rules, features) {
                    continue;
                }
                match map.get("value") {
                    Some(Value::String(text)) => out.push(substitute(text, values)),
                    Some(Value::Array(items)) => {
                        for entry in items {
                            if let Value::String(text) = entry {
                                out.push(substitute(text, values));
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
    out
}

fn classpath_separator() -> &'static str {
    if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    }
}

pub fn build_command(
    options: &LaunchOptions,
    version: &VersionJson,
    installed: &InstalledVersion,
    java_binary: &str,
    game_dir: &PathBuf,
) -> Result<Vec<String>> {
    let classpath = installed
        .classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(classpath_separator());

    let mut values: HashMap<&str, String> = HashMap::new();
    values.insert("auth_player_name", options.username.clone());
    values.insert("version_name", version.id.clone());
    values.insert("game_directory", game_dir.to_string_lossy().to_string());
    values.insert("assets_root", installed.assets_dir.to_string_lossy().to_string());
    values.insert("game_assets", installed.assets_dir.to_string_lossy().to_string());
    values.insert("assets_index_name", installed.asset_index_id.clone());
    values.insert("auth_uuid", options.uuid.clone());
    values.insert("auth_access_token", options.access_token.clone());
    values.insert("auth_session", format!("token:{}", options.access_token));
    values.insert("auth_xuid", String::new());
    values.insert("clientid", String::new());
    values.insert("user_type", options.user_type.clone());
    values.insert("version_type", "Surface Client".to_string());
    values.insert("user_properties", "{}".to_string());
    values.insert(
        "natives_directory",
        installed.natives_dir.to_string_lossy().to_string(),
    );
    values.insert(
        "library_directory",
        paths::libraries_dir()?.to_string_lossy().to_string(),
    );
    values.insert("classpath_separator", classpath_separator().to_string());
    values.insert("launcher_name", "surface-client".to_string());
    values.insert("launcher_version", env!("CARGO_PKG_VERSION").to_string());
    values.insert("classpath", classpath.clone());

    let mut features: HashMap<String, bool> = HashMap::new();
    let has_custom_resolution =
        options.resolution_width.is_some() && options.resolution_height.is_some();
    features.insert("has_custom_resolution".to_string(), has_custom_resolution);
    features.insert("is_demo_user".to_string(), false);
    if let (Some(width), Some(height)) = (options.resolution_width, options.resolution_height) {
        values.insert("resolution_width", width.to_string());
        values.insert("resolution_height", height.to_string());
    }

    let mut command = vec![java_binary.to_string()];
    command.push(format!("-Xms{}M", options.memory_min_mb.max(256)));
    command.push(format!("-Xmx{}M", options.memory_max_mb.max(512)));

    for arg in options.jvm_args.split_whitespace() {
        command.push(arg.to_string());
    }

    match &version.arguments {
        Some(arguments) => {
            command.extend(collect_arguments(&arguments.jvm, &values, &features));
        }
        None => {
            // Pre-1.13 metadata has no JVM argument list at all.
            command.push(format!(
                "-Djava.library.path={}",
                installed.natives_dir.to_string_lossy()
            ));
            command.push("-cp".to_string());
            command.push(classpath.clone());
        }
    }

    command.push(installed.main_class.clone());

    match (&version.arguments, &version.minecraft_arguments) {
        (Some(arguments), _) => {
            command.extend(collect_arguments(&arguments.game, &values, &features));
        }
        (None, Some(legacy)) => {
            for token in legacy.split_whitespace() {
                command.push(substitute(token, &values));
            }
            if has_custom_resolution {
                command.push("--width".to_string());
                command.push(options.resolution_width.unwrap_or(1280).to_string());
                command.push("--height".to_string());
                command.push(options.resolution_height.unwrap_or(720).to_string());
            }
        }
        (None, None) => {
            return Err(LauncherError::msg("version metadata has no game arguments"))
        }
    }

    if options.fullscreen {
        command.push("--fullscreen".to_string());
    }

    if let Some(server) = options
        .server_auto_connect
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        // 1.20+ replaced --server/--port with the quickPlay family.
        let (host, port) = match server.rsplit_once(':') {
            Some((host, port)) if port.chars().all(|c| c.is_ascii_digit()) => (host, port),
            _ => (server, "25565"),
        };
        command.push("--quickPlayMultiplayer".to_string());
        command.push(format!("{host}:{port}"));
    }

    Ok(command)
}

/// Splits a Minecraft log line into its parts.
///
/// Lines look like `[12:00:00] [Render thread/INFO]: Setting user: Notch`;
/// anything that does not match is forwarded verbatim.
fn parse_log_line(line: &str) -> (String, String, String) {
    let level_and_thread = line
        .split_once("] [")
        .and_then(|(_, rest)| rest.split_once("]:"))
        .map(|(inner, _)| inner);

    if let Some(inner) = level_and_thread {
        if let Some((thread, level)) = inner.rsplit_once('/') {
            let message = line
                .split_once("]:")
                .and_then(|(_, rest)| rest.split_once("]:"))
                .map(|(_, rest)| rest)
                .unwrap_or_else(|| line.split("]:").last().unwrap_or(line));
            return (
                level.to_string(),
                thread.to_string(),
                message.trim().to_string(),
            );
        }
    }
    ("INFO".to_string(), "Game".to_string(), line.to_string())
}

fn pipe_output<R>(reader: R, reporter: Reporter, default_level: &'static str)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let (level, thread, message) = parse_log_line(&line);
            let level = if level == "INFO" && default_level == "ERROR" {
                "ERROR".to_string()
            } else {
                level
            };
            reporter.log_with_thread(&level, "minecraft", &thread, message);
        }
    });
}

pub async fn launch(
    options: LaunchOptions,
    version: &VersionJson,
    installed: &InstalledVersion,
    reporter: Reporter,
) -> Result<LaunchedGame> {
    let required_major = options.java_version.unwrap_or_else(|| version
        .java_version
        .as_ref()
        .and_then(|j| j.major_version)
        .unwrap_or(8));

    let java_binary = if options.java_path.is_empty() || options.java_path == "auto" {
        let found = java::select_for(required_major).ok_or_else(|| {
            LauncherError::msg(format!(
                "no Java {required_major} runtime found. Install one and pick it in the instance settings."
            ))
        })?;
        reporter.log(
            "INFO",
            "SurfaceLauncher",
            format!("Using Java {} ({})", found.version, found.path),
        );
        found.path
    } else {
        let probed = java::probe(std::path::Path::new(&options.java_path))?;
        if probed.major < required_major {
            reporter.log(
                "WARN",
                "SurfaceLauncher",
                format!(
                    "Selected Java {} is older than the Java {required_major} this version requires",
                    probed.major
                ),
            );
        }
        options.java_path.clone()
    };

    let game_dir = paths::instance_game_dir(&options.instance_id)?;
    paths::ensure_dir(&game_dir).await?;
    paths::ensure_dir(&paths::instance_mods_dir(&options.instance_id)?).await?;

    let command_line = build_command(&options, version, installed, &java_binary, &game_dir)?;

    reporter.progress("spawning_jvm", "Starting the Java virtual machine", 96.0);
    reporter.log(
        "INFO",
        "SurfaceLauncher",
        format!(
            "Launching {} ({} {})",
            options.instance_name, options.mc_version, options.loader
        ),
    );

    let mut command = Command::new(&command_line[0]);
    command
        .args(&command_line[1..])
        .current_dir(&game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|e| {
        LauncherError::msg(format!("failed to start {}: {e}", command_line[0]))
    })?;

    let pid = child.id().unwrap_or_default();

    if let Some(stdout) = child.stdout.take() {
        pipe_output(stdout, reporter.clone(), "INFO");
    }
    if let Some(stderr) = child.stderr.take() {
        pipe_output(stderr, reporter.clone(), "ERROR");
    }

    reporter.progress("running", "Minecraft is running", 100.0);

    with_running(|map| {
        map.insert(options.instance_id.clone(), child);
    });

    // Supervise the process so the UI learns about crashes and clean exits.
    let instance_id = options.instance_id.clone();
    let exit_reporter = reporter.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            let status = with_running(|map| match map.get_mut(&instance_id) {
                Some(child) => child.try_wait().ok().flatten(),
                None => None,
            });

            let still_tracked = with_running(|map| map.contains_key(&instance_id));
            if !still_tracked {
                return;
            }

            if let Some(status) = status {
                with_running(|map| map.remove(&instance_id));
                let code = status.code();
                let crashed = !status.success();
                if crashed {
                    exit_reporter.log(
                        "ERROR",
                        "SurfaceLauncher",
                        format!("Minecraft exited with code {}", code.unwrap_or(-1)),
                    );
                }
                exit_reporter.exit(code, crashed);
                return;
            }
        }
    });

    Ok(LaunchedGame {
        pid,
        java_path: java_binary,
        command: command_line,
    })
}

pub async fn stop(instance_id: &str) -> Result<bool> {
    let mut child = with_running(|map| map.remove(instance_id));
    match child.take() {
        Some(mut child) => {
            child.kill().await?;
            Ok(true)
        }
        None => Ok(false),
    }
}

pub fn is_running(instance_id: &str) -> bool {
    if with_running(|map| map.contains_key(instance_id)) {
        return true;
    }
    discover_running_instances(&[instance_id.to_string()]).iter().any(|id| id == instance_id)
}

/// Finds Minecraft processes that survived a launcher restart. The game
/// command always contains the instance-specific --gameDir path.
pub fn discover_running_instances(instance_ids: &[String]) -> Vec<String> {
    let mut system = sysinfo::System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    instance_ids
        .iter()
        .filter(|instance_id| {
            let Ok(game_dir) = crate::paths::instance_game_dir(instance_id) else { return false; };
            let needle = game_dir.to_string_lossy();
            system.processes().values().any(|process| {
                let name = process.name().to_string_lossy().to_lowercase();
                let command = process.cmd().iter().map(|part| part.to_string_lossy()).collect::<Vec<_>>().join(" ");
                (name == "java" || name == "javaw" || command.contains("net.minecraft"))
                    && command.contains("--gameDir")
                    && command.contains(needle.as_ref())
            })
        })
        .cloned()
        .collect()
}
