#!/bin/bash

# NGINX Configuration Update Script for Audio Recording Fix
# This script updates NGINX configuration to enable audio recording through reverse proxy

set -e

echo "================================================"
echo "NGINX Audio Recording Fix - Configuration Update"
echo "================================================"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Configuration file path
CONFIG_FILE="/etc/nginx/sites-available/sinopsis.bigdata.pens.ac.id"
BACKUP_FILE="${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Configuration file not found: $CONFIG_FILE"
    echo "Please update the CONFIG_FILE variable in this script."
    exit 1
fi

echo "Found configuration file: $CONFIG_FILE"
echo ""

# Create backup
echo "Creating backup: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo "✓ Backup created successfully"
echo ""

# Check if headers already exist
if grep -q "Permissions-Policy.*microphone" "$CONFIG_FILE"; then
    echo "⚠️  WARNING: Permissions-Policy header already exists in config"
    echo "Do you want to continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Aborted. No changes made."
        exit 0
    fi
fi

# Create the new configuration
cat > /tmp/nginx_audio_fix.conf << 'EOF'
server {
    if ($host = sinopsis.bigdata.pens.ac.id) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    listen [::]:80;
    server_name sinopsis.bigdata.pens.ac.id;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sinopsis.bigdata.pens.ac.id;
    index index.html index.htm index.php;

    ssl_certificate /etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bigdata.pens.ac.id/privkey.pem;
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # CRITICAL: Security headers for getUserMedia() API
    add_header Permissions-Policy "microphone=(self), camera=(self)" always;
    add_header Feature-Policy "microphone 'self'; camera 'self'" always;
    
    # Additional security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 100M;

    location / {
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # CRITICAL: WebSocket and upgrade support
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_http_version 1.1;

        # Cookie handling
        proxy_cookie_path / /;

        # Content headers
        proxy_set_header Content-Type $content_type;
        proxy_set_header Content-Length $content_length;

        # Timeout settings for long recordings
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # CRITICAL: Disable buffering for streaming audio
        proxy_buffering off;
        proxy_request_buffering off;

        proxy_cache_bypass $http_upgrade;

        # Backend server
        proxy_pass http://10.252.178.50:3000;
    }

    location ~ /\.ht {
        deny all;
    }
}
EOF

echo "Applying new configuration..."
cp /tmp/nginx_audio_fix.conf "$CONFIG_FILE"
echo "✓ Configuration file updated"
echo ""

# Test configuration
echo "Testing NGINX configuration..."
if nginx -t; then
    echo "✓ Configuration test passed"
    echo ""
    
    # Reload NGINX
    echo "Reloading NGINX..."
    systemctl reload nginx
    echo "✓ NGINX reloaded successfully"
    echo ""
    
    # Verify the change
    echo "Verifying headers are being sent..."
    sleep 2
    
    if curl -I https://sinopsis.bigdata.pens.ac.id 2>&1 | grep -i "permissions-policy" > /dev/null; then
        echo "✓ Permissions-Policy header is being sent"
    else
        echo "⚠️  WARNING: Permissions-Policy header not detected"
        echo "   This might be normal if curl cannot verify SSL"
    fi
    
    echo ""
    echo "================================================"
    echo "✓ NGINX configuration updated successfully!"
    echo "================================================"
    echo ""
    echo "Next steps:"
    echo "1. Clear browser cache (Ctrl+Shift+Delete)"
    echo "2. Visit: https://sinopsis.bigdata.pens.ac.id/rapat/create"
    echo "3. Check the 'Diagnostik Audio' panel"
    echo "4. Try recording audio"
    echo ""
    echo "Backup saved at: $BACKUP_FILE"
    echo ""
    echo "To rollback if needed:"
    echo "  sudo cp $BACKUP_FILE $CONFIG_FILE"
    echo "  sudo systemctl reload nginx"
    echo ""
    
else
    echo "❌ ERROR: NGINX configuration test failed!"
    echo ""
    echo "Rolling back to previous configuration..."
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    echo "✓ Rollback complete"
    echo ""
    echo "Please check the error messages above and fix manually."
    exit 1
fi
