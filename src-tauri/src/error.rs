use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum LauncherError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),

    #[error("malformed metadata: {0}")]
    Json(#[from] serde_json::Error),

    #[error("archive error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("{0}")]
    Other(String),
}

impl LauncherError {
    pub fn msg(text: impl Into<String>) -> Self {
        LauncherError::Other(text.into())
    }
}

/// Tauri commands can only return serialisable errors, so every failure is
/// flattened into its human readable message before it crosses the IPC border.
impl Serialize for LauncherError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LauncherError>;
