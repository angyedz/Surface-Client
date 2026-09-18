use crate::error::{LauncherError, Result};
use futures::StreamExt;
use serde::de::DeserializeOwned;
use sha1::{Digest, Sha1};
use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("SurfaceClient/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(16)
            .build()
            .expect("failed to build the shared HTTP client")
    })
}

pub async fn get_json<T: DeserializeOwned>(url: &str) -> Result<T> {
    let response = client().get(url).send().await?.error_for_status()?;
    let bytes = response.bytes().await?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn sha1_of(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// True when the file exists and, if a checksum was supplied, matches it.
///
/// Files whose metadata carries no hash (some loader libraries) are accepted on
/// existence alone, which is what other launchers do as well.
pub async fn is_file_valid(path: &Path, expected_sha1: Option<&str>) -> bool {
    let Ok(bytes) = tokio::fs::read(path).await else {
        return false;
    };
    match expected_sha1 {
        Some(expected) if !expected.is_empty() => {
            sha1_of(&bytes).eq_ignore_ascii_case(expected)
        }
        _ => true,
    }
}

/// Downloads `url` to `path` unless a valid copy is already cached.
///
/// Returns the number of bytes actually transferred so callers can report real
/// download progress rather than a step counter.
pub async fn download_file(url: &str, path: &Path, expected_sha1: Option<&str>) -> Result<u64> {
    if is_file_valid(path, expected_sha1).await {
        return Ok(0);
    }

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let response = client().get(url).send().await?.error_for_status()?;
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        buffer.extend_from_slice(&chunk?);
    }

    if let Some(expected) = expected_sha1 {
        if !expected.is_empty() {
            let actual = sha1_of(&buffer);
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(LauncherError::msg(format!(
                    "checksum mismatch for {url}: expected {expected}, got {actual}"
                )));
            }
        }
    }

    let written = buffer.len() as u64;
    // Write to a sibling temp file first so an interrupted download never
    // leaves a truncated artefact that later passes the "file exists" check.
    let temp_path = path.with_extension("scpart");
    tokio::fs::write(&temp_path, &buffer).await?;
    tokio::fs::rename(&temp_path, path).await?;
    Ok(written)
}
