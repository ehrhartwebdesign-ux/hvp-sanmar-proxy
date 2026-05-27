# HVP Quoting App — Deployment Guide

## Architecture
One Render service handles everything: Express backend + SanMar proxy + React frontend.
No separate proxy service needed. Old hvp-sanmar-proxy on Render can be deleted.

---

## Step 1 — Push to GitHub

Push this entire folder to a GitHub repo (e.g. `hvp-quoting-app`).
Your repo should have: server.js, package.json, src/, frontend/

---

## Step 2 — Add PostgreSQL on Render

1. Render dashboard → **New** → **PostgreSQL**
2. Name: `hvp-quoting-db`, Plan: Free
3. Click **Create Database**
4. Copy the **Internal Database URL** (starts with `postgresql://`)

---

## Step 3 — Create Web Service on Render

1. Render dashboard → **New** → **Web Service**
2. Connect your `hvp-quoting-app` GitHub repo
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install && cd frontend && npm install && npm run build`
   - **Start Command:** `node server.js`
   - **Plan:** Free

4. **Environment Variables** (click Environment tab):
   - `DATABASE_URL` = (paste Internal Database URL from Step 2)
   - `JWT_SECRET` = any random 32+ char string (e.g. run `openssl rand -hex 32`)
   - `NODE_ENV` = `production`

5. Click **Create Web Service** — first deploy takes ~5 minutes.

---

## Step 4 — First Login

Once deployed, go to your Render URL (e.g. `https://hvp-quoting-app.onrender.com`):

- Email: `admin@hvpromos.com`
- Password: `HVPromos2024!`
- **Change this password immediately** in Settings → Change Password

---

## Step 5 — Point Your Domain

To use `quoting.hvpromos.com`:

1. In Render: Settings → Custom Domains → Add `quoting.hvpromos.com`
2. In your DNS (wherever hvpromos.com is registered):
   - Add CNAME: `quoting` → `your-app.onrender.com`
3. Render provisions SSL automatically (takes ~10 minutes)

---

## Step 6 — Add Employees

1. Log in as admin
2. Go to **Settings** → scroll to **Employees**
3. Create accounts for each staff member
4. They log in, go to Settings → Change Password
5. Each employee enters their Outlook email + password in the Email modal
   when sending a quote (credentials are never stored server-side)

---

## Outlook App Password (if MFA is enabled)

If an employee uses Microsoft MFA, they need an App Password:
1. Go to `account.microsoft.com` → Security → Advanced security options
2. Create an App Password
3. Use that App Password (not their regular password) when sending email

---

## Free Tier Notes

- Render free tier **sleeps after 15 min idle** — first request takes ~30 seconds
- PostgreSQL free tier: 1GB storage, 1 month data retention warning after 90 days
- Upgrade to Render Starter ($7/mo) to prevent sleeping once in active use

---

## SanMar Integration

SanMar credentials (username, password, customer number) are stored locally
in each employee's browser — never in the database. Set them in Settings.

Web services access must be enabled by emailing `sanmarintegrations@sanmar.com`
with your SanMar customer number. Takes 1-2 business days.
