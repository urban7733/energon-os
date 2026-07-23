mod app;
mod chain;
mod embedding;
mod errors;
mod jwt;
mod middleware;
mod obsidian_vault;
mod payments;
mod routes;
mod secrets;
mod state;
mod x402;

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

    let addr = resolve_bind_addr(env::var("ENERGON_BIND_ADDR").ok(), env::var("PORT").ok())
        .expect("ENERGON_BIND_ADDR must be a socket address");

    let state = AppState::from_env()
        .await
        .expect("failed to initialize application state");
    let app = app::router(state);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind API listener");

    tracing::info!(%addr, "Energon OS API listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("API server failed");
}

fn resolve_bind_addr(
    bind_addr: Option<String>,
    port: Option<String>,
) -> Result<SocketAddr, std::net::AddrParseError> {
    bind_addr
        .or_else(|| port.map(|port| format!("0.0.0.0:{port}")))
        .unwrap_or_else(|| "127.0.0.1:3001".to_owned())
        .parse()
}

#[cfg(test)]
mod tests {
    use super::resolve_bind_addr;

    #[test]
    fn uses_host_port_for_platform_deployments() {
        assert_eq!(
            resolve_bind_addr(None, Some("8080".to_owned()))
                .unwrap()
                .to_string(),
            "0.0.0.0:8080"
        );
    }

    #[test]
    fn explicit_address_takes_precedence() {
        assert_eq!(
            resolve_bind_addr(Some("127.0.0.1:4000".to_owned()), Some("8080".to_owned()))
                .unwrap()
                .to_string(),
            "127.0.0.1:4000"
        );
    }
}
