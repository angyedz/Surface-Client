use crate::error::{LauncherError, Result};
use futures::StreamExt;
use serde::de::DeserializeOwned;
use sha1::{Digest, Sha1};
use std::path::Path;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

static PROXY_URL: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn configured_proxy() -> Option<String> {
    PROXY_URL
        .get_or_init(|| RwLock::new(None))
        .read()
        .ok()
        .and_then(|value| value.clone())
}

/// JVM system properties for third-party installers spawned by the launcher.
/// Reqwest's proxy configuration does not automatically reach a child JVM.
pub fn java_proxy_args() -> Vec<String> {
    let Some(value) = configured_proxy() else { return Vec::new() };
    let Ok(url) = url::Url::parse(&value) else { return Vec::new() };
    let host = url.host_str().unwrap_or_default();
    let Some(port) = url.port_or_known_default() else { return Vec::new() };
    let scheme = url.scheme().to_ascii_lowercase();
    let mut args = Vec::new();
    if matches!(scheme.as_str(), "socks5" | "socks5h" | "socks4" | "socks4a") {
        args.push(format!("-DsocksProxyHost={host}"));
        args.push(format!("-DsocksProxyPort={port}"));
    } else if matches!(scheme.as_str(), "http" | "https") {
        args.push(format!("-Dhttps.proxyHost={host}"));
        args.push(format!("-Dhttps.proxyPort={port}"));
        args.push(format!("-Dhttp.proxyHost={host}"));
        args.push(format!("-Dhttp.proxyPort={port}"));
    } else {
        return Vec::new();
    }
    let username = url.username();
    if !username.is_empty() {
        args.push(format!("-Dhttps.proxyUser={username}"));
        args.push(format!("-Dhttp.proxyUser={username}"));
        args.push(format!("-Djava.net.socks.username={username}"));
    }
    if let Some(password) = url.password() {
        args.push(format!("-Dhttps.proxyPassword={password}"));
        args.push(format!("-Dhttp.proxyPassword={password}"));
        args.push(format!("-Djava.net.socks.password={password}"));
    }
    args
}

pub fn set_proxy(proxy_url: Option<String>) -> Result<()> {
    let normalized = proxy_url.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    if let Some(value) = &normalized {
        reqwest::Proxy::all(value)
            .map_err(|error| LauncherError::msg(format!("invalid proxy URL: {error}")))?;
    }
    *PROXY_URL
        .get_or_init(|| RwLock::new(None))
        .write()
        .map_err(|_| LauncherError::msg("proxy configuration lock failed"))? = normalized;
    Ok(())
}

pub fn client() -> reqwest::Client {
    let mut builder = reqwest::Client::builder();
    if let Some(proxy_url) = configured_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(proxy_url).expect("validated proxy URL"));
    }

    builder
            .user_agent(concat!("SurfaceClient/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(45))
            .pool_max_idle_per_host(16)
            .build()
            .expect("failed to build the shared HTTP client")
}

pub async fn get_json<T: DeserializeOwned>(url: &str) -> Result<T> {
    let fallback_url = url
        .replace("https://piston-meta.mojang.com/", "https://launchermeta.mojang.com/");
    let urls = if fallback_url != url { vec![url, fallback_url.as_str()] } else { vec![url] };
    let mut last_error = None;
    for candidate in urls {
        for attempt in 0..3 {
            match client().get(candidate).send().await.and_then(|response| response.error_for_status()) {
                Ok(response) => {
                    let bytes = response.bytes().await?;
                    return Ok(serde_json::from_slice(&bytes)?);
                }
                Err(error) => {
                    last_error = Some(error);
                    if attempt < 2 {
                        tokio::time::sleep(Duration::from_millis(400 * (attempt + 1))).await;
                    }
                }
            }
        }
    }
    Err(last_error.expect("request loop always records an error").into())
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

    let fallback_url = url
        .replace("https://piston-meta.mojang.com/", "https://launchermeta.mojang.com/");
    let urls = if fallback_url != url {
        vec![url, fallback_url.as_str()]
    } else {
        vec![url]
    };
    let mut last_error = None;
    let mut response = None;
    for candidate in urls {
        for attempt in 0..2 {
            match client().get(candidate).send().await.and_then(|res| res.error_for_status()) {
                Ok(value) => {
                    response = Some(value);
                    break;
                }
                Err(error) => {
                    last_error = Some(error);
                    if attempt == 0 {
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
        }
        if response.is_some() { break; }
    }
    let response = response.ok_or_else(|| {
        LauncherError::msg(format!("could not download {url}: {}", last_error.map(|e| e.to_string()).unwrap_or_else(|| "request failed".into())))
    })?;
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
