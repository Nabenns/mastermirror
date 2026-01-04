#!/bin/bash

# Discord Auto-Forwarder Nginx Setup Script
# This script installs Nginx, configures a reverse proxy, and sets up SSL with Certbot.

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "======================================================="
echo "   Discord Auto-Forwarder Nginx Setup"
echo "======================================================="

# 1. Install Nginx and Certbot
echo ""
echo "[1/5] Installing Nginx and Certbot..."
apt-get update
apt-get install -y nginx python3-certbot-nginx

# 2. Get Domain Name
echo ""
echo "[2/5] Configuration"
read -p "Enter your domain name (e.g., mirror1.domain.com): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
  echo "Error: Domain name is required."
  exit 1
fi

read -p "Enter the app port (default: 3000): " APP_PORT
APP_PORT=${APP_PORT:-3000}

CONFIG_FILE="/etc/nginx/sites-available/$DOMAIN_NAME"

# 3. Create Nginx Configuration
echo ""
echo "[3/5] Creating Nginx configuration for $DOMAIN_NAME on port $APP_PORT..."

cat > "$CONFIG_FILE" <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 4. Enable Site
echo ""
echo "[4/5] Enabling site..."
ln -sf "$CONFIG_FILE" "/etc/nginx/sites-enabled/"

# Test configuration
nginx -t
if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo "Nginx configuration reloaded successfully."
else
  echo "Error: Nginx configuration test failed. Please check the config file."
  exit 1
fi

# 5. SSL Setup (Optional)
echo ""
echo "[5/5] SSL Setup"
read -p "Do you want to set up SSL (HTTPS) with Let's Encrypt? (y/n): " SETUP_SSL

if [[ "$SETUP_SSL" =~ ^[Yy]$ ]]; then
  echo "Running Certbot..."
  certbot --nginx -d "$DOMAIN_NAME"
else
  echo "Skipping SSL setup. You can run 'sudo certbot --nginx -d $DOMAIN_NAME' later."
fi

echo ""
echo "======================================================="
echo "   Setup Complete!"
echo "   Your app should be accessible at http://$DOMAIN_NAME"
echo "======================================================="
