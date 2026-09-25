#!/bin/bash
# Deploy to Cloudflare Pages
# Usage: ./deploy.sh [project-name]

PROJECT_NAME="${1:-${CLOUDFLARE_PROJECT:-ishaan-dalvi}}"

echo "🚀 Deploying to Cloudflare Pages (Project: $PROJECT_NAME)..."

if command -v wrangler &> /dev/null; then
    CMD="wrangler"
elif command -v npx &> /dev/null; then
    CMD="npx wrangler"
else
    echo "❌ Neither wrangler nor npx is available."
    exit 1
fi

$CMD pages deploy . --project-name="$PROJECT_NAME" || $CMD pages deploy . --project-name="ishaan"

echo "✅ Deployment complete! Check https://$PROJECT_NAME.pages.dev or https://ishaan.pages.dev"
