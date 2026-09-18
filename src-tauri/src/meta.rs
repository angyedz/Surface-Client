//! Parsing and resolution of Mojang / mod-loader version metadata.

use crate::error::{LauncherError, Result};
use crate::net;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    net::get_json(&entry.url).await
}

async fn fetch_loader_profile(
    loader: &str,
    mc_version: &str,
    loader_version: &str,
) -> Result<VersionJson> {
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

    let profile = fetch_loader_profile(loader, mc_version, loader_version).await?;
    Ok(ResolvedVersion {
        vanilla_id: vanilla.id.clone(),
        json: merge(profile, vanilla),
    })
}
