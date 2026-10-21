//! Short-lived download links for trained adapters stored in S3-compatible
//! object storage (Cloudflare R2 in production). AWS Signature V4, query auth.
use std::env;

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

/// How long a download link stays valid.
pub const DOWNLOAD_TTL_SECONDS: u64 = 15 * 60;

#[derive(Clone)]
pub struct ArtifactStore {
    /// e.g. `https://<account>.r2.cloudflarestorage.com`
    endpoint: String,
    region: String,
    access_key_id: String,
    secret_access_key: String,
}

impl ArtifactStore {
    pub fn from_env() -> Option<Self> {
        let value = |name: &str| {
            env::var(name)
                .ok()
                .map(|v| v.trim().to_owned())
                .filter(|v| !v.is_empty())
        };
        Some(Self {
            endpoint: value("ENERGON_ARTIFACTS_ENDPOINT")?
                .trim_end_matches('/')
                .to_owned(),
            region: value("ENERGON_ARTIFACTS_REGION").unwrap_or_else(|| "auto".to_owned()),
            access_key_id: value("ENERGON_ARTIFACTS_ACCESS_KEY_ID")?,
            secret_access_key: value("ENERGON_ARTIFACTS_SECRET_ACCESS_KEY")?,
        })
    }

    /// Presigns `s3://bucket/key` as a path-style GET URL. Other URIs pass through.
    pub fn download_url(&self, uri: &str, now_unix_s: u64) -> Option<String> {
        if uri.starts_with("https://") {
            return Some(uri.to_owned());
        }
        let (bucket, key) = uri.strip_prefix("s3://")?.split_once('/')?;
        if bucket.is_empty() || key.is_empty() {
            return None;
        }
        let host = self.endpoint.strip_prefix("https://")?;
        let path = format!("/{}/{}", encode(bucket, false), encode(key, true));
        Some(presign_get(
            host,
            &path,
            &self.region,
            &self.access_key_id,
            &self.secret_access_key,
            &amz_date(now_unix_s),
            DOWNLOAD_TTL_SECONDS,
        ))
    }
}

fn presign_get(
    host: &str,
    path: &str,
    region: &str,
    access_key_id: &str,
    secret: &str,
    amz_date: &str,
    expires: u64,
) -> String {
    let date = &amz_date[..8];
    let scope = format!("{date}/{region}/s3/aws4_request");
    let credential = encode(&format!("{access_key_id}/{scope}"), false);
    let query = format!(
        "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential={credential}&X-Amz-Date={amz_date}&X-Amz-Expires={expires}&X-Amz-SignedHeaders=host"
    );
    let canonical_request = format!("GET\n{path}\n{query}\nhost:{host}\n\nhost\nUNSIGNED-PAYLOAD");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex(&Sha256::digest(canonical_request.as_bytes()))
    );
    let mut key = hmac(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    for part in [region, "s3", "aws4_request"] {
        key = hmac(&key, part.as_bytes());
    }
    let signature = hex(&hmac(&key, string_to_sign.as_bytes()));
    format!("https://{host}{path}?{query}&X-Amz-Signature={signature}")
}

fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// RFC 3986 encoding as required by SigV4; `/` survives only inside object keys.
fn encode(value: &str, keep_slash: bool) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        let unreserved = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if unreserved || (keep_slash && byte == b'/') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// `YYYYMMDDTHHMMSSZ` from unix seconds (UTC), without a date library.
fn amz_date(unix_s: u64) -> String {
    let days = (unix_s / 86_400) as i64;
    let seconds = unix_s % 86_400;
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}{month:02}{day:02}T{:02}{:02}{:02}Z",
        seconds / 3_600,
        (seconds % 3_600) / 60,
        seconds % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Official example from the AWS docs ("Authenticating Requests: Using Query Parameters").
    #[test]
    fn matches_the_aws_sigv4_reference_signature() {
        let url = presign_get(
            "examplebucket.s3.amazonaws.com",
            "/test.txt",
            "us-east-1",
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "20130524T000000Z",
            86_400,
        );
        assert!(url.ends_with(
            "X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
        ));
    }

    #[test]
    fn formats_unix_time_as_amz_date() {
        assert_eq!(amz_date(1_369_353_600), "20130524T000000Z");
        assert_eq!(amz_date(951_782_400), "20000229T000000Z");
        assert_eq!(amz_date(1_792_623_901), "20261021T230501Z");
    }

    #[test]
    fn builds_path_style_urls_for_s3_uris() {
        let store = ArtifactStore {
            endpoint: "https://acct.r2.cloudflarestorage.com".into(),
            region: "auto".into(),
            access_key_id: "id".into(),
            secret_access_key: "secret".into(),
        };
        let url = store
            .download_url("s3://adapters/org 1/agent/v3.tar", 1_792_623_901)
            .unwrap();
        assert!(url.starts_with(
            "https://acct.r2.cloudflarestorage.com/adapters/org%201/agent/v3.tar?X-Amz-Algorithm="
        ));
        assert!(store.download_url("s3://only-bucket", 0).is_none());
        assert_eq!(
            store.download_url("https://cdn/x", 0).as_deref(),
            Some("https://cdn/x")
        );
    }
}
