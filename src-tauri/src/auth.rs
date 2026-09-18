//! Microsoft account sign-in for Minecraft, using the OAuth 2.0 device code
//! flow (the same flow the official launcher uses on consoles and TVs).
//!
//! The chain is: Microsoft token -> Xbox Live token -> XSTS token ->
//! Minecraft token -> Minecraft profile.

use crate::error::{LauncherError, Result};
use crate::net;
use serde::{Deserialize, Serialize};
use serde_json::json;

const DEVICE_CODE_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const SCOPE: &str = "XboxLive.signin offline_access";

/// Azure application id used for sign-in.
///
/// Microsoft requires every launcher to register its own application, so this
/// is read from the environment at build or run time rather than hard coded.
fn client_id() -> Result<String> {
    option_env!("SURFACE_MS_CLIENT_ID")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("SURFACE_MS_CLIENT_ID").ok())
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| {
            LauncherError::msg(
                "Microsoft sign-in is not configured: set SURFACE_MS_CLIENT_ID to the \
                 Azure application id registered for this launcher (see README).",
            )
        })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct MicrosoftToken {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct OAuthError {
    error: String,
    #[serde(default)]
    error_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftSession {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Unix seconds after which the Minecraft token must be refreshed.
    pub expires_at: u64,
}

/// Outcome of a single poll while the user is completing sign-in.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DeviceCodePoll {
    Pending,
    /// The user has not entered the code yet and we are asked to slow down.
    SlowDown { interval: u64 },
    Complete { session: Box<MinecraftSession> },
}

pub async fn start_device_code() -> Result<DeviceCodeStart> {
    let response = net::client()
        .post(DEVICE_CODE_URL)
        .form(&[("client_id", client_id()?.as_str()), ("scope", SCOPE)])
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

async fn exchange_device_code(device_code: &str) -> Result<DeviceCodePoll> {
    let client_id = client_id()?;
    let response = net::client()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ])
        .send()
        .await?;

    let status = response.status();
    let bytes = response.bytes().await?;

    if status.is_success() {
        let token: MicrosoftToken = serde_json::from_slice(&bytes)?;
        let session = complete_minecraft_login(token).await?;
        return Ok(DeviceCodePoll::Complete {
            session: Box::new(session),
        });
    }

    let error: OAuthError = serde_json::from_slice(&bytes).map_err(|_| {
        LauncherError::msg(format!(
            "unexpected response from Microsoft ({status}): {}",
            String::from_utf8_lossy(&bytes)
        ))
    })?;

    match error.error.as_str() {
        "authorization_pending" => Ok(DeviceCodePoll::Pending),
        "slow_down" => Ok(DeviceCodePoll::SlowDown { interval: 5 }),
        "expired_token" => Err(LauncherError::msg(
            "the sign-in code expired, please start again",
        )),
        "authorization_declined" => {
            Err(LauncherError::msg("sign-in was declined in the browser"))
        }
        other => Err(LauncherError::msg(
            error
                .error_description
                .unwrap_or_else(|| format!("Microsoft sign-in failed: {other}")),
        )),
    }
}

pub async fn poll_device_code(device_code: String) -> Result<DeviceCodePoll> {
    exchange_device_code(&device_code).await
}

#[derive(Debug, Deserialize)]
struct XboxResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUserClaim>,
}

#[derive(Debug, Deserialize)]
struct XboxUserClaim {
    uhs: String,
}

#[derive(Debug, Deserialize)]
struct MinecraftLoginResponse {
    access_token: String,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct MinecraftProfile {
    id: String,
    name: String,
}

/// Formats Mojang's dashless profile id as a canonical UUID.
fn format_uuid(raw: &str) -> String {
    if raw.len() != 32 {
        return raw.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &raw[0..8],
        &raw[8..12],
        &raw[12..16],
        &raw[16..20],
        &raw[20..32]
    )
}

async fn complete_minecraft_login(token: MicrosoftToken) -> Result<MinecraftSession> {
    let xbl: XboxResponse = net::client()
        .post(XBL_URL)
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", token.access_token),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let xsts_response = net::client()
        .post(XSTS_URL)
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl.token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        }))
        .send()
        .await?;

    if xsts_response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let body: serde_json::Value = xsts_response.json().await.unwrap_or_default();
        // Documented XSTS error codes, translated into something actionable.
        let message = match body.get("XErr").and_then(|v| v.as_u64()) {
            Some(2148916233) => "this Microsoft account has no Xbox profile yet",
            Some(2148916235) => "Xbox Live is not available in this account's country",
            Some(2148916238) => "this is a child account and must be added to a family",
            _ => "Xbox Live rejected the sign-in",
        };
        return Err(LauncherError::msg(message));
    }

    let xsts: XboxResponse = xsts_response.error_for_status()?.json().await?;
    let user_hash = xsts
        .display_claims
        .xui
        .first()
        .map(|claim| claim.uhs.clone())
        .ok_or_else(|| LauncherError::msg("Xbox Live returned no user hash"))?;

    let minecraft: MinecraftLoginResponse = net::client()
        .post(MC_LOGIN_URL)
        .json(&json!({
            "identityToken": format!("XBL3.0 x={user_hash};{}", xsts.token),
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let profile_response = net::client()
        .get(MC_PROFILE_URL)
        .bearer_auth(&minecraft.access_token)
        .send()
        .await?;

    if profile_response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(LauncherError::msg(
            "this Microsoft account does not own Minecraft: Java Edition",
        ));
    }

    let profile: MinecraftProfile = profile_response.error_for_status()?.json().await?;
    let lifetime = minecraft.expires_in.or(token.expires_in).unwrap_or(86_400);

    Ok(MinecraftSession {
        username: profile.name,
        uuid: format_uuid(&profile.id),
        access_token: minecraft.access_token,
        refresh_token: token.refresh_token,
        expires_at: now_seconds() + lifetime,
    })
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Renews an expired session without any user interaction.
pub async fn refresh(refresh_token: String) -> Result<MinecraftSession> {
    let client_id = client_id()?;
    let response = net::client()
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(LauncherError::msg(
            "the saved Microsoft session expired, please sign in again",
        ));
    }

    let token: MicrosoftToken = response.json().await?;
    complete_minecraft_login(token).await
}

/// Deterministic offline UUID, byte-for-byte identical to what the vanilla
/// server computes for a cracked player: `UUID.nameUUIDFromBytes` over
/// `OfflinePlayer:<name>`, which is a bare MD5 digest stamped as version 3.
pub fn offline_uuid(username: &str) -> String {
    use md5::{Digest, Md5};

    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();
    bytes[6] = (bytes[6] & 0x0f) | 0x30; // version 3
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // IETF variant
    uuid::Uuid::from_bytes(bytes).to_string()
}
