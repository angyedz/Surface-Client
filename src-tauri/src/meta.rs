//! Parsing and resolution of Mojang / mod-loader version metadata.

use crate::error::{LauncherError, Result};
use crate::net;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
pub const RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ManifestVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ManifestLatest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VersionManifest {
    pub latest: ManifestLatest,
    pub versions: Vec<ManifestVersion>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Artifact {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub classifiers: Option<std::collections::HashMap<String, Artifact>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<std::collections::HashMap<String, bool>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ExtractRule {
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    /// Maven root used by loader metadata that ships no `downloads` block.
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub rules: Option<Vec<Rule>>,
    #[serde(default)]
    pub natives: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub extract: Option<ExtractRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AssetIndexRef {
    pub id: String,
    #[serde(default)]
    pub sha1: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ClientDownloads {
    #[serde(default)]
    pub client: Option<Artifact>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct JavaVersionRef {
    #[serde(rename = "majorVersion", default)]
    pub major_version: Option<u32>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<Value>,
    #[serde(default)]
    pub jvm: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VersionJson {
    pub id: String,
    #[serde(rename = "inheritsFrom", default)]
    pub inherits_from: Option<String>,
    #[serde(rename = "mainClass", default)]
    pub main_class: Option<String>,
    #[serde(rename = "minecraftArguments", default)]
    pub minecraft_arguments: Option<String>,
    #[serde(default)]
    pub arguments: Option<Arguments>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(rename = "assetIndex", default)]
    pub asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(default)]
    pub downloads: Option<ClientDownloads>,
    #[serde(rename = "javaVersion", default)]
    pub java_version: Option<JavaVersionRef>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AssetIndexFile {
    pub objects: std::collections::HashMap<String, AssetObject>,
    #[serde(default)]
    pub virtual_assets: Option<bool>,
}

/// The `${os}` key Mojang metadata uses for the running platform.
pub fn current_os() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn current_arch() -> &'static str {
    if cfg!(target_arch = "x86") {
        "x86"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    }
}

/// Evaluates a Mojang rule list. Unknown feature flags count as disabled, which
/// keeps demo-mode and custom-resolution arguments out unless we opt in.
pub fn rules_allow(rules: &Option<Vec<Rule>>, features: &std::collections::HashMap<String, bool>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    if rules.is_empty() {
        return true;
    }

    let mut allowed = false;
    for rule in rules {
        let mut matches = true;
        if let Some(os) = &rule.os {
            if let Some(name) = &os.name {
                if name != current_os() {
                    matches = false;
                }
            }
            if let Some(arch) = &os.arch {
                let normalised = if arch == "x86" { "x86" } else { arch.as_str() };
                if normalised != current_arch() {
                    matches = false;
                }
            }
        }
        if let Some(required) = &rule.features {
            for (key, expected) in required {
                if features.get(key).copied().unwrap_or(false) != *expected {
                    matches = false;
                }
            }
        }
        if matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Maven coordinates (`group:artifact:version[:classifier]`) to a repository path.
pub fn maven_path(name: &str) -> Result<String> {
    let mut parts = name.split(':');
    let group = parts
        .next()
        .ok_or_else(|| LauncherError::msg(format!("invalid maven coordinate: {name}")))?;
    let artifact = parts
        .next()
        .ok_or_else(|| LauncherError::msg(format!("invalid maven coordinate: {name}")))?;
    let version = parts
        .next()
        .ok_or_else(|| LauncherError::msg(format!("invalid maven coordinate: {name}")))?;
    let classifier = parts.next();

    // The version segment may carry an `@ext` suffix (`name:1.0@zip`).
    let (version, extension) = match version.split_once('@') {
        Some((version, extension)) => (version, extension),
        None => (version, "jar"),
    };

    let file = match classifier {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{extension}"),
        None => format!("{artifact}-{version}.{extension}"),
    };
    Ok(format!(
        "{}/{artifact}/{version}/{file}",
        group.replace('.', "/")
    ))
}

/// The natives classifier for this platform, e.g. `natives-linux`.
pub fn native_classifier(library: &Library) -> Option<String> {
    let natives = library.natives.as_ref()?;
    let template = natives.get(current_os())?;
    Some(template.replace("${arch}", if cfg!(target_pointer_width = "32") { "32" } else { "64" }))
}

async fn fetch_vanilla_version(version_id: &str) -> Result<VersionJson> {
    let manifest: VersionManifest = net::get_json(VERSION_MANIFEST_URL).await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| {
            LauncherError::msg(format!("Minecraft version {version_id} is not in Mojang's manifest"))
        })?;
    match net::get_json(&entry.url).await {
        Ok(version) => Ok(version),
        Err(primary) => {
            // Some Fedora DNS/proxy setups cannot resolve piston-meta, while
            // Mojang's legacy metadata host is still reachable. The manifest
            // contains a content-addressed path, so only the host changes.
            let fallback_url = entry
                .url
                .replace("https://piston-meta.mojang.com/", "https://launchermeta.mojang.com/");
            if fallback_url != entry.url {
                if let Ok(version) = net::get_json(&fallback_url).await {
                    return Ok(version);
                }
            }
            Err(LauncherError::msg(format!(
                "could not download Minecraft {version_id} metadata from Mojang: {primary}. Check DNS/network access to piston-meta.mojang.com"
            )))
        }
    }
}

async fn fetch_loader_profile(
    loader: &str,
    mc_version: &str,
    loader_version: &str,
    vanilla: &VersionJson,
) -> Result<VersionJson> {
    if loader == "forge" {
        return fetch_forge_profile(mc_version, loader_version, vanilla).await;
    }

    let url = match loader {
        "fabric" => format!(
            "https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader_version}/profile/json"
        ),
        "quilt" => format!(
            "https://meta.quiltmc.org/v3/versions/loader/{mc_version}/{loader_version}/profile/json"
        ),
        other => {
            return Err(LauncherError::msg(format!(
                "the {other} loader cannot be installed automatically yet; \
                 run its official installer and pick the produced version as vanilla"
            )))
        }
    };
    net::get_json(&url).await
}

/// Forge is different from Fabric/Quilt: it publishes an installer rather than
/// a ready-made launcher profile. Run that official installer in an isolated
/// SurfaceClient directory, then consume the profile it generated. This keeps
/// Forge versions dynamic and avoids writing anything into the user's vanilla
/// Minecraft directory.
async fn fetch_forge_profile(
    mc_version: &str,
    forge_version: &str,
    vanilla: &VersionJson,
) -> Result<VersionJson> {
    let coordinate = format!("{mc_version}-{forge_version}");
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{coordinate}/forge-{coordinate}-installer.jar"
    );
    let root = crate::paths::root_dir()?.join("forge").join(&coordinate);
    let installer = root.join(format!("forge-{coordinate}-installer.jar"));
    let generated = find_forge_profile(&root)?;
    let processors_missing = !forge_client_outputs_exist(&root, mc_version, forge_version);

    if generated.is_none() || processors_missing {
        eprintln!("[Surface] Forge: downloading installer for Minecraft {mc_version}, Forge {forge_version}");
        crate::paths::ensure_dir(&root).await?;

        // Forge's official installer validates the vanilla launcher profile in
        // its target directory before it creates the Forge profile. The
        // launcher normally owns this file already, but the isolated Forge
        // workspace must receive its own copy.
        let vanilla_dir = root.join("versions").join(mc_version);
        tokio::fs::create_dir_all(&vanilla_dir).await?;
        tokio::fs::write(
            vanilla_dir.join(format!("{mc_version}.json")),
            serde_json::to_vec_pretty(vanilla)?,
        )
        .await?;
        // The Forge installer also checks the launcher profile registry, not
        // only versions/<id>/<id>.json. Keep this synthetic profile isolated
        // to the installer workspace; never touch the user's real launcher
        // configuration.
        let launcher_profiles = serde_json::json!({
            "profiles": {
                "surface-client": {
                    "name": "Surface Client",
                    "type": "custom",
                    "lastVersionId": mc_version
                }
            },
            "selectedProfile": "surface-client"
        });
        tokio::fs::write(
            root.join("launcher_profiles.json"),
            serde_json::to_vec_pretty(&launcher_profiles)?,
        )
        .await?;
        let vanilla_jar = vanilla
            .downloads
            .as_ref()
            .and_then(|downloads| downloads.client.as_ref())
            .ok_or_else(|| LauncherError::msg(format!("Minecraft {mc_version} metadata has no client download")))?;
        net::download_file(
            &vanilla_jar.url,
            &vanilla_dir.join(format!("{mc_version}.jar")),
            vanilla_jar.sha1.as_deref(),
        )
        .await?;

        net::download_file(&installer_url, &installer, None).await?;

        eprintln!("[Surface] Forge: running installer");
        let mut installer_process =
            tokio::process::Command::new(crate::java::tooling_binary());
        // The installer is headless; on Windows it would otherwise flash a
        // console window in the user's face.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            installer_process.creation_flags(0x0800_0000);
        }
        installer_process.args(net::java_proxy_args());
        installer_process
            .arg("-jar")
            .arg(&installer)
            .arg("--installClient")
            .arg(&root)
            .kill_on_drop(true);
        let output = tokio::time::timeout(Duration::from_secs(300), installer_process.output())
            .await
            .map_err(|_| LauncherError::msg(format!(
                "Forge installer timed out after 5 minutes for Minecraft {mc_version} / Forge {forge_version}"
            )))?
            .map_err(|error| LauncherError::msg(format!(
                "Forge installer could not start Java: {error}. Install a compatible Java runtime and try again."
            )))?;
        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let details = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
            return Err(LauncherError::msg(format!(
                "Forge installer exited with {} for Minecraft {mc_version} / Forge {forge_version}: {}",
                output.status,
                if details.is_empty() { "installer returned no diagnostic output" } else { details }
            )));
        }
        eprintln!("[Surface] Forge: installer finished, reading generated profile");
    }

    let profile_path = find_forge_profile(&root)?.ok_or_else(|| {
        LauncherError::msg(format!(
            "Forge installer completed but did not produce a launcher profile for {mc_version} / {forge_version}"
        ))
    })?;
    copy_generated_libraries(&root).await?;
    let bytes = tokio::fs::read(&profile_path).await?;
    let mut profile: VersionJson = serde_json::from_slice(&bytes)?;

    // Installer profiles occasionally omit the repository on individual
    // libraries. Forge's Maven repository is the authoritative fallback.
    for library in &mut profile.libraries {
        if library.url.is_none() && library.downloads.is_none() {
            library.url = Some("https://maven.minecraftforge.net/".to_string());
        }
    }
    Ok(profile)
}

fn forge_client_outputs_exist(root: &Path, mc_version: &str, forge_version: &str) -> bool {
    let libraries = root.join("libraries");
    let mut found_srg = false;
    let mut found_extra = false;
    let mut found_forge_client = false;
    let mut stack = vec![libraries];
    while let Some(directory) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(directory) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else { continue };
            found_srg |= name.ends_with("-srg.jar") && name.contains(mc_version);
            found_extra |= name.ends_with("-extra.jar") && name.contains(mc_version);
            found_forge_client |= name == format!("forge-{mc_version}-{forge_version}-client.jar");
        }
    }
    found_srg && found_extra && found_forge_client
}

async fn copy_generated_libraries(forge_root: &Path) -> Result<()> {
    let source = forge_root.join("libraries");
    if !source.exists() {
        return Ok(());
    }
    let destination = crate::paths::libraries_dir()?;
    copy_directory_contents(&source, &destination).await
}

async fn copy_directory_contents(source: &Path, destination: &Path) -> Result<()> {
    tokio::fs::create_dir_all(destination).await?;
    let mut entries = tokio::fs::read_dir(source).await?;
    while let Some(entry) = entries.next_entry().await? {
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            Box::pin(copy_directory_contents(&source_path, &destination_path)).await?;
        } else {
            let needs_copy = match tokio::fs::metadata(&destination_path).await {
                Ok(metadata) => metadata.len() != tokio::fs::metadata(&source_path).await?.len(),
                Err(_) => true,
            };
            if needs_copy {
                tokio::fs::copy(&source_path, &destination_path).await?;
            }
        }
    }
    Ok(())
}

fn find_forge_profile(root: &Path) -> Result<Option<PathBuf>> {
    if !root.exists() {
        return Ok(None);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        for entry in std::fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Ok(bytes) = std::fs::read(&path) else { continue };
            let Ok(value) = serde_json::from_slice::<Value>(&bytes) else { continue };
            let has_forge_loader = value.get("id").and_then(Value::as_str)
                .map(|id| id.contains("forge"))
                .unwrap_or(false)
                || value.get("mainClass").and_then(Value::as_str)
                    .map(|main| main.contains("forge"))
                    .unwrap_or(false);
            if has_forge_loader && value.get("libraries").is_some() {
                return Ok(Some(path));
            }
        }
    }
    Ok(None)
}

fn merge(child: VersionJson, parent: VersionJson) -> VersionJson {
    let mut libraries = child.libraries;
    libraries.extend(parent.libraries);

    let arguments = match (child.arguments, parent.arguments) {
        (Some(child_args), Some(parent_args)) => Some(Arguments {
            // Parent arguments come first: the loader appends its own tweaks.
            game: [parent_args.game, child_args.game].concat(),
            jvm: [parent_args.jvm, child_args.jvm].concat(),
        }),
        (Some(args), None) | (None, Some(args)) => Some(args),
        (None, None) => None,
    };

    VersionJson {
        id: child.id,
        inherits_from: None,
        main_class: child.main_class.or(parent.main_class),
        minecraft_arguments: child.minecraft_arguments.or(parent.minecraft_arguments),
        arguments,
        libraries,
        asset_index: child.asset_index.or(parent.asset_index),
        assets: child.assets.or(parent.assets),
        downloads: child.downloads.or(parent.downloads),
        java_version: child.java_version.or(parent.java_version),
    }
}

/// Fully resolved metadata for an instance: the vanilla version, merged with the
/// mod loader profile when one is selected.
pub struct ResolvedVersion {
    /// Version whose client jar and assets are used (always the vanilla id).
    pub vanilla_id: String,
    pub json: VersionJson,
}

pub async fn resolve(
    mc_version: &str,
    loader: &str,
    loader_version: &str,
) -> Result<ResolvedVersion> {
    let vanilla = fetch_vanilla_version(mc_version).await?;

    if loader == "vanilla" || loader.is_empty() {
        return Ok(ResolvedVersion {
            vanilla_id: vanilla.id.clone(),
            json: vanilla,
        });
    }

    if loader_version.is_empty() || loader_version.eq_ignore_ascii_case("none") {
        return Err(LauncherError::msg(format!(
            "no {loader} version selected for Minecraft {mc_version}"
        )));
    }

    let profile = fetch_loader_profile(loader, mc_version, loader_version, &vanilla).await?;
    Ok(ResolvedVersion {
        vanilla_id: vanilla.id.clone(),
        json: merge(profile, vanilla),
    })
}
