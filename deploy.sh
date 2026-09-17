#!/bin/bash
# Deploy to Cloudflare Pages
# Usage: ./deploy.sh

echo "🚀 Deploying to Cloudflare Pages..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler..."
    npm install -g wrangler
fi

# Deploy
wrangler pages deploy /home/work/ishaan-site --project-name=ishaan

echo "✅ Deployed! Check https://ishaan.pages.dev"