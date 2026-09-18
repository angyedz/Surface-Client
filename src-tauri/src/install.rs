//! Downloads everything an instance needs before the JVM is spawned:
//! the client jar, libraries, native binaries and the asset objects.

use crate::error::{LauncherError, Result};
use crate::meta::{self, Library, ResolvedVersion};
use crate::net;
use crate::paths;
use crate::reporter::Reporter;
use futures::stream::{self, StreamExt};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

const PARALLEL_DOWNLOADS: usize = 16;
const DEFAULT_MAVEN: &str = "https://libraries.minecraft.net/";

pub struct InstalledVersion {
    pub classpath: Vec<PathBuf>,
    pub natives_dir: PathBuf,
    pub asset_index_id: String,
    pub assets_dir: PathBuf,
    pub main_class: String,
}

struct DownloadJob {
    url: String,
    path: PathBuf,
    sha1: Option<String>,
}

/// Resolves where a library jar lives and where it comes from.
///
/// Mojang metadata carries an explicit `downloads.artifact`; loader metadata
/// only carries maven coordinates plus a repository root.
fn library_job(library: &Library, classifier: Option<&str>) -> Result<Option<DownloadJob>> {
    let libraries_dir = paths::libraries_dir()?;

    if let Some(downloads) = &library.downloads {
        let artifact = match classifier {
            Some(classifier) => downloads
                .classifiers
                .as_ref()
                .and_then(|map| map.get(classifier))
                .cloned(),
            None => downloads.artifact.clone(),
        };

        if let Some(artifact) = artifact {
            let relative = match &artifact.path {
                Some(path) => path.clone(),
                None => meta::maven_path(&library.name)?,
            };
            return Ok(Some(DownloadJob {
                url: artifact.url.clone(),
                path: libraries_dir.join(relative),
                sha1: artifact.sha1.clone(),
            }));
        }

        // A natives entry with no matching classifier simply has no file here.
        if classifier.is_some() {
            return Ok(None);
        }

        // Mojang uses this shape for libraries that only ship native
        // classifiers (for example jinput-platform). There is no ordinary
        // artifact to download; constructing one from the Maven coordinate
        // produces a guaranteed 404.
        return Ok(None);
    }

    if classifier.is_some() {
        return Ok(None);
    }

    let relative = meta::maven_path(&library.name)?;
    let base = library.url.clone().unwrap_or_else(|| DEFAULT_MAVEN.to_string());
    let base = if base.ends_with('/') { base } else { format!("{base}/") };
    Ok(Some(DownloadJob {
        url: format!("{base}{relative}"),
        path: libraries_dir.join(relative),
        sha1: None,
    }))
}

async fn run_jobs(jobs: Vec<DownloadJob>, reporter: &Reporter, status: &str, label: &str, from: f32, to: f32) -> Result<()> {
    let total = jobs.len().max(1) as f32;
    let done = Arc::new(AtomicU64::new(0));

    let results: Vec<Result<u64>> = stream::iter(jobs.into_iter().map(|job| {
        let done = Arc::clone(&done);
        let reporter = reporter.clone();
        let label = label.to_string();
        let status = status.to_string();
        async move {
            let transferred = net::download_file(&job.url, &job.path, job.sha1.as_deref()).await?;
            let finished = done.fetch_add(1, Ordering::Relaxed) + 1;
            // Reporting every single file would flood the UI event loop.
            if finished % 12 == 0 {
                let fraction = finished as f32 / total;
                reporter.progress(
                    &status,
                    format!("{label} ({finished}/{})", total as u64),
                    from + (to - from) * fraction,
                );
            }
            Ok(transferred)
        }
    }))
    .buffer_unordered(PARALLEL_DOWNLOADS)
    .collect()
    .await;

    let mut downloaded_bytes = 0u64;
    for result in results {
        downloaded_bytes += result?;
    }
    let summary = if downloaded_bytes == 0 {
        format!("{label} ready from cache")
    } else {
        format!("{label} ready ({} downloaded)", format_bytes(downloaded_bytes))
    };
    reporter.progress(status, summary, to);
    Ok(())
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    }
}

/// Unpacks a natives jar, skipping metadata and any explicitly excluded paths.
fn extract_natives(archive_path: &Path, target: &Path, exclude: &[String]) -> Result<()> {
    let file = std::fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(entry_path) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let name = entry_path.to_string_lossy().replace('\\', "/");

        if entry.is_dir() || name.starts_with("META-INF/") {
            continue;
        }
        if exclude.iter().any(|prefix| name.starts_with(prefix.trim_end_matches('/'))) {
            continue;
        }

        let out_path = target.join(entry_path.file_name().unwrap_or_default());
        std::fs::create_dir_all(target)?;
        let mut out = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

/// Works out where every file *will* live, without downloading anything.
///
/// Used to show the exact command line an instance would run with.
pub fn plan(resolved: &ResolvedVersion) -> Result<InstalledVersion> {
    let version = &resolved.json;
    let features: HashMap<String, bool> = HashMap::new();

    let client_jar = paths::version_dir(&resolved.vanilla_id)?
        .join(format!("{}.jar", resolved.vanilla_id));
    let mut classpath = vec![client_jar];
    let mut seen = std::collections::HashSet::new();

    for library in &version.libraries {
        if !meta::rules_allow(&library.rules, &features) {
            continue;
        }
        if let Some(job) = library_job(library, None)? {
            if seen.insert(job.path.clone()) {
                classpath.push(job.path);
            }
        }
    }

    Ok(InstalledVersion {
        classpath,
        natives_dir: paths::natives_dir(&version.id)?,
        asset_index_id: version
            .asset_index
            .as_ref()
            .map(|index| index.id.clone())
            .unwrap_or_default(),
        assets_dir: paths::assets_dir()?,
        main_class: version
            .main_class
            .clone()
            .ok_or_else(|| LauncherError::msg("version metadata has no main class"))?,
    })
}

pub async fn install(resolved: &ResolvedVersion, reporter: &Reporter) -> Result<InstalledVersion> {
    let version = &resolved.json;
    let features: HashMap<String, bool> = HashMap::new();

    reporter.progress("verifying_dependencies", "Resolving version metadata", 4.0);

    // Keep the resolved profile on disk: it makes the install inspectable and
    // lets other tools read the instance.
    let version_dir = paths::version_dir(&version.id)?;
    paths::ensure_dir(&version_dir).await?;
    tokio::fs::write(
        version_dir.join(format!("{}.json", version.id)),
        serde_json::to_vec_pretty(version)?,
    )
    .await?;

    // --- client jar -------------------------------------------------------
    let client = version
        .downloads
        .as_ref()
        .and_then(|d| d.client.clone())
        .ok_or_else(|| LauncherError::msg("version metadata has no client download"))?;
    let client_jar = paths::version_dir(&resolved.vanilla_id)?
        .join(format!("{}.jar", resolved.vanilla_id));

    reporter.progress("downloading_assets", "Downloading Minecraft client", 8.0);
    net::download_file(&client.url, &client_jar, client.sha1.as_deref()).await?;

    // --- libraries and natives -------------------------------------------
    let mut library_jobs = Vec::new();
    let mut native_jobs: Vec<(DownloadJob, Vec<String>)> = Vec::new();
    let mut classpath = vec![client_jar.clone()];
    let mut seen = std::collections::HashSet::new();

    for library in &version.libraries {
        if !meta::rules_allow(&library.rules, &features) {
            continue;
        }

        if let Some(job) = library_job(library, None)? {
            if seen.insert(job.path.clone()) {
                classpath.push(job.path.clone());
                library_jobs.push(job);
            }
        }

        if let Some(classifier) = meta::native_classifier(library) {
            if let Some(job) = library_job(library, Some(&classifier))? {
                let exclude = library
                    .extract
                    .as_ref()
                    .map(|e| e.exclude.clone())
                    .unwrap_or_default();
                native_jobs.push((job, exclude));
            }
        }
    }

    reporter.log(
        "INFO",
        "SurfaceLauncher",
        format!("Resolved {} libraries for {}", library_jobs.len(), version.id),
    );
    run_jobs(library_jobs, reporter, "downloading_assets", "Checking libraries", 10.0, 40.0).await?;

    let natives_dir = paths::natives_dir(&version.id)?;
    if !native_jobs.is_empty() {
        paths::ensure_dir(&natives_dir).await?;
        reporter.progress("building_classpath", "Unpacking native libraries", 42.0);
        for (job, exclude) in native_jobs {
            net::download_file(&job.url, &job.path, job.sha1.as_deref()).await?;
            let archive = job.path.clone();
            let target = natives_dir.clone();
            tokio::task::spawn_blocking(move || extract_natives(&archive, &target, &exclude))
                .await
                .map_err(|e| LauncherError::msg(e.to_string()))??;
        }
    }

    // --- assets -----------------------------------------------------------
    let assets_root = paths::assets_dir()?;
    let asset_index = version
        .asset_index
        .clone()
        .ok_or_else(|| LauncherError::msg("version metadata has no asset index"))?;

    let index_path = assets_root.join("indexes").join(format!("{}.json", asset_index.id));
    reporter.progress("downloading_assets", "Fetching asset index", 46.0);
    net::download_file(&asset_index.url, &index_path, asset_index.sha1.as_deref()).await?;

    let index_bytes = tokio::fs::read(&index_path).await?;
    let index: meta::AssetIndexFile = serde_json::from_slice(&index_bytes)?;

    let objects_dir = assets_root.join("objects");
    let asset_jobs: Vec<DownloadJob> = index
        .objects
        .values()
        .map(|object| {
            let prefix = &object.hash[0..2];
            DownloadJob {
                url: format!("{}/{}/{}", meta::RESOURCES_BASE_URL, prefix, object.hash),
                path: objects_dir.join(prefix).join(&object.hash),
                sha1: Some(object.hash.clone()),
            }
        })
        .collect();

    run_jobs(asset_jobs, reporter, "downloading_assets", "Checking assets", 48.0, 88.0).await?;

    let main_class = version
        .main_class
        .clone()
        .ok_or_else(|| LauncherError::msg("version metadata has no main class"))?;

    Ok(InstalledVersion {
        classpath,
        natives_dir,
        asset_index_id: asset_index.id,
        assets_dir: assets_root,
        main_class,
    })
}
