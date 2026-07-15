use std::{env, net::SocketAddr, sync::Arc, time::Instant};

use axum::{
    extract::{ConnectInfo, Request, State},
    http::HeaderMap,
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use sha2::{Digest, Sha256};

use crate::{errors::ApiError, state::AppState};

const DEFAULT_RPS: f64 = 20.0;
const DEFAULT_BURST: f64 = 40.0;
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
}

impl RateLimiter {
    pub fn from_env() -> Self {
        let rps = positive_f64_env("ENERGON_RATE_LIMIT_RPS", DEFAULT_RPS);
        let burst = positive_f64_env("ENERGON_RATE_LIMIT_BURST", DEFAULT_BURST).max(rps);

        Self::new(rps, burst)
    }

    pub fn new(rps: f64, burst: f64) -> Self {
        Self {
            inner: Arc::new(RateLimiterInner {
                buckets: DashMap::new(),
                rps,
                burst,
            }),
        }
    }

    /// Take one token for `key` at time `now`. Returns `false` when the
    /// bucket is empty (the caller should answer 429).
    pub fn try_acquire_at(&self, key: &str, now: Instant) -> bool {
        self.maybe_cleanup(now);

        let mut bucket = self.inner.buckets.entry(key.to_owned()).or_insert(Bucket {
            tokens: self.inner.burst,
            last_refill: now,
        });

        let elapsed = now
            .saturating_duration_since(bucket.last_refill)
            .as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.inner.rps).min(self.inner.burst);
        bucket.last_refill = now;

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }

    pub fn try_acquire(&self, key: &str) -> bool {
        self.try_acquire_at(key, Instant::now())
    }

    fn maybe_cleanup(&self, now: Instant) {
        if self.inner.buckets.len() <= CLEANUP_THRESHOLD {
            return;
        }

        self.inner.buckets.retain(|_, bucket| {
            now.saturating_duration_since(bucket.last_refill)
                .as_secs_f64()
                < STALE_BUCKET_SECONDS
        });
    }
}

/// Axum middleware enforcing the token bucket per API key or client IP.
pub async fn rate_limit(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);
    let key = limiter_key(request.headers(), peer);

    if !state.rate_limiter.try_acquire(&key) {
        return ApiError::TooManyRequests(
            "rate limit exceeded; retry after a short backoff".to_owned(),
        )
        .into_response();
    }

    next.run(request).await
}

/// Prefer the bearer credential (hashed, never stored raw) so one client
/// cannot starve others behind the same NAT; fall back to the client IP.
fn limiter_key(headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    if let Some(token) = bearer_token(headers) {
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let digest = hasher.finalize();
        return format!(
            "key:{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7]
        );
    }

    let forwarded_ip = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
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

        let key = limiter_key(&headers, None);
        assert!(key.starts_with("key:"));
        assert!(!key.contains("eos_live_secret"));

        let mut ip_only = HeaderMap::new();
        ip_only.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.2.3.4, 5.6.7.8"),
        );
        assert_eq!(limiter_key(&ip_only, None), "ip:1.2.3.4");

        let peer: SocketAddr = "9.9.9.9:1234".parse().expect("valid socket addr");
        assert_eq!(limiter_key(&HeaderMap::new(), Some(peer)), "ip:9.9.9.9");
    }
}
