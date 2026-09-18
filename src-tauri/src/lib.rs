mod auth;
mod error;
mod files;
mod install;
mod java;
mod launch;
mod meta;
mod net;
mod paths;
mod ping;
mod reporter;

use error::Result;
use reporter::Reporter;
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemSpecs {
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub cpu_count: usize,
    pub cpu_name: String,
    pub os_name: String,
    pub os_version: String,
}

#[tauri::command]
fn get_system_specs() -> SystemSpecs {
    let mut sys = System::new_all();
    sys.refresh_all();

    SystemSpecs {
        total_memory_mb: sys.total_memory() / (1024 * 1024),
        available_memory_mb: sys.available_memory() / (1024 * 1024),
        cpu_count: sys.cpus().len(),
        cpu_name: sys
            .cpus()
            .first()
            .map(|c| c.brand().trim().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string()),
        os_name: System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
        os_version: System::os_version().unwrap_or_else(|| "unknown".to_string()),
    }
}

#[tauri::command]
async fn ping_minecraft_server(address: String, port: Option<u16>) -> ping::ServerStatus {
    ping::status(&address, port).await
}

#[tauri::command]
fn list_java_installations() -> Vec<java::JavaInstallation> {
    java::discover()
}

#[tauri::command]
fn get_launcher_paths() -> Result<serde_json::Value> {
    Ok(serde_json::json!({
        "root": paths::root_dir()?.to_string_lossy(),
        "instances": paths::instances_dir()?.to_string_lossy(),
        "libraries": paths::libraries_dir()?.to_string_lossy(),
        "assets": paths::assets_dir()?.to_string_lossy(),
    }))
}

#[tauri::command]
async fn list_minecraft_versions() -> Result<meta::VersionManifest> {
    net::get_json(meta::VERSION_MANIFEST_URL).await
}

/// Installs everything the instance needs and starts the game.
///
/// Progress, log lines and the eventual exit are streamed to the UI through
/// the `launch://*` events rather than the command's return value.
#[tauri::command]
async fn launch_instance(
    app: AppHandle,
    options: launch::LaunchOptions,
) -> Result<launch::LaunchedGame> {
    let reporter = Reporter::new(app, options.instance_id.clone());

    let result = async {
        reporter.progress("verifying_dependencies", "Checking version metadata", 2.0);
        let resolved =
            meta::resolve(&options.mc_version, &options.loader, &options.loader_version).await?;
        let installed = install::install(&resolved, &reporter).await?;
        reporter.progress("building_classpath", "Building the runtime classpath", 92.0);
        launch::launch(options, &resolved.json, &installed, reporter.clone()).await
    }
    .await;

    if let Err(error) = &result {
        reporter.log("ERROR", "SurfaceLauncher", error.to_string());
        reporter.progress("crashed", error.to_string(), 100.0);
    }

    result
}

/// The exact command line `launch_instance` would run, for display and export.
#[tauri::command]
async fn preview_launch_command(options: launch::LaunchOptions) -> Result<Vec<String>> {
    let resolved =
        meta::resolve(&options.mc_version, &options.loader, &options.loader_version).await?;
    let planned = install::plan(&resolved)?;
    let java = if options.java_path.is_empty() || options.java_path == "auto" {
        let required = resolved
            .json
            .java_version
            .as_ref()
            .and_then(|j| j.major_version)
            .unwrap_or(8);
        java::select_for(required)
            .map(|found| found.path)
            .unwrap_or_else(|| "java".to_string())
    } else {
        options.java_path.clone()
    };
    let game_dir = paths::instance_game_dir(&options.instance_id)?;
    launch::build_command(&options, &resolved.json, &planned, &java, &game_dir)
}

#[tauri::command]
async fn stop_instance(instance_id: String) -> Result<bool> {
    launch::stop(&instance_id).await
}

#[tauri::command]
fn is_instance_running(instance_id: String) -> bool {
    launch::is_running(&instance_id)
}

#[tauri::command]
async fn sync_instance_mods(
    instance_id: String,
    mods: Vec<files::ModFile>,
) -> Result<files::ModSyncReport> {
    files::sync_mods(&instance_id, mods).await
}

#[tauri::command]
async fn list_instance_screenshots(instance_id: String) -> Result<Vec<files::Screenshot>> {
    files::list_screenshots(&instance_id).await
}

#[tauri::command]
async fn delete_screenshot(path: String) -> Result<()> {
    files::delete_screenshot(path).await
}

/// Writes an export into the launcher's exports folder and returns its path.
#[tauri::command]
async fn save_export(file_name: String, data: Vec<u8>) -> Result<String> {
    files::save_export(file_name, data).await
}

/// Opens one of an instance's folders in the system file manager.
#[tauri::command]
async fn open_instance_folder(instance_id: String, kind: String) -> Result<String> {
    let path = files::instance_folder(&instance_id, &kind).await?;
    files::open_in_file_manager(&path)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn auth_start_device_code() -> Result<auth::DeviceCodeStart> {
    auth::start_device_code().await
}

#[tauri::command]
async fn auth_poll_device_code(device_code: String) -> Result<auth::DeviceCodePoll> {
    auth::poll_device_code(device_code).await
}

#[tauri::command]
async fn auth_refresh_session(refresh_token: String) -> Result<auth::MinecraftSession> {
    auth::refresh(refresh_token).await
}

#[tauri::command]
fn offline_uuid(username: String) -> String {
    auth::offline_uuid(&username)
}

/// Works around a WebKitGTK crash under Wayland.
///
/// With the DMA-BUF renderer enabled, WebKit's web process cannot allocate its
/// buffers on several Mesa and NVIDIA driver combinations and the window never
/// paints — either "Error 71 dispatching to Wayland display" or a grey window
/// with "Failed to create GBM buffer". Routing the app through XWayland instead
/// does not help: the same allocation fails there. Turning off that one renderer
/// is the only setting that paints reliably on both. An explicit value set by
/// the user always wins.
#[cfg(target_os = "linux")]
fn apply_linux_webkit_workarounds() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_linux_webkit_workarounds() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_linux_webkit_workarounds();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_system_specs,
            ping_minecraft_server,
            list_java_installations,
            get_launcher_paths,
            list_minecraft_versions,
            launch_instance,
            preview_launch_command,
            stop_instance,
            is_instance_running,
            sync_instance_mods,
            list_instance_screenshots,
            delete_screenshot,
            save_export,
            open_instance_folder,
            auth_start_device_code,
            auth_poll_device_code,
            auth_refresh_session,
            offline_uuid,
        ])
        .run(tauri::generate_context!())
        .expect("error while running surface client application");
}
