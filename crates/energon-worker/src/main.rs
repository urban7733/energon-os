use std::{env, time::Duration};

use async_nats::{HeaderMap, jetstream};
use energon_db::event_outbox;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tracing_subscriber::{EnvFilter, fmt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("energon_worker=info".parse().unwrap()),
        )
        .init();

    let database_url = required_env("DATABASE_URL")?;
    let openai_api_key = optional_env("OPENAI_API_KEY");
    let model =
        env::var("ENERGON_EMBEDDING_MODEL").unwrap_or_else(|_| "text-embedding-3-small".to_owned());
    let batch_size = env::var("ENERGON_EMBEDDING_BATCH_SIZE")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(16);
    let run_once = env::var("ENERGON_WORKER_ONCE")
        .ok()
        .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"));
    let event_batch_size = env::var("ENERGON_EVENT_OUTBOX_BATCH_SIZE")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(100);
    let publisher = match optional_env("ENERGON_NATS_URL") {
        Some(nats_url) => Some(EventPublisher::connect(&nats_url).await?),
        None => {
            tracing::warn!("ENERGON_NATS_URL is not configured; outbox events will remain pending");
            None
        }
    };

    if openai_api_key.is_none() && publisher.is_none() {
        return Err(config_error(
            "configure OPENAI_API_KEY and/or ENERGON_NATS_URL for the worker",
        ));
    }

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let client = reqwest::Client::new();

    tracing::info!(
        %model,
        batch_size,
        event_batch_size,
        embedding_enabled = openai_api_key.is_some(),
        event_publisher_enabled = publisher.is_some(),
        "Energon worker started"
    );

    loop {
        let embedded = match &openai_api_key {
            Some(api_key) => {
                process_embedding_batch(&pool, &client, api_key, &model, batch_size).await?
            }
            None => 0,
        };
        let published = match &publisher {
            Some(publisher) => publish_outbox_batch(&pool, publisher, event_batch_size).await?,
            None => 0,
        };

        if run_once {
            tracing::info!(embedded, published, "worker one-shot finished");
            break;
        }

        if embedded == 0 && published == 0 {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    Ok(())
}

struct EventPublisher {
    context: jetstream::Context,
    worker_id: String,
}

impl EventPublisher {
    async fn connect(nats_url: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = async_nats::connect(nats_url).await?;
        let context = jetstream::new(client);
        context
            .get_or_create_stream(jetstream::stream::Config {
                name: "ENERGON_EVENTS".to_owned(),
                subjects: vec!["energon.events.>".to_owned()],
                max_messages: 1_000_000,
                duplicate_window: Duration::from_secs(10 * 60),
                ..Default::default()
            })
            .await?;

        Ok(Self {
            context,
            worker_id: format!("worker-{}", std::process::id()),
        })
    }
}

async fn publish_outbox_batch(
    pool: &PgPool,
    publisher: &EventPublisher,
    batch_size: i64,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let events = event_outbox::claim_batch(pool, &publisher.worker_id, batch_size, 60).await?;
    let mut published = 0;

    for event in events {
        let mut headers = HeaderMap::new();
        headers.insert("Nats-Msg-Id", event.event_id.as_str());
        let subject = event.subject.clone();
        let payload = event.payload.clone().into();

        let delivery = publisher
            .context
            .publish_with_headers(subject, headers, payload)
            .await;

        match delivery {
            Ok(ack) => match ack.await {
                Ok(_) => {
                    event_outbox::mark_published(pool, &event.event_id, &publisher.worker_id)
                        .await?;
                    published += 1;
                }
                Err(error) => {
                    release_event(pool, publisher, &event, &error.to_string()).await?;
                }
            },
            Err(error) => {
                release_event(pool, publisher, &event, &error.to_string()).await?;
            }
        }
    }

    Ok(published)
}

async fn release_event(
    pool: &PgPool,
    publisher: &EventPublisher,
    event: &event_outbox::PendingOutboxEvent,
    error: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let retry_after_seconds = retry_after_seconds(event.attempts);
    event_outbox::release_after_failure(
        pool,
        &event.event_id,
        &publisher.worker_id,
        retry_after_seconds,
        error,
    )
    .await?;
    tracing::warn!(
        event_id = %event.event_id,
        subject = %event.subject,
        attempts = event.attempts,
        retry_after_seconds,
        %error,
        "JetStream publish failed; event will retry"
    );
    Ok(())
}

fn retry_after_seconds(attempts: i32) -> i64 {
    let exponent = u32::try_from(attempts.saturating_sub(1))
        .unwrap_or(0)
        .min(9);
    (2_i64.pow(exponent)).min(300)
}

async fn process_embedding_batch(
    pool: &PgPool,
    client: &reqwest::Client,
    openai_api_key: &str,
    model: &str,
    batch_size: i64,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let rows = sqlx::query(
        r#"
        SELECT chunk_id, content
        FROM memory_chunks
        WHERE embedding IS NULL
        ORDER BY created_at ASC
        LIMIT $1
        "#,
    )
    .bind(batch_size)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(0);
    }

    let chunks = rows
        .into_iter()
        .map(|row| {
            Ok(ChunkForEmbedding {
                chunk_id: row.try_get("chunk_id")?,
                content: row.try_get("content")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    let inputs = chunks
        .iter()
        .map(|chunk| chunk.content.clone())
        .collect::<Vec<_>>();

    let response = client
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(openai_api_key)
        .json(&EmbeddingRequest {
            model,
            input: &inputs,
        })
        .send()
        .await?
        .error_for_status()?
        .json::<EmbeddingResponse>()
        .await?;

    for item in response.data {
        let Some(chunk) = chunks.get(item.index) else {
            continue;
        };

        let vector_literal = vector_literal(&item.embedding);

        sqlx::query(
            r#"
            UPDATE memory_chunks
            SET embedding = $1::vector
            WHERE chunk_id = $2
            "#,
        )
        .bind(vector_literal)
        .bind(&chunk.chunk_id)
        .execute(pool)
        .await?;
    }

    Ok(chunks.len())
}

fn required_env(name: &'static str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("{name} must be configured"),
            )
            .into()
        })
}

fn optional_env(name: &'static str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn config_error(message: impl Into<String>) -> Box<dyn std::error::Error + Send + Sync> {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into()).into()
}

fn vector_literal(embedding: &[f32]) -> String {
    let mut output = String::from("[");

    for (index, value) in embedding.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }

        output.push_str(&value.to_string());
    }

    output.push(']');
    output
}

struct ChunkForEmbedding {
    chunk_id: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct EmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(Debug, Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingData {
    index: usize,
    embedding: Vec<f32>,
}

#[cfg(test)]
mod tests {
    use crate::{retry_after_seconds, vector_literal};

    #[test]
    fn serializes_pgvector_literal() {
        assert_eq!(vector_literal(&[0.1, -0.2, 3.0]), "[0.1,-0.2,3]");
    }

    #[test]
    fn outbox_retry_backoff_is_capped() {
        assert_eq!(retry_after_seconds(1), 1);
        assert_eq!(retry_after_seconds(4), 8);
        assert_eq!(retry_after_seconds(100), 300);
    }
}
