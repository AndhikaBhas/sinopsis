# Use the official Rust image as the base image
FROM rust:1.70 AS builder

# Set the working directory
WORKDIR /app

# Copy the Cargo.toml and Cargo.lock files
COPY Cargo.toml Cargo.lock ./

# Copy the source code
COPY src ./src

# Build the application
RUN cargo build --release

# Use a minimal base image for the final stage
FROM debian:bullseye-slim

# Install ffmpeg and ca-certificates
RUN apt-get update && apt-get install -y ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the built binary from the builder stage
COPY --from=builder /app/target/release/sinopsis-worker-splicer /usr/local/bin/sinopsis-worker-splicer

# Copy the .env file
COPY .env .env

# Set the binary as the entrypoint
ENTRYPOINT ["sinopsis-worker-splicer"]