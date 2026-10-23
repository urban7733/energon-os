use std::{
    env,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use sha2::{Digest, Sha256};

use crate::{errors::ApiError, state::AppState};

const DEFAULT_RPS: f64 = 20.0;
const DEFAULT_BURST: f64 = 40.0;
/// Failed authentications tolerated per client IP before it is throttled.
/// Guessing API keys or admin tokens needs many 401s; real clients need few.
const DEFAULT_AUTH_FAILURE_RPS: f64 = 1.0;
const DEFAULT_AUTH_FAILURE_BURST: f64 = 20.0;
/// Set by Cloudflare's edge on every request, overwriting client values.
const DEFAULT_CLIENT_IP_HEADER: &str = "cf-connecting-ip";
/// How long a credential that passed real authentication stays exempt from
/// its IP's failed-authentication budget.
const VERIFIED_CREDENTIAL_TTL: Duration = Duration::from_secs(15 * 60);
/// Above this many tracked keys, stale buckets are evicted opportunistically.
const CLEANUP_THRESHOLD: usize = 10_000;
const STALE_BUCKET_SECONDS: f64 = 120.0;

#[derive(Debug, Clone, Copy)]
struct Bucket {
    tokens: f64,
    last_refill: Instant,
}

/// Token-bucket rate limiter keyed per API key (hashed) or per client IP.
#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<RateLimiterInner>,
}

struct RateLimiterInner {
    buckets: DashMap<String, Bucket>,
    rps: f64,
    burst: f64,
    auth_failures: DashMap<String, Bucket>,
    auth_failure_rps: f64,
    auth_failure_burst: f64,
    /// Fingerprints of credentials that recently passed authentication.
    verified: DashMap<String, Instant>,
    client_ip_header: Option<String>,
}

impl RateLimiter {
    pub fn from_env() -> Self {
        let rps = positive_f64_env("ENERGON_RATE_LIMIT_RPS", DEFAULT_RPS);
        let burst = positive_f64_env("ENERGON_RATE_LIMIT_BURST", DEFAULT_BURST).max(rps);
        let configured_header = env::var("ENERGON_CLIENT_IP_HEADER").ok();
        if configured_header.is_none() && crate::state::is_production() {
            tracing::warn!(
                "ENERGON_CLIENT_IP_HEADER is not set; trusting Cloudflare's cf-connecting-ip. \
                 Set it explicitly, or to `none` if the API is not served through Cloudflare."
            );
        }
        let client_ip_header = client_ip_header_setting(configured_header.as_deref());

        Self::build(rps, burst, client_ip_header)
    }

    #[cfg(test)]
    pub fn new(rps: f64, burst: f64) -> Self {
        Self::build(rps, burst, Some(DEFAULT_CLIENT_IP_HEADER.to_owned()))
    }

    fn build(rps: f64, burst: f64, client_ip_header: Option<String>) -> Self {
        Self {
            inner: Arc::new(RateLimiterInner {
                buckets: DashMap::new(),
                rps,
                burst,
                auth_failures: DashMap::new(),
                auth_failure_rps: DEFAULT_AUTH_FAILURE_RPS,
                auth_failure_burst: DEFAULT_AUTH_FAILURE_BURST,
                verified: DashMap::new(),
                client_ip_header,
            }),
        }
    }

    /// Take one token for `key` at time `now`. Returns `false` when the
    /// bucket is empty (the caller should answer 429).
    pub fn try_acquire_at(&self, key: &str, now: Instant) -> bool {
        self.maybe_cleanup(now);

        take_token(
            &self.inner.buckets,
            key,
            now,
            self.inner.rps,
            self.inner.burst,
        )
    }

    /// Whether `client` may still attempt authentication at `now`.
    fn auth_allowed_at(&self, client: &str, now: Instant) -> bool {
        let Some(mut bucket) = self.inner.auth_failures.get_mut(client) else {
            return true;
        };

        refill(
            &mut bucket,
            now,
            self.inner.auth_failure_rps,
            self.inner.auth_failure_burst,
        );
        bucket.tokens >= 1.0
    }

    /// Spend one failure token for `client` after a 401 response.
    fn record_auth_failure_at(&self, client: &str, now: Instant) {
        take_token(
            &self.inner.auth_failures,
            client,
            now,
            self.inner.auth_failure_rps,
            self.inner.auth_failure_burst,
        );
    }

    /// Called by the authentication layer once a credential was actually
    /// checked and accepted. Only then may it bypass a throttled IP, so an
    /// attacker guessing keys behind a shared NAT cannot lock out the real
    /// agents and operators that share that address.
    pub fn mark_verified(&self, headers: &HeaderMap) {
        if let Some(fingerprint) = credential_fingerprint(headers) {
            self.mark_verified_at(fingerprint, Instant::now());
        }
    }

    fn mark_verified_at(&self, fingerprint: String, now: Instant) {
        self.inner.verified.insert(fingerprint, now);
    }

    fn is_verified_at(&self, fingerprint: &str, now: Instant) -> bool {
        self.inner
            .verified
            .get(fingerprint)
            .is_some_and(|verified_at| {
                now.saturating_duration_since(*verified_at) < VERIFIED_CREDENTIAL_TTL
            })
    }

    fn forget_verified(&self, fingerprint: &str) {
        self.inner.verified.remove(fingerprint);
    }

    fn maybe_cleanup(&self, now: Instant) {
        if self.inner.verified.len() > CLEANUP_THRESHOLD {
            self.inner.verified.retain(|_, verified_at| {
                now.saturating_duration_since(*verified_at) < VERIFIED_CREDENTIAL_TTL
            });
        }

        if self.inner.buckets.len() <= CLEANUP_THRESHOLD {
            return;
        }

        let fresh = |_: &String, bucket: &mut Bucket| {
            now.saturating_duration_since(bucket.last_refill)
                .as_secs_f64()
                < STALE_BUCKET_SECONDS
        };
        self.inner.buckets.retain(fresh);
        self.inner.auth_failures.retain(fresh);
    }
}

fn take_token(
    buckets: &DashMap<String, Bucket>,
    key: &str,
    now: Instant,
    rps: f64,
    burst: f64,
) -> bool {
    let mut bucket = buckets.entry(key.to_owned()).or_insert(Bucket {
        tokens: burst,
        last_refill: now,
    });

    refill(&mut bucket, now, rps, burst);

    if bucket.tokens >= 1.0 {
        bucket.tokens -= 1.0;
        true
    } else {
        false
    }
}

fn refill(bucket: &mut Bucket, now: Instant, rps: f64, burst: f64) {
    let elapsed = now
        .saturating_duration_since(bucket.last_refill)
        .as_secs_f64();
    bucket.tokens = (bucket.tokens + elapsed * rps).min(burst);
    bucket.last_refill = now;
}

/// Axum middleware enforcing the token bucket per API key or client IP, plus
/// a per-IP budget for failed authentications. Every random bearer value
/// gets its own request bucket, so without the failure budget an attacker
/// could guess API keys at unlimited speed. The budget only gates requests
/// that present a credential, and credentials verified in the last 15
/// minutes pass even when their IP is throttled.
pub async fn rate_limit(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);
    let client = client_ip(
        request.headers(),
        peer,
        state.rate_limiter.inner.client_ip_header.as_deref(),
    );
    let key = limiter_key(request.headers(), &client);
    let credential = credential_fingerprint(request.headers());
    let now = Instant::now();

    if let Some(credential) = credential.as_deref()
        && !state.rate_limiter.is_verified_at(credential, now)
        && !state.rate_limiter.auth_allowed_at(&client, now)
    {
        return ApiError::TooManyRequests(
            "too many failed authentication attempts; retry later".to_owned(),
        )
        .into_response();
    }

    if !state.rate_limiter.try_acquire_at(&key, now) {
        return ApiError::TooManyRequests(
            "rate limit exceeded; retry after a short backoff".to_owned(),
        )
        .into_response();
    }

    let response = next.run(request).await;

    if response.status() == StatusCode::UNAUTHORIZED
        && let Some(credential) = credential.as_deref()
    {
        // A revoked or expired credential loses its exemption immediately.
        state.rate_limiter.forget_verified(credential);
        state
            .rate_limiter
            .record_auth_failure_at(&client, Instant::now());
    }

    response
}

/// Prefer the bearer credential (hashed, never stored raw) so one client
/// cannot starve others behind the same NAT; fall back to the client IP.
fn limiter_key(headers: &HeaderMap, client: &str) -> String {
    if let Some(token) = bearer_token(headers) {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let digest = hasher.finalize();
        return format!(
            "key:{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7]
        );
    }

    client.to_owned()
}

/// Resolve the client IP. Proxies append the address they saw to the right
/// of `X-Forwarded-For`, while everything to its left is client-controlled,
/// so only the rightmost entry is trusted. Single-value headers such as
/// Cloudflare's `cf-connecting-ip` (the default) resolve the same way. `None` means the
/// API is exposed directly and only the socket peer is trusted.
fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>, header: Option<&str>) -> String {
    let forwarded_ip = header
        .and_then(|name| headers.get(name))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(ip) = forwarded_ip {
        return format!("ip:{ip}");
    }

    match peer {
        Some(addr) => format!("ip:{}", addr.ip()),
        None => "ip:unknown".to_owned(),
    }
}

fn client_ip_header_setting(value: Option<&str>) -> Option<String> {
    match value.map(str::trim) {
        None | Some("") => Some(DEFAULT_CLIENT_IP_HEADER.to_owned()),
        Some(value) if value.eq_ignore_ascii_case("none") => None,
        Some(value) => Some(value.to_ascii_lowercase()),
    }
}

/// Full SHA-256 of the presented secret (bearer key/JWT or admin token).
/// Raw credentials are never stored.
fn credential_fingerprint(headers: &HeaderMap) -> Option<String> {
    let (kind, secret) = if let Some(token) = bearer_token(headers) {
        ("bearer", token)
    } else {
        let admin = headers.get("x-energon-admin-token")?.to_str().ok()?.trim();
        if admin.is_empty() {
            return None;
        }
        ("admin", admin)
    };

    let mut hasher = Sha256::new();
    hasher.update(kind.as_bytes());
    hasher.update(b":");
    hasher.update(secret.as_bytes());
    Some(
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .trim()
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn positive_f64_env(name: &str, default: f64) -> f64 {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| *value > 0.0)
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::http::HeaderValue;

    use super::*;

    #[test]
    fn burst_allows_initial_spike_then_limits() {
        let limiter = RateLimiter::new(10.0, 5.0);
        let now = Instant::now();

        for _ in 0..5 {
            assert!(limiter.try_acquire_at("client", now));
        }
        assert!(!limiter.try_acquire_at("client", now));
    }

    #[test]
    fn tokens_refill_over_time() {
        let limiter = RateLimiter::new(10.0, 2.0);
        let start = Instant::now();

        assert!(limiter.try_acquire_at("client", start));
        assert!(limiter.try_acquire_at("client", start));
        assert!(!limiter.try_acquire_at("client", start));

        // 10 rps -> one token back after 100ms.
        let later = start + Duration::from_millis(150);
        assert!(limiter.try_acquire_at("client", later));
        assert!(!limiter.try_acquire_at("client", later));
    }

    #[test]
    fn buckets_are_isolated_per_key() {
        let limiter = RateLimiter::new(10.0, 1.0);
        let now = Instant::now();

        assert!(limiter.try_acquire_at("client_a", now));
        assert!(!limiter.try_acquire_at("client_a", now));
        assert!(limiter.try_acquire_at("client_b", now));
    }

    #[test]
    fn limiter_key_prefers_bearer_over_ip() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer eos_live_secret"),
        );
        headers.insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4"));

        let key = limiter_key(&headers, "ip:1.2.3.4");
        assert!(key.starts_with("key:"));
        assert!(!key.contains("eos_live_secret"));

        assert_eq!(limiter_key(&HeaderMap::new(), "ip:1.2.3.4"), "ip:1.2.3.4");
    }

    #[test]
    fn client_ip_trusts_only_the_proxy_appended_entry() {
        let mut spoofed = HeaderMap::new();
        spoofed.insert(
            "x-forwarded-for",
            HeaderValue::from_static("6.6.6.6, 5.6.7.8"),
        );
        let peer: SocketAddr = "9.9.9.9:1234".parse().expect("valid socket addr");

        assert_eq!(
            client_ip(&spoofed, Some(peer), Some("x-forwarded-for")),
            "ip:5.6.7.8"
        );
        assert_eq!(client_ip(&spoofed, Some(peer), None), "ip:9.9.9.9");
        assert_eq!(
            client_ip(&HeaderMap::new(), Some(peer), Some("cf-connecting-ip")),
            "ip:9.9.9.9"
        );
    }

    #[test]
    fn client_ip_header_setting_supports_direct_exposure() {
        assert_eq!(
            client_ip_header_setting(None).as_deref(),
            Some("cf-connecting-ip")
        );
        assert_eq!(
            client_ip_header_setting(Some("X-Forwarded-For")).as_deref(),
            Some("x-forwarded-for")
        );
        assert_eq!(client_ip_header_setting(Some("none")), None);
    }

    #[test]
    fn verified_credentials_survive_a_throttled_ip_until_they_expire() {
        let limiter = RateLimiter::new(100.0, 100.0);
        let start = Instant::now();
        for _ in 0..DEFAULT_AUTH_FAILURE_BURST as usize {
            limiter.record_auth_failure_at("ip:1.2.3.4", start);
        }
        assert!(!limiter.auth_allowed_at("ip:1.2.3.4", start));

        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer eos_live_real"),
        );
        let fingerprint = credential_fingerprint(&headers).expect("bearer fingerprint");
        assert!(!fingerprint.contains("eos_live_real"));
        assert!(!limiter.is_verified_at(&fingerprint, start));

        limiter.mark_verified_at(fingerprint.clone(), start);
        assert!(limiter.is_verified_at(&fingerprint, start + Duration::from_secs(60)));
        assert!(!limiter.is_verified_at(&fingerprint, start + VERIFIED_CREDENTIAL_TTL));

        limiter.forget_verified(&fingerprint);
        assert!(!limiter.is_verified_at(&fingerprint, start));
    }

    #[test]
    fn requests_without_credentials_have_no_fingerprint() {
        assert!(credential_fingerprint(&HeaderMap::new()).is_none());
        let mut admin = HeaderMap::new();
        admin.insert("x-energon-admin-token", HeaderValue::from_static("secret"));
        let mut bearer = HeaderMap::new();
        bearer.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer secret"),
        );
        assert_ne!(
            credential_fingerprint(&admin),
            credential_fingerprint(&bearer)
        );
    }

    #[test]
    fn repeated_auth_failures_block_the_client_until_refill() {
        let limiter = RateLimiter::new(100.0, 100.0);
        let start = Instant::now();

        for _ in 0..DEFAULT_AUTH_FAILURE_BURST as usize {
            assert!(limiter.auth_allowed_at("ip:1.2.3.4", start));
            limiter.record_auth_failure_at("ip:1.2.3.4", start);
        }

        assert!(!limiter.auth_allowed_at("ip:1.2.3.4", start));
        assert!(limiter.auth_allowed_at("ip:5.6.7.8", start));
        assert!(limiter.auth_allowed_at("ip:1.2.3.4", start + Duration::from_secs(2)));
    }
}
