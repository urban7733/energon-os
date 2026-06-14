use std::{env, time::Duration};

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
    let openai_api_key = required_env("OPENAI_API_KEY")?;
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

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    let client = reqwest::Client::new();

    tracing::info!(%model, batch_size, "Energon worker started");

    loop {
        let processed =
            process_embedding_batch(&pool, &client, &openai_api_key, &model, batch_size).await?;

        if run_once {
            tracing::info!(processed, "worker one-shot finished");
            break;
        }

        if processed == 0 {
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    }

    Ok(())
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
    use crate::vector_literal;

    #[test]
    fn serializes_pgvector_literal() {
        assert_eq!(vector_literal(&[0.1, -0.2, 3.0]), "[0.1,-0.2,3]");
    }
}
