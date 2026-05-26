# HVP SanMar Proxy

A lightweight server that lets the Hudson Valley Promos Quote Builder talk to SanMar's API — which blocks direct browser requests due to CORS.

---

## Deploy to Render (free, ~3 minutes)

### Step 1 — Put this folder on GitHub

1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository** → name it `hvp-sanmar-proxy` → **Create repository**
3. On your computer, open a terminal in this folder and run:
   ```
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/hvp-sanmar-proxy.git
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username)

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New** → **Web Service**
3. Connect your `hvp-sanmar-proxy` repository
4. Render will auto-detect it's Node.js — use these settings:
   - **Name:** `hvp-sanmar-proxy`
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Click **Create Web Service**
6. Wait ~2 minutes for it to build and deploy
7. Copy your URL — it'll look like: `https://hvp-sanmar-proxy.onrender.com`

### Step 3 — Connect the Quote Builder

1. Open the Quote Builder HTML file
2. Click **⚙ Settings** in the top right
3. Enter your **SanMar username and password**
4. Enter your **Proxy URL** (the Render URL from Step 2)
5. Click **Test Connection** — you should see a green success message
6. Click **Save**

That's it. Style lookups will now pull live product names, colors, and images from SanMar.

---

## What the proxy does

| Endpoint | What it does |
|---|---|
| `GET /` | Health check |
| `POST /api/test` | Validates your SanMar credentials |
| `POST /api/product` | Looks up a style — returns name, description, color list |
| `POST /api/pricing` | Gets wholesale pricing by size for a style+color |
| `GET /api/image/:style` | Fetches and returns the product image as base64 |

All endpoints accept `{ username, password, style }` in the request body.

---

## Notes

- The free Render tier spins down after 15 minutes of inactivity — first request after idle takes ~30 seconds. Upgrade to Render's $7/mo plan if you want instant response every time.
- Your SanMar credentials are **never stored** on the proxy — they're passed in each request from the Quote Builder and used immediately.
- This proxy only talks to `ws.sanmar.com` and `cdnl.sanmar.com` — nothing else.

