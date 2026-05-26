#!/bin/bash
# HVP SanMar Proxy — One-command setup
# Run this from inside the hvp-sanmar-proxy folder
# Requires: Git (already on Mac/Linux; Windows use Git Bash)

set -e

echo ""
echo "================================================"
echo "  HVP SanMar Proxy — GitHub + Render Setup"
echo "================================================"
echo ""

# ── Step 1: Check git ──
if ! command -v git &> /dev/null; then
  echo "ERROR: Git is not installed."
  echo "Download it at: https://git-scm.com/downloads"
  exit 1
fi

# ── Step 2: Get GitHub username ──
echo "Step 1 of 3 — GitHub"
echo "---------------------"
echo "You need a free GitHub account. Create one at https://github.com if you don't have one."
echo ""
read -p "Enter your GitHub username: " GH_USER

if [ -z "$GH_USER" ]; then
  echo "ERROR: GitHub username required."
  exit 1
fi

REPO_NAME="hvp-sanmar-proxy"
REPO_URL="https://github.com/$GH_USER/$REPO_NAME.git"

echo ""
echo "Next: Create the GitHub repository."
echo "  1. Open this URL in your browser:"
echo "     https://github.com/new"
echo "  2. Repository name: $REPO_NAME"
echo "  3. Set to Public"
echo "  4. Do NOT add README, .gitignore, or license"
echo "  5. Click 'Create repository'"
echo ""
read -p "Press Enter once the repo is created... "

# ── Step 3: Push to GitHub ──
echo ""
echo "Pushing code to GitHub..."

# Initialize if needed
if [ ! -d ".git" ]; then
  git init
fi

git add .
git commit -m "Initial deploy" 2>/dev/null || git commit --allow-empty -m "Initial deploy"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo ""
echo "Pushing to $REPO_URL ..."
echo "(You may be prompted for your GitHub password or personal access token)"
git push -u origin main

echo ""
echo "✓ Code is on GitHub."

# ── Step 4: Render instructions ──
echo ""
echo "Step 2 of 3 — Render Deployment"
echo "---------------------------------"
echo "1. Go to: https://render.com"
echo "2. Sign up / log in with GitHub"
echo "3. Click: New + → Web Service"
echo "4. Connect repository: $GH_USER/$REPO_NAME"
echo "5. Use these settings:"
echo "     Name:          hvp-sanmar-proxy"
echo "     Branch:        main"
echo "     Runtime:       Node"
echo "     Build Command: npm install"
echo "     Start Command: node server.js"
echo "     Plan:          Free"
echo "6. Click 'Create Web Service'"
echo "7. Wait ~2 minutes for deployment"
echo "8. Copy your URL (looks like: https://hvp-sanmar-proxy.onrender.com)"
echo ""
read -p "Enter your Render URL once deployed (e.g. https://hvp-sanmar-proxy.onrender.com): " RENDER_URL

# ── Step 5: Write URL to a config file ──
if [ ! -z "$RENDER_URL" ]; then
  echo ""
  echo "Step 3 of 3 — Connect to Quote Builder"
  echo "---------------------------------------"
  echo "In the HVPromos_QuoteBuilder.html file:"
  echo "  1. Click ⚙ Settings (top right)"
  echo "  2. Enter your SanMar username and password"
  echo "  3. Paste this Proxy URL:"
  echo "     $RENDER_URL"
  echo "  4. Click 'Test Connection' — should go green"
  echo "  5. Click Save"
  echo ""
  # Save URL for reference
  echo "$RENDER_URL" > .render_url
  echo "(URL also saved to .render_url for reference)"
fi

echo ""
echo "================================================"
echo "  All done! Your proxy is live."
echo "================================================"
echo ""
