# Multi-stage Dockerfile tailored for the Sinopsis worker summarizer service

#############
# Builder stage
#############
FROM rust:1.90-alpine3.20 AS builder

ENV CARGO_TERM_COLOR=always

RUN apk add --no-cache \
        build-base \
        ca-certificates \
        openssl-dev \
        openssl-libs-static \
        pkgconfig

WORKDIR /app

# Copy manifests first to maximise Docker cache usage
COPY Cargo.toml Cargo.lock ./

# Create dummy src for dependency cache warm-up
RUN mkdir -p src \
    && echo "fn main() {}" > src/main.rs \
    && cargo fetch --locked \
    && rm -rf src

# Copy the actual source code and rebuild
COPY src ./src
RUN cargo build --release --locked --bin sinopsis_worker_summarizer

#############
# Runtime stage
#############
FROM alpine:3.20

RUN apk add --no-cache ca-certificates \
    && adduser -D -u 1001 worker

WORKDIR /app

COPY --from=builder /app/target/release/sinopsis_worker_summarizer /usr/local/bin/sinopsis_worker_summarizer
COPY prompt.txt /app/prompt.txt

USER worker

ENV RUST_LOG=info

CMD ["sinopsis_worker_summarizer"]
