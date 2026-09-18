//! Progress and log events streamed to the UI while an instance launches.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use crate::logging;

pub const EVENT_PROGRESS: &str = "launch://progress";
pub const EVENT_LOG: &str = "launch://log";
pub const EVENT_EXIT: &str = "launch://exit";

#[derive(Debug, Clone, Serialize)]
pub struct LaunchProgress {
    pub instance_id: String,
    /// Mirrors the `LaunchStatus` union on the TypeScript side.
    pub status: String,
    pub stage: String,
    pub progress: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LaunchLogLine {
    pub instance_id: String,
    pub level: String,
    pub logger: String,
    pub thread: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LaunchExit {
    pub instance_id: String,
    pub code: Option<i32>,
    pub crashed: bool,
}

#[derive(Clone)]
pub struct Reporter {
    app: AppHandle,
    instance_id: String,
}

impl Reporter {
    pub fn new(app: AppHandle, instance_id: impl Into<String>) -> Self {
        Self {
            app,
            instance_id: instance_id.into(),
        }
    }

    pub fn progress(&self, status: &str, stage: impl Into<String>, progress: f32) {
        let _ = self.app.emit(
            EVENT_PROGRESS,
            LaunchProgress {
                instance_id: self.instance_id.clone(),
                status: status.to_string(),
                stage: stage.into(),
                progress: progress.clamp(0.0, 100.0),
            },
        );
    }

    pub fn log(&self, level: &str, logger: &str, message: impl Into<String>) {
        self.log_with_thread(level, logger, "Launcher", message);
    }

    pub fn log_with_thread(
        &self,
        level: &str,
        logger: &str,
        thread: &str,
        message: impl Into<String>,
    ) {
        let message = message.into();
        logging::write(logger, level, &message);
        let _ = self.app.emit(
            EVENT_LOG,
            LaunchLogLine {
                instance_id: self.instance_id.clone(),
                level: level.to_string(),
                logger: logger.to_string(),
                thread: thread.to_string(),
                message,
            },
        );
    }

    pub fn exit(&self, code: Option<i32>, crashed: bool) {
        let _ = self.app.emit(
            EVENT_EXIT,
            LaunchExit {
                instance_id: self.instance_id.clone(),
                code,
                crashed,
            },
        );
    }
}
