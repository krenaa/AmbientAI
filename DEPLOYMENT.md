# 🚀 AmbientDesk AI — Free Production Deployment Guide
## (FastAPI on Render + React on Vercel + pgvector on Neon/Supabase)

This guide provides step-by-step instructions to deploy **AmbientDesk AI** completely free of charge.

---

## Architecture Overview
* **Frontend**: React 19 + TypeScript + Vite ➔ Hosted on **Vercel** (Free Tier)
* **Backend**: FastAPI + LangGraph + WebSockets ➔ Hosted on **Render** (Free Web Service)
* **Database**: PostgreSQL with `pgvector` ➔ Hosted on **Neon** or **Supabase** (Free Tier)

---

## Step 1: Database Setup (Neon PostgreSQL with pgvector) — 100% Free

1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project named `ambientdesk-db`.
3. In the Neon Console, go to the **SQL Editor** and enable `pgvector`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Copy your connection string from the Neon dashboard (e.g.):
   `postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`

---

## Step 2: Backend Deployment on Render — 100% Free

1. Go to [render.com](https://render.com) and sign in.
2. Click **New +** ➔ **Web Service**.
3. Connect your GitHub repository (`ambientdesk-ai`).
4. Configure the Web Service settings:
   - **Name**: `ambientdesk-backend`
   - **Region**: Same region as your database (e.g. `Ohio (US East)` / `Frankfurt`)
   - **Branch**: `main`
   - **Root Directory**: Leave blank (or `backend` if deploying only backend subfolder)
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r backend/requirements.txt
     ```
   - **Start Command**:
     ```bash
     python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: `Free`

5. Add **Environment Variables** in Render dashboard:
   | Key | Value / Example | Notes |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` | From Neon / Supabase |
   | `SECRET_KEY` | `generate_a_random_32_char_secret_key` | For JWT authentication |
   | `GROQ_API_KEY` | `gsk_...` | From [console.groq.com](https://console.groq.com) |
   | `GOOGLE_API_KEY` | `AIza...` | From [aistudio.google.com](https://aistudio.google.com) |
   | `TAVILY_API_KEY` | `tvly-...` | From [tavily.com](https://tavily.com) |
   | `ALLOWED_ORIGINS` | `*` or `https://your-app.vercel.app` | Comma-separated domains |
   | `ENVIRONMENT` | `production` | Production mode |
   | `DEBUG` | `False` | Disable debug reloader |

6. Click **Create Web Service**. Once deployed, copy your Render URL:
   `https://ambientdesk-backend.onrender.com`

---

## Step 3: Create Admin User on Production Database

Run the admin creation script locally or using Render shell:
```bash
python backend/create_admin.py --email admin@ambientdesk.ai --password "YourStrongAdminPassword123!"
```

---

## Step 4: Frontend Deployment on Vercel — 100% Free

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New...** ➔ **Project** and import your `ambientdesk-ai` repository.
3. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend` *(Click Edit and select the `frontend` folder)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Add Environment Variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://<YOUR-RENDER-BACKEND-NAME>.onrender.com/api`
5. Click **Deploy**.

---

## Step 5: Verify Live Deployment

1. Visit your Vercel URL (e.g. `https://ambientdesk.vercel.app`).
2. Log in with your admin credentials (`admin@ambientdesk.ai`).
3. Verify that the WebSocket indicator displays **Live Neural Stream**.
4. Run a test agent session (e.g. `"Search the web for latest AI news"`).

---

## Troubleshooting & Tips

* **Render Free Tier Spin-Down**: Free instances on Render spin down after 15 minutes of inactivity. The first request after spin-down may take ~30 seconds to wake up.
* **CORS Errors**: If you get a CORS error in the browser console, ensure your Render `ALLOWED_ORIGINS` environment variable includes your exact Vercel domain (e.g. `https://ambientdesk.vercel.app`) or `*`.
* **Single Page App (SPA) Routing**: Vercel routing is already pre-configured in `frontend/vercel.json`.
