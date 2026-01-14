#!/bin/bash

# DigitalOcean User Data / Setup Script
# Run this on your fresh Ubuntu 24.04/22.04 Droplet

set -e

echo ">>> Updating System..."
apt update && apt upgrade -y

echo ">>> Installing Essential Tools..."
apt install -y curl git unzip build-essential

echo ">>> Installing Docker..."
if ! command -v docker &> /dev/null; then
    apt install -y docker.io
    systemctl start docker
    systemctl enable docker
    echo "Docker installed."
else
    echo "Docker already installed."
fi

echo ">>> Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    echo "Node.js installed."
else
    echo "Node.js already installed."
fi

echo ">>> Installing PM2..."
npm install -g pm2 typescript ts-node

echo ">>> Installing Nginx..."
apt install -y nginx

echo ">>> Firewall Setup..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
# ufw enable # Uncomment if you want to enable UFW immediately (can block ssh if not careful)

echo ">>> Setup Complete!"
echo "You can now clone your repo, set up .env files, and run 'pm2 start ecosystem.config.js'"
