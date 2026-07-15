use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

/// Run the embedded SQL migrations (`migrations/` at the repo root).
///
/// All migration files are idempotent (`IF NOT EXISTS`), so this is safe on
/// databases that were originally initialized via the docker-entrypoint-initdb
/// mount: sqlx records progress in its own `_sqlx_migrations` table and simply
/// re-applies the no-op statements on first boot.
pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
