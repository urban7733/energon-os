use std::{
    collections::HashMap,
    env,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::http::HeaderMap;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;

use crate::errors::ApiError;

const DEFAULT_REFRESH_SECONDS: u64 = 300;
const JWKS_FETCH_TIMEOUT_SECONDS: u64 = 10;

/// A human operator identity verified from a Better Auth JWT.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedOperator {
    pub user_id: String,
    pub org_id: Option<String>,
    pub email: Option<String>,
}

impl VerifiedOperator {
    /// Enforce that the operator's active organization (JWT `org` claim)
    /// matches the org addressed in the route path.
    pub fn require_org(&self, path_org_id: &str) -> Result<(), ApiError> {
        match self.org_id.as_deref() {
            Some(org_id) if org_id == path_org_id => Ok(()),
            Some(_) => Err(ApiError::Forbidden(
                "JWT organization does not match the requested org".to_owned(),
            )),
            None => Err(ApiError::Forbidden(
                "JWT has no active organization; select or create one first".to_owned(),
            )),
        }
    }
}

#[derive(Debug, Deserialize)]
struct OperatorClaims {
    sub: String,
    #[serde(default)]
    org: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JwksDocument {
    keys: Vec<JwkEntry>,
}

#[derive(Debug, Deserialize)]
struct JwkEntry {
    kty: String,
    #[serde(default)]
    kid: Option<String>,
    #[serde(default)]
    crv: Option<String>,
    #[serde(default)]
    x: Option<String>,
}

struct KeyCache {
    keys: HashMap<String, DecodingKey>,
    fetched_at: Option<Instant>,
}

/// Verifies Better Auth EdDSA (Ed25519) JWTs against a JWKS endpoint.
///
/// Keys are cached in memory, refreshed after `refresh_interval`, and
/// refetched immediately when a token references an unknown `kid`.
#[derive(Clone)]
pub struct JwtVerifier {
    inner: Arc<VerifierInner>,
}

struct VerifierInner {
    jwks_url: String,
    issuer: Option<String>,
    audience: Option<String>,
    refresh_interval: Duration,
    client: reqwest::Client,
    cache: tokio::sync::RwLock<KeyCache>,
}

impl JwtVerifier {
    pub fn from_env() -> Option<Self> {
        let jwks_url = env::var("ENERGON_JWKS_URL")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())?;

        let refresh_interval = env::var("ENERGON_JWKS_REFRESH_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_REFRESH_SECONDS);

        Some(Self::new(
            jwks_url,
            optional_env("ENERGON_JWT_ISSUER"),
            optional_env("ENERGON_JWT_AUDIENCE"),
            Duration::from_secs(refresh_interval),
        ))
    }

    pub fn new(
        jwks_url: String,
        issuer: Option<String>,
        audience: Option<String>,
        refresh_interval: Duration,
    ) -> Self {
        Self {
            inner: Arc::new(VerifierInner {
                jwks_url,
                issuer,
                audience,
                refresh_interval,
                client: reqwest::Client::builder()
                    .timeout(Duration::from_secs(JWKS_FETCH_TIMEOUT_SECONDS))
                    .build()
                    .unwrap_or_default(),
                cache: tokio::sync::RwLock::new(KeyCache {
                    keys: HashMap::new(),
                    fetched_at: None,
                }),
            }),
        }
    }

    pub async fn verify(&self, token: &str) -> Result<VerifiedOperator, ApiError> {
        let header = decode_header(token)
            .map_err(|error| ApiError::Unauthorized(format!("invalid JWT header: {error}")))?;

        if header.alg != Algorithm::EdDSA {
            return Err(ApiError::Unauthorized(format!(
                "unsupported JWT algorithm: {:?} (expected EdDSA)",
                header.alg
            )));
        }

        let kid = header
            .kid
            .ok_or_else(|| ApiError::Unauthorized("JWT header is missing kid".to_owned()))?;

        let key = self.key_for_kid(&kid).await?;

        verify_with_key(
            token,
            &key,
            self.inner.issuer.as_deref(),
            self.inner.audience.as_deref(),
        )
    }

    async fn key_for_kid(&self, kid: &str) -> Result<DecodingKey, ApiError> {
        {
            let cache = self.inner.cache.read().await;
            let fresh = cache
                .fetched_at
                .is_some_and(|fetched| fetched.elapsed() < self.inner.refresh_interval);

            if fresh && let Some(key) = cache.keys.get(kid) {
                return Ok(key.clone());
            }
        }

        // Stale cache or unknown kid: refetch the JWKS once, then decide.
        self.refresh_keys().await?;

        let cache = self.inner.cache.read().await;
        cache
            .keys
            .get(kid)
            .cloned()
            .ok_or_else(|| ApiError::Unauthorized(format!("JWT signed with unknown key id: {kid}")))
    }

    async fn refresh_keys(&self) -> Result<(), ApiError> {
        let response = self
            .inner
            .client
            .get(&self.inner.jwks_url)
            .send()
            .await
            .map_err(|error| {
                ApiError::Internal(format!(
                    "failed to fetch JWKS from {}: {error}",
                    self.inner.jwks_url
                ))
            })?;

        if !response.status().is_success() {
            return Err(ApiError::Internal(format!(
                "JWKS endpoint {} returned HTTP {}",
                self.inner.jwks_url,
                response.status()
            )));
        }

        let document = response.json::<JwksDocument>().await.map_err(|error| {
            ApiError::Internal(format!("JWKS endpoint returned invalid JSON: {error}"))
        })?;

        let keys = parse_jwks(&document);
        let mut cache = self.inner.cache.write().await;
        cache.keys = keys;
        cache.fetched_at = Some(Instant::now());

        Ok(())
    }

    /// Test/bootstrap hook: seed the key cache without any HTTP round trip.
    #[cfg(test)]
    pub async fn preload_keys(&self, keys: HashMap<String, DecodingKey>) {
        let mut cache = self.inner.cache.write().await;
        cache.keys = keys;
        cache.fetched_at = Some(Instant::now());
    }
}

pub async fn operator_from_request(
    verifier: Option<&JwtVerifier>,
    headers: &HeaderMap,
) -> Result<VerifiedOperator, ApiError> {
    let verifier = verifier.ok_or_else(|| {
        ApiError::Unauthorized(
            "operator JWT auth is not configured (set ENERGON_JWKS_URL)".to_owned(),
        )
    })?;

    let token = bearer_token(headers).ok_or_else(|| {
        ApiError::Unauthorized("missing bearer JWT in Authorization header".to_owned())
    })?;

    verifier.verify(&token).await
}

fn verify_with_key(
    token: &str,
    key: &DecodingKey,
    issuer: Option<&str>,
    audience: Option<&str>,
) -> Result<VerifiedOperator, ApiError> {
    let mut validation = Validation::new(Algorithm::EdDSA);
    validation.set_required_spec_claims(&["exp"]);

    if let Some(issuer) = issuer {
        validation.set_issuer(&[issuer]);
    }

    if let Some(audience) = audience {
        validation.set_audience(&[audience]);
    } else {
        validation.validate_aud = false;
    }

    let data = decode::<OperatorClaims>(token, key, &validation)
        .map_err(|error| ApiError::Unauthorized(format!("invalid JWT: {error}")))?;

    Ok(VerifiedOperator {
        user_id: data.claims.sub,
        org_id: data
            .claims
            .org
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_owned()),
        email: data.claims.email,
    })
}

fn parse_jwks(document: &JwksDocument) -> HashMap<String, DecodingKey> {
    let mut keys = HashMap::new();

    for entry in &document.keys {
        if entry.kty != "OKP" {
            continue;
        }

        if entry.crv.as_deref() != Some("Ed25519") {
            continue;
        }

        let (Some(kid), Some(x)) = (entry.kid.as_deref(), entry.x.as_deref()) else {
            continue;
        };

        match DecodingKey::from_ed_components(x) {
            Ok(key) => {
                keys.insert(kid.to_owned(), key);
            }
            Err(error) => {
                tracing::warn!(%kid, %error, "skipping malformed JWKS key");
            }
        }
    }

    keys
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .trim()
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use jsonwebtoken::{EncodingKey, Header, encode};
    use ring::signature::{Ed25519KeyPair, KeyPair};
    use serde::Serialize;

    use super::*;

    #[derive(Serialize)]
    struct TestClaims {
        sub: String,
        org: Option<String>,
        email: Option<String>,
        exp: u64,
        iss: String,
        aud: String,
    }

    struct TestKey {
        encoding: EncodingKey,
        decoding: DecodingKey,
    }

    fn generate_key() -> TestKey {
        let document = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new())
            .expect("generate Ed25519 key");
        let pair = Ed25519KeyPair::from_pkcs8(document.as_ref()).expect("parse Ed25519 key");

        TestKey {
            encoding: EncodingKey::from_ed_der(document.as_ref()),
            decoding: DecodingKey::from_ed_der(pair.public_key().as_ref()),
        }
    }

    fn now_unix() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn sign_token(key: &TestKey, kid: &str, org: Option<&str>, exp: u64) -> String {
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(kid.to_owned());

        encode(
            &header,
            &TestClaims {
                sub: "user_1".to_owned(),
                org: org.map(str::to_owned),
                email: Some("operator@example.com".to_owned()),
                exp,
                iss: "http://localhost:3000".to_owned(),
                aud: "energon-api".to_owned(),
            },
            &key.encoding,
        )
        .expect("sign test JWT")
    }

    async fn verifier_with_key(key: &TestKey, kid: &str) -> JwtVerifier {
        let verifier = JwtVerifier::new(
            "http://jwks.invalid/never-fetched".to_owned(),
            Some("http://localhost:3000".to_owned()),
            Some("energon-api".to_owned()),
            Duration::from_secs(300),
        );
        let keys = HashMap::from([(kid.to_owned(), key.decoding.clone())]);

        verifier.preload_keys(keys).await;
        verifier
    }

    #[tokio::test]
    async fn verifies_valid_token_and_extracts_org() {
        let key = generate_key();
        let verifier = JwtVerifier::new(
            "http://jwks.invalid/never-fetched".to_owned(),
            Some("http://localhost:3000".to_owned()),
            Some("energon-api".to_owned()),
            Duration::from_secs(300),
        );
        verifier
            .preload_keys(HashMap::from([("kid_1".to_owned(), key.decoding.clone())]))
            .await;

        let token = sign_token(&key, "kid_1", Some("org_be_1"), now_unix() + 60);
        let operator = verifier.verify(&token).await.expect("token verifies");

        assert_eq!(operator.user_id, "user_1");
        assert_eq!(operator.org_id.as_deref(), Some("org_be_1"));
        assert!(operator.require_org("org_be_1").is_ok());
        assert!(operator.require_org("org_other").is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_kid() {
        let key = generate_key();
        let verifier = verifier_with_key(&key, "kid_known").await;
        let token = sign_token(&key, "kid_unknown", Some("org_be_1"), now_unix() + 60);

        // The refetch against the unreachable JWKS URL fails, so the token is
        // rejected rather than accepted with an unknown key.
        let error = verifier.verify(&token).await.unwrap_err();
        assert!(matches!(
            error,
            ApiError::Internal(_) | ApiError::Unauthorized(_)
        ));
    }

    #[tokio::test]
    async fn rejects_expired_token() {
        let key = generate_key();
        let verifier = verifier_with_key(&key, "kid_1").await;
        let token = sign_token(&key, "kid_1", Some("org_be_1"), now_unix() - 120);

        let error = verifier.verify(&token).await.unwrap_err();
        let ApiError::Unauthorized(message) = error else {
            panic!("expected unauthorized error");
        };
        assert!(message.contains("ExpiredSignature") || message.contains("expired"));
    }

    #[tokio::test]
    async fn rejects_token_signed_by_other_key() {
        let trusted = generate_key();
        let attacker = generate_key();
        let verifier = verifier_with_key(&trusted, "kid_1").await;
        let token = sign_token(&attacker, "kid_1", Some("org_be_1"), now_unix() + 60);

        assert!(matches!(
            verifier.verify(&token).await,
            Err(ApiError::Unauthorized(_))
        ));
    }

    #[tokio::test]
    async fn token_without_org_cannot_access_org_routes() {
        let key = generate_key();
        let verifier = verifier_with_key(&key, "kid_1").await;
        let token = sign_token(&key, "kid_1", None, now_unix() + 60);

        let operator = verifier.verify(&token).await.expect("token verifies");
        assert!(matches!(
            operator.require_org("org_be_1"),
            Err(ApiError::Forbidden(_))
        ));
    }

    #[test]
    fn parses_jwks_document_and_skips_non_ed25519_keys() {
        let x_component = {
            // Round-trip through the JWKS representation: base64url of the raw
            // public key bytes.
            use base64::Engine as _;
            let pair = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()).unwrap();
            let pair = Ed25519KeyPair::from_pkcs8(pair.as_ref()).unwrap();
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(pair.public_key().as_ref())
        };

        let document = JwksDocument {
            keys: vec![
                JwkEntry {
                    kty: "OKP".to_owned(),
                    kid: Some("good".to_owned()),
                    crv: Some("Ed25519".to_owned()),
                    x: Some(x_component),
                },
                JwkEntry {
                    kty: "RSA".to_owned(),
                    kid: Some("rsa".to_owned()),
                    crv: None,
                    x: None,
                },
                JwkEntry {
                    kty: "OKP".to_owned(),
                    kid: None,
                    crv: Some("Ed25519".to_owned()),
                    x: None,
                },
            ],
        };

        let keys = parse_jwks(&document);
        assert_eq!(keys.len(), 1);
        assert!(keys.contains_key("good"));
    }
}
