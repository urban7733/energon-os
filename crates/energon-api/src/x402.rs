use std::env;

use axum::{
    http::{HeaderMap, HeaderName, HeaderValue},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::errors::ApiError;

pub const PAYMENT_REQUIRED_HEADER: &str = "payment-required";
pub const PAYMENT_RESPONSE_HEADER: &str = "payment-response";
pub const PAYMENT_SIGNATURE_HEADER: &str = "payment-signature";
const X402_VERSION: u8 = 2;

#[derive(Debug, Clone)]
pub struct X402Config {
    pub enabled: bool,
    pub accept_unverified: bool,
    pub network: String,
    pub asset: String,
    pub pay_to: Option<String>,
    pub facilitator_url: String,
    pub facilitator_bearer: Option<String>,
    pub max_timeout_seconds: u64,
    client: reqwest::Client,
}

#[derive(Debug, Clone, Copy)]
pub enum PaidRoute {
    MemoryWrite,
    MemoryPromote,
    ContextBuild,
    ContextAuditRead,
    PromotionAuditRead,
    ObsidianVaultExport,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaymentRequiredResponse {
    pub error: &'static str,
    pub protocol: &'static str,
    #[serde(rename = "x402Version")]
    pub x402_version: u8,
    pub facilitator: String,
    pub resource: PaymentResource,
    pub accepts: Vec<PaymentRequirements>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaymentResource {
    pub url: &'static str,
    pub description: &'static str,
    #[serde(rename = "mimeType")]
    pub mime_type: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaymentRequirements {
    pub scheme: &'static str,
    pub network: String,
    pub asset: String,
    pub amount: String,
    #[serde(rename = "payTo")]
    pub pay_to: String,
    #[serde(rename = "maxTimeoutSeconds")]
    pub max_timeout_seconds: u64,
    pub extra: PaymentRequirementsExtra,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaymentRequirementsExtra {
    pub name: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Deserialize)]
struct VerifyResponse {
    #[serde(rename = "isValid")]
    is_valid: bool,
}

#[derive(Debug, Deserialize)]
struct SettleResponse {
    success: bool,
}

impl X402Config {
    pub fn from_env() -> Result<Self, String> {
        let enabled = truthy_env("ENERGON_X402_ENABLED");
        let pay_to = env::var("ENERGON_X402_PAY_TO")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());

        if enabled && pay_to.is_none() {
            return Err(
                "ENERGON_X402_PAY_TO must be set when ENERGON_X402_ENABLED=true".to_owned(),
            );
        }

        Ok(Self {
            enabled,
            accept_unverified: truthy_env("ENERGON_X402_ACCEPT_UNVERIFIED"),
            network: env::var("ENERGON_X402_NETWORK").unwrap_or_else(|_| default_network()),
            asset: env::var("ENERGON_X402_ASSET").unwrap_or_else(|_| default_asset()),
            pay_to,
            facilitator_url: env::var("ENERGON_X402_FACILITATOR_URL")
                .unwrap_or_else(|_| default_facilitator_url()),
            facilitator_bearer: env::var("ENERGON_X402_FACILITATOR_BEARER")
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
            max_timeout_seconds: env::var("ENERGON_X402_MAX_TIMEOUT_SECONDS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(60),
            client: reqwest::Client::new(),
        })
    }

    pub async fn require_payment(
        &self,
        headers: &HeaderMap,
        route: PaidRoute,
    ) -> Result<Option<HeaderValue>, ApiError> {
        if !self.enabled {
            return Ok(None);
        }

        if has_payment_signature(headers) {
            if self.accept_unverified {
                return Ok(None);
            }

            let payload = payment_payload(headers)?;
            return self.verify_and_settle(route, payload).await;
        }

        Err(ApiError::PaymentRequired(self.payment_required(route)))
    }

    pub fn payment_required(&self, route: PaidRoute) -> PaymentRequiredResponse {
        PaymentRequiredResponse {
            error: "payment_required",
            protocol: "x402",
            x402_version: X402_VERSION,
            facilitator: self.facilitator_url.clone(),
            resource: route.resource(),
            accepts: vec![self.payment_requirements(route)],
        }
    }

    pub fn payment_requirements(&self, route: PaidRoute) -> PaymentRequirements {
        let pay_to = self
            .pay_to
            .clone()
            .unwrap_or_else(|| "0x0000000000000000000000000000000000000000".to_owned());

        PaymentRequirements {
            scheme: "exact",
            network: self.network.clone(),
            asset: self.asset.clone(),
            amount: route.amount_usdc_micro().to_string(),
            pay_to,
            max_timeout_seconds: self.max_timeout_seconds,
            extra: PaymentRequirementsExtra {
                name: "USDC",
                version: "2",
            },
        }
    }

    pub fn public_status(&self) -> serde_json::Value {
        json!({
            "enabled": self.enabled,
            "protocol": "x402",
            "x402Version": X402_VERSION,
            "network": self.network,
            "asset": self.asset,
            "payToConfigured": self.pay_to.is_some(),
            "facilitator": self.facilitator_url,
            "facilitatorBearerConfigured": self.facilitator_bearer.is_some(),
            "acceptUnverified": self.accept_unverified,
            "routes": [
                self.payment_required(PaidRoute::MemoryWrite),
                self.payment_required(PaidRoute::MemoryPromote),
                self.payment_required(PaidRoute::ContextBuild),
                self.payment_required(PaidRoute::ContextAuditRead),
                self.payment_required(PaidRoute::PromotionAuditRead),
                self.payment_required(PaidRoute::ObsidianVaultExport),
            ],
            "note": "Payment execution is external. Energon API enforces x402 before paid memory/context delivery."
        })
    }

    async fn verify_and_settle(
        &self,
        route: PaidRoute,
        payment_payload: serde_json::Value,
    ) -> Result<Option<HeaderValue>, ApiError> {
        let body = json!({
            "x402Version": X402_VERSION,
            "paymentPayload": payment_payload,
            "paymentRequirements": self.payment_requirements(route),
        });

        let (verify_status, verify_value) = self.post_facilitator("verify", &body).await?;
        if verify_status == 402 {
            return Err(ApiError::PaymentRequired(self.payment_required(route)));
        }
        if !(200..300).contains(&verify_status) {
            return Err(ApiError::PaymentUnavailable(format!(
                "x402 facilitator verify returned HTTP {verify_status}: {verify_value}"
            )));
        }

        let verify =
            serde_json::from_value::<VerifyResponse>(verify_value.clone()).map_err(|error| {
                ApiError::PaymentUnavailable(format!(
                    "x402 facilitator verify returned an invalid response: {error}"
                ))
            })?;

        if !verify.is_valid {
            return Err(ApiError::PaymentRequired(self.payment_required(route)));
        }

        let (settle_status, settle_value) = self.post_facilitator("settle", &body).await?;
        if settle_status == 402 {
            return Err(ApiError::PaymentRequired(self.payment_required(route)));
        }
        if !(200..300).contains(&settle_status) {
            return Err(ApiError::PaymentUnavailable(format!(
                "x402 facilitator settle returned HTTP {settle_status}: {settle_value}"
            )));
        }

        let settle =
            serde_json::from_value::<SettleResponse>(settle_value.clone()).map_err(|error| {
                ApiError::PaymentUnavailable(format!(
                    "x402 facilitator settle returned an invalid response: {error}"
                ))
            })?;

        if !settle.success {
            return Err(ApiError::PaymentRequired(self.payment_required(route)));
        }

        let receipt = serde_json::to_string(&settle_value).map_err(|error| {
            ApiError::Internal(format!(
                "failed to serialize x402 settlement response: {error}"
            ))
        })?;
        HeaderValue::from_str(&receipt)
            .map(Some)
            .map_err(|error| ApiError::Internal(format!("invalid x402 receipt header: {error}")))
    }

    async fn post_facilitator(
        &self,
        action: &str,
        body: &serde_json::Value,
    ) -> Result<(u16, serde_json::Value), ApiError> {
        let url = format!("{}/{}", self.facilitator_url.trim_end_matches('/'), action);
        let mut request = self.client.post(url).json(body);

        if let Some(token) = &self.facilitator_bearer {
            request = request.bearer_auth(token);
        }

        let response = request.send().await.map_err(|error| {
            ApiError::PaymentUnavailable(format!("x402 facilitator {action} failed: {error}"))
        })?;
        let status = response.status().as_u16();
        let value = response
            .json::<serde_json::Value>()
            .await
            .map_err(|error| {
                ApiError::PaymentUnavailable(format!(
                    "x402 facilitator {action} returned invalid JSON: {error}"
                ))
            })?;

        Ok((status, value))
    }
}

impl PaidRoute {
    fn path(self) -> &'static str {
        match self {
            PaidRoute::MemoryWrite => "POST /v1/memory/write",
            PaidRoute::MemoryPromote => "POST /v1/memory/promote",
            PaidRoute::ContextBuild => "POST /v1/context/build",
            PaidRoute::ContextAuditRead => "GET /v1/audit/context/{request_id}",
            PaidRoute::PromotionAuditRead => "GET /v1/audit/promotion/{promoted_memory_id}",
            PaidRoute::ObsidianVaultExport => "GET /v1/vault/obsidian.zip",
        }
    }

    fn resource(self) -> PaymentResource {
        PaymentResource {
            url: self.path(),
            description: self.description(),
            mime_type: self.mime_type(),
        }
    }

    fn mime_type(self) -> &'static str {
        match self {
            PaidRoute::ObsidianVaultExport => "application/zip",
            _ => "application/json",
        }
    }

    fn description(self) -> &'static str {
        match self {
            PaidRoute::MemoryWrite => "Write a permissioned memory record.",
            PaidRoute::MemoryPromote => "Promote private memory into a shared scope with audit.",
            PaidRoute::ContextBuild => "Build an allowed context pack for an external agent.",
            PaidRoute::ContextAuditRead => "Read the audit record for a context build.",
            PaidRoute::PromotionAuditRead => "Read the audit record for a memory promotion.",
            PaidRoute::ObsidianVaultExport => {
                "Export a permission-filtered Obsidian-compatible memory vault."
            }
        }
    }

    fn amount_usdc_micro(self) -> u64 {
        match self {
            PaidRoute::MemoryWrite => 1_000,
            PaidRoute::MemoryPromote => 1_000,
            PaidRoute::ContextBuild => 3_000,
            PaidRoute::ContextAuditRead | PaidRoute::PromotionAuditRead => 500,
            PaidRoute::ObsidianVaultExport => 5_000,
        }
    }
}

pub fn attach_payment_response(
    response: impl IntoResponse,
    payment_response: Option<HeaderValue>,
) -> Response {
    let mut response = response.into_response();
    if let Some(header_value) = payment_response {
        response.headers_mut().insert(
            HeaderName::from_static(PAYMENT_RESPONSE_HEADER),
            header_value,
        );
    }
    response
}

pub fn payment_required_header_value(
    challenge: &PaymentRequiredResponse,
) -> Result<HeaderValue, ApiError> {
    let value = serde_json::to_string(challenge).map_err(|error| {
        ApiError::Internal(format!(
            "failed to serialize x402 payment challenge: {error}"
        ))
    })?;

    HeaderValue::from_str(&value).map_err(|error| {
        ApiError::Internal(format!(
            "failed to encode x402 payment challenge header: {error}"
        ))
    })
}

fn has_payment_signature(headers: &HeaderMap) -> bool {
    headers
        .get(PAYMENT_SIGNATURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

fn payment_payload(headers: &HeaderMap) -> Result<serde_json::Value, ApiError> {
    let value = headers
        .get(PAYMENT_SIGNATURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::BadRequest("missing PAYMENT-SIGNATURE header".to_owned()))?;

    parse_payment_payload(value)
}

fn parse_payment_payload(value: &str) -> Result<serde_json::Value, ApiError> {
    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
        return Ok(payload);
    }

    let decoded = general_purpose::STANDARD
        .decode(value)
        .or_else(|_| general_purpose::URL_SAFE_NO_PAD.decode(value))
        .or_else(|_| general_purpose::URL_SAFE.decode(value))
        .map_err(|_| {
            ApiError::BadRequest("PAYMENT-SIGNATURE must be JSON or base64-encoded JSON".to_owned())
        })?;

    serde_json::from_slice::<serde_json::Value>(&decoded).map_err(|error| {
        ApiError::BadRequest(format!("PAYMENT-SIGNATURE contains invalid JSON: {error}"))
    })
}

fn truthy_env(name: &str) -> bool {
    env::var(name)
        .ok()
        .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"))
}

fn default_network() -> String {
    "eip155:84532".to_owned()
}

fn default_asset() -> String {
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_owned()
}

fn default_facilitator_url() -> String {
    "https://x402.org/facilitator".to_owned()
}

#[cfg(test)]
mod tests {
    use axum::http::{HeaderMap, HeaderValue};

    use super::*;
    use crate::errors::ApiError;

    fn enabled_config() -> X402Config {
        X402Config {
            enabled: true,
            accept_unverified: true,
            network: default_network(),
            asset: default_asset(),
            pay_to: Some("0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9".to_owned()),
            facilitator_url: default_facilitator_url(),
            facilitator_bearer: None,
            max_timeout_seconds: 60,
            client: reqwest::Client::new(),
        }
    }

    #[tokio::test]
    async fn missing_signature_returns_payment_required_challenge() {
        let config = enabled_config();
        let error = config
            .require_payment(&HeaderMap::new(), PaidRoute::ContextBuild)
            .await
            .unwrap_err();

        match error {
            ApiError::PaymentRequired(challenge) => {
                assert_eq!(challenge.protocol, "x402");
                assert_eq!(challenge.x402_version, X402_VERSION);
                assert_eq!(challenge.accepts[0].amount, "3000");
                assert_eq!(
                    challenge.accepts[0].pay_to,
                    "0x122F8Fcaf2152420445Aa424E1D8C0306935B5c9"
                );
            }
            other => panic!("expected payment challenge, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn dev_mode_accepts_non_empty_payment_signature() {
        let config = enabled_config();
        let mut headers = HeaderMap::new();
        headers.insert(
            PAYMENT_SIGNATURE_HEADER,
            HeaderValue::from_static("dev-signature"),
        );

        let receipt = config
            .require_payment(&headers, PaidRoute::MemoryWrite)
            .await
            .unwrap();

        assert!(receipt.is_none());
    }

    #[test]
    fn parses_base64_payment_payload() {
        let encoded = general_purpose::STANDARD.encode(r#"{"x402Version":2}"#);
        let payload = parse_payment_payload(&encoded).unwrap();

        assert_eq!(payload["x402Version"], 2);
    }
}
