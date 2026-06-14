mod app;
mod errors;
mod middleware;
mod routes;
mod secrets;
mod state;

use std::{env, net::SocketAddr};

use state::AppState;
use tracing_subscriber::{EnvFilter, fmt};

#[tokio::main]
async fn main() {
    fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("energon_api=info".parse().unwrap()),
        )
        .init();

    let bind_addr = env::var("ENERGON_BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_owned());
    let addr: SocketAddr = bind_addr
        .parse()
        .expect("ENERGON_BIND_ADDR must be a socket address");

    let state = AppState::from_env()
        .await
        .expect("failed to initialize application state");
    let app = app::router(state);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind API listener");

    tracing::info!(%addr, "Energon OS API listening");

    axum::serve(listener, app).await.expect("API server failed");
}
