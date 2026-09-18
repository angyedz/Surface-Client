//! Minecraft Server List Ping: the real protocol handshake, not a bare TCP
//! connect, so the launcher can show MOTD, player counts, version and favicon.

use crate::error::{LauncherError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const PROTOCOL_UNKNOWN: i32 = -1;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_PACKET_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub online: bool,
    pub latency_ms: Option<u64>,
    pub players_online: Option<u32>,
    pub players_max: Option<u32>,
    pub motd: Option<String>,
    pub version_name: Option<String>,
    /// `data:image/png;base64,...` as sent by the server.
    pub favicon: Option<String>,
    pub error: Option<String>,
}

impl ServerStatus {
    fn failed(error: impl Into<String>) -> Self {
        Self {
            online: false,
            latency_ms: None,
            players_online: None,
            players_max: None,
            motd: None,
            version_name: None,
            favicon: None,
            error: Some(error.into()),
        }
    }
}

fn write_varint(buffer: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value = ((value as u32) >> 7) as i32;
        if value != 0 {
            byte |= 0x80;
        }
        buffer.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn write_string(buffer: &mut Vec<u8>, text: &str) {
    write_varint(buffer, text.len() as i32);
    buffer.extend_from_slice(text.as_bytes());
}

async fn read_varint(stream: &mut TcpStream) -> Result<i32> {
    let mut result: i32 = 0;
    for shift in 0..5 {
        let byte = stream.read_u8().await?;
        result |= ((byte & 0x7f) as i32) << (7 * shift);
        if byte & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err(LauncherError::msg("malformed packet length from server"))
}

/// Wraps a packet body in its length prefix.
fn framed(body: Vec<u8>) -> Vec<u8> {
    let mut packet = Vec::with_capacity(body.len() + 5);
    write_varint(&mut packet, body.len() as i32);
    packet.extend_from_slice(&body);
    packet
}

/// Flattens a chat component tree into plain text, dropping formatting.
fn flatten_motd(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items.iter().map(flatten_motd).collect(),
        Value::Object(map) => {
            let mut text = map
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(Value::Array(extra)) = map.get("extra") {
                for child in extra {
                    text.push_str(&flatten_motd(child));
                }
            }
            text
        }
        _ => String::new(),
    }
}

/// Strips the legacy section-sign colour codes servers still use.
fn strip_formatting(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

async fn query(host: &str, port: u16) -> Result<ServerStatus> {
    let started = Instant::now();
    let stream = tokio::time::timeout(
        CONNECT_TIMEOUT,
        TcpStream::connect((host.to_string(), port)),
    )
    .await
    .map_err(|_| LauncherError::msg("connection timed out"))??;
    let latency_ms = started.elapsed().as_millis() as u64;

    let mut stream = stream;
    stream.set_nodelay(true).ok();

    let mut handshake = Vec::new();
    write_varint(&mut handshake, 0x00); // packet id: handshake
    write_varint(&mut handshake, PROTOCOL_UNKNOWN);
    write_string(&mut handshake, host);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1); // next state: status

    stream.write_all(&framed(handshake)).await?;
    stream.write_all(&framed(vec![0x00])).await?; // status request

    let read = async {
        let length = read_varint(&mut stream).await?;
        if length <= 0 || length as usize > MAX_PACKET_BYTES {
            return Err(LauncherError::msg("server sent an invalid status packet"));
        }
        let packet_id = read_varint(&mut stream).await?;
        if packet_id != 0x00 {
            return Err(LauncherError::msg("server sent an unexpected packet"));
        }
        let json_length = read_varint(&mut stream).await? as usize;
        if json_length > MAX_PACKET_BYTES {
            return Err(LauncherError::msg("server sent an oversized status payload"));
        }
        let mut body = vec![0u8; json_length];
        stream.read_exact(&mut body).await?;
        Ok(body)
    };

    let body = tokio::time::timeout(READ_TIMEOUT, read)
        .await
        .map_err(|_| LauncherError::msg("server did not answer the status request"))??;

    let status: Value = serde_json::from_slice(&body)?;
    let motd = status
        .get("description")
        .map(flatten_motd)
        .map(|text| strip_formatting(&text))
        .filter(|text| !text.is_empty());

    Ok(ServerStatus {
        online: true,
        latency_ms: Some(latency_ms),
        players_online: status
            .pointer("/players/online")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        players_max: status
            .pointer("/players/max")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        motd,
        version_name: status
            .pointer("/version/name")
            .and_then(|v| v.as_str())
            .map(strip_formatting),
        favicon: status
            .get("favicon")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        error: None,
    })
}

pub async fn status(address: &str, port: Option<u16>) -> ServerStatus {
    let address = address.trim();
    // An address may carry its own port; an explicit argument still wins.
    let (host, parsed_port) = match address.rsplit_once(':') {
        Some((host, port)) if port.chars().all(|c| c.is_ascii_digit()) => {
            (host, port.parse::<u16>().ok())
        }
        _ => (address, None),
    };
    let port = port.or(parsed_port).unwrap_or(25565);

    match query(host, port).await {
        Ok(status) => status,
        Err(error) => ServerStatus::failed(error.to_string()),
    }
}
