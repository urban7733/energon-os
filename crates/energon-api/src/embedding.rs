use std::{env, time::Duration};

use serde::{Deserialize, Serialize};

const DEFAULT_MODEL: &str = "text-embedding-3-small";
const EMBEDDING_TIMEOUT_SECONDS: u64 = 10;
const OPENAI_EMBEDDINGS_URL: &str = "https://api.openai.com/v1/embeddings";

/// Minimal OpenAI embeddings client for query-time semantic retrieval.
/// Mirrors the request shape used by `energon-worker` for chunk embeddings.
#[derive(Clone)]
pub struct EmbeddingClient {
    api_key: String,
    model: String,
    endpoint: String,
    client: reqwest::Client,
}

#[derive(Debug, thiserror::Error)]
pub enum EmbeddingError {
    #[error("embedding request failed: {0}")]
    Request(String),
    #[error("embedding response was malformed: {0}")]
    Malformed(String),
}

#[derive(Serialize)]
struct EmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [&'a str],
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

impl EmbeddingClient {
    pub fn from_env() -> Option<Self> {
        let api_key = env::var("OPENAI_API_KEY")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())?;
        let model =
            env::var("ENERGON_EMBEDDING_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_owned());

        Some(Self::new(api_key, model, OPENAI_EMBEDDINGS_URL.to_owned()))
    }

    fn new(api_key: String, model: String, endpoint: String) -> Self {
        Self {
            api_key,
            model,
            endpoint,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(EMBEDDING_TIMEOUT_SECONDS))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Test hook: a client pointed at an unreachable endpoint, used to prove
    /// that embedding failures degrade to recency retrieval.
    #[cfg(test)]
    pub fn unreachable_for_tests() -> Self {
        Self::new(
            "test-key".to_owned(),
            DEFAULT_MODEL.to_owned(),
            // Reserved port on localhost: connection is refused immediately.
            "http://127.0.0.1:1/v1/embeddings".to_owned(),
        )
    }

    /// Embed a single query string. Failures are surfaced as errors so callers
    /// can fall back to recency-based retrieval instead of failing requests.
    pub async fn embed(&self, input: &str) -> Result<Vec<f32>, EmbeddingError> {
        let response = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&EmbeddingRequest {
                model: &self.model,
                input: &[input],
            })
            .send()
            .await
            .map_err(|error| EmbeddingError::Request(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            return Err(EmbeddingError::Request(format!(
                "OpenAI embeddings returned HTTP {status}"
            )));
        }

        let body = response
            .json::<EmbeddingResponse>()
            .await
            .map_err(|error| EmbeddingError::Malformed(error.to_string()))?;

        body.data
            .into_iter()
            .next()
            .map(|item| item.embedding)
            .filter(|embedding| !embedding.is_empty())
            .ok_or_else(|| EmbeddingError::Malformed("empty embedding data".to_owned()))
    }
}

/// Serialize an embedding as a pgvector literal (`[0.1,-0.2,3]`).
pub fn vector_literal(embedding: &[f32]) -> String {
    let mut output = String::with_capacity(embedding.len() * 8 + 2);
    output.push('[');

    for (index, value) in embedding.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&value.to_string());
    }

    output.push(']');
    output
}

#[cfg(test)]
mod tests {
    use super::vector_literal;

    #[test]
    fn serializes_pgvector_literal() {
        assert_eq!(vector_literal(&[0.1, -0.2, 3.0]), "[0.1,-0.2,3]");
    }
}
