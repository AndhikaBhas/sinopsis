# RabbitMQ Connection Troubleshooting Guide

This guide helps resolve RabbitMQ connection issues with the Sinopsis ASR Worker.

## Common Error Messages and Solutions

### 1. "Connection refused" Error

```
ERROR - Socket failed to connect: ...; error=61 (Connection refused)
```

**Cause**: RabbitMQ server is not running or not accessible.

**Solutions**:

#### Quick Setup (macOS)

```bash
# Install RabbitMQ
brew install rabbitmq

# Start RabbitMQ
brew services start rabbitmq

# Or use our setup script
./setup_rabbitmq.sh
```

#### Quick Setup (Linux)

```bash
# Install RabbitMQ
sudo apt-get update
sudo apt-get install rabbitmq-server

# Start RabbitMQ
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server

# Or use our setup script
./setup_rabbitmq.sh
```

#### Docker Setup (Any OS)

```bash
# Run RabbitMQ in Docker
docker run -d \
  --name rabbitmq-dev \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=dev \
  -e RABBITMQ_DEFAULT_PASS=devpassword \
  rabbitmq:3-management

# Update .env file
# RABBITMQ_URL=amqp://dev:devpassword@localhost:5672/
```

### 2. "Authentication failed" Error

```
ERROR - Authentication failed
```

**Cause**: Invalid username/password in RABBITMQ_URL.

**Solutions**:

- Check the credentials in your `.env` file
- Default RabbitMQ credentials are `guest:guest`
- For Docker setup, use the credentials you specified

### 3. "Host not found" Error

```
ERROR - ... not found
```

**Cause**: Invalid hostname/IP address in RABBITMQ_URL.

**Solutions**:

- Verify the hostname in RABBITMQ_URL
- For local development, use `localhost`
- Check network connectivity if using remote RabbitMQ

## Configuration Examples

### Local Development

```env
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
```

### Docker Development

```env
RABBITMQ_URL=amqp://dev:devpassword@localhost:5672/
```

### Remote Server

```env
RABBITMQ_URL=amqp://username:password@rabbitmq.example.com:5672/
```

### With SSL

```env
RABBITMQ_URL=amqps://username:password@rabbitmq.example.com:5671/
```

## Verification Steps

### 1. Check if RabbitMQ is Running

```bash
# Native installation
rabbitmqctl status

# Docker
docker ps | grep rabbitmq
```

### 2. Test Connection

```bash
# Use our validation script
python validate_env.py

# Or test worker validation
python worker.py validate
```

### 3. Access Management UI

- Open http://localhost:15672 in your browser
- Default login: guest/guest
- Docker setup: dev/devpassword (or your custom credentials)

### 4. Check Ports

```bash
# Check if port 5672 is open
telnet localhost 5672

# Or use netstat
netstat -an | grep 5672
```

## Development vs Production

### Development Setup

- Use our `setup_rabbitmq.sh` script for quick setup
- Docker is the easiest option for development
- Default credentials are fine for local development

### Production Setup

- Use proper RabbitMQ clustering
- Configure SSL/TLS encryption
- Set up proper user accounts and permissions
- Configure monitoring and logging
- Use environment-specific credentials

## Troubleshooting Commands

### RabbitMQ Status

```bash
# Check status
rabbitmqctl status

# List users
rabbitmqctl list_users

# List queues
rabbitmqctl list_queues

# Check node health
rabbitmqctl node_health_check
```

### Docker Commands

```bash
# Check container logs
docker logs rabbitmq-dev

# Access container shell
docker exec -it rabbitmq-dev bash

# Restart container
docker restart rabbitmq-dev
```

### Network Debugging

```bash
# Test port connectivity
telnet localhost 5672

# Check listening ports
netstat -tulpn | grep 5672

# Test DNS resolution
nslookup rabbitmq.example.com
```

## Getting Help

If you're still having issues:

1. **Check the logs**: The worker provides detailed error messages
2. **Verify configuration**: Use `python validate_env.py`
3. **Test connectivity**: Use telnet or similar tools
4. **Check documentation**: RabbitMQ official documentation
5. **Use Docker**: Often the quickest solution for development

## Quick Start Commands

```bash
# 1. Setup RabbitMQ (choose one method)
./setup_rabbitmq.sh                    # Interactive setup
brew install rabbitmq && brew services start rabbitmq  # macOS
docker run -d --name rabbitmq-dev -p 5672:5672 -p 15672:15672 rabbitmq:3-management  # Docker

# 2. Configure environment
cp .env.example .env
# Edit .env with your RabbitMQ settings

# 3. Validate configuration
python validate_env.py

# 4. Test worker
python worker.py validate

# 5. Run worker
python worker.py
```
