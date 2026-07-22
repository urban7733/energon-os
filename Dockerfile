FROM rust:1.96-bookworm AS builder

WORKDIR /app
COPY . .
RUN cargo build --release -p energon-api -p energon-worker

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/energon-api /usr/local/bin/energon-api
COPY --from=builder /app/target/release/energon-worker /usr/local/bin/energon-worker

ENV ENERGON_BIND_ADDR=0.0.0.0:3000
ENV ENERGON_ENV=production
EXPOSE 3000

# Set ENERGON_PROCESS=energon-worker for the private embedding worker service.
CMD ["sh", "-c", "exec ${ENERGON_PROCESS:-energon-api}"]
