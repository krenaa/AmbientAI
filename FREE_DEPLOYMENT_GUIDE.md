# AmbientDesk AI — 100% Free Production Deployment Guide
## Vercel (Frontend) + Render (Backend & AI Agent) + Supabase (Database) + Upstash (Redis)

This guide provides an exact, step-by-step walkthrough to deploy **AmbientDesk AI** to production with **zero hosting costs ($0/month)**.

---

## 1. Complete Project Tech Stack Overview

| Layer | Technology | Role in AmbientDesk AI |
| :--- | :--- | :--- |
| **Frontend** | **React 19 + TypeScript + Vite** | Single-Page Application (SPA) dashboard, interactive canvas, profile modal |
| **Styling** | **Tailwind CSS + Lucide Icons** | Dark mode design system, responsive layouts, micro-animations |
| **Real-time Protocol** | **Native WebSockets (`wss://`)** | Instant bi-directional streaming of agent logs, thought events, and approvals |
| **Backend Framework** | **Django 5 + Django REST Framework** | User auth (JWT), database models, task management, permissions |
| **ASGI Web Server** | **Daphne + Django Channels** | Asynchronous HTTP and WebSocket gateway |
| **Task Queue** | **Celery** | Asynchronously executes multi-step AI workflows without blocking HTTP requests |
| **Message Broker** | **Redis** | Broker for Celery tasks & channel layer for Django Channels WebSockets |
| **AI Agent Service** | **FastAPI + LangGraph** | Multi-agent state graph orchestrator with memory persistence & interrupts |
| **LLMs** | **Groq (Llama 3.3 70B) & Gemini 2.5 Flash** | Fast inference & robust multi-modal reasoning fallback |
| **Vector Database** | **PostgreSQL + pgvector** | Long-term memory, document embeddings & semantic RAG retrieval |
| **Web Search** | **Tavily API** | Real-time external web search tool for agents |

---

## 2. Why This Free Tier Architecture?

* **Vercel (Frontend)**: 100% Free forever with edge CDN, automatic HTTPS, and instant GitHub CI/CD.
* **Render (Backend & Agent)**: Offers free web services for Python applications with native WebSocket support.
* **Supabase (PostgreSQL with `pgvector`)**: Free forever tier (500MB). *Render's built-in free PostgreSQL expires after 30 days*, making Supabase the ideal free database.
* **Upstash (Redis)**: Free forever serverless Redis (10,000 commands/day). *Render's free Redis also expires after 30 days*.

---

## 3. Step-by-Step Deployment Walkthrough

```mermaid
flowchart TD
    User([User Browser]) -->|HTTPS / WSS| Vercel[Vercel: React Frontend]
    Vercel -->|REST API & WebSockets| RenderDjango[Render: Django + Daphne + Celery]
    RenderDjango -->|Internal HTTP| RenderAgent[Render: FastAPI AI Agent]
    RenderDjango -->|Relational Data & Vectors| Supabase[(Supabase: Postgres + pgvector)]
    RenderDjango -->|Task Broker & Channels| Upstash[(Upstash: Serverless Redis)]
    RenderAgent -->|Embeddings| Supabase
    RenderAgent -->|Inference & Search| LLMs[Groq / Gemini / Tavily]
```

---

### Step 1: Set Up Free Database (Supabase) & Redis (Upstash)

#### 1.1 Supabase (PostgreSQL + pgvector)
1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**, name it `ambientdesk-db`, set a database password, and choose your closest region.
3. Once created, go to **Project Settings** -> **Database**.
4. Under **Connection String**, select **URI** (Mode: `Session` or `Transaction`) and copy it. It looks like:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
5. Go to the **SQL Editor** in Supabase and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

#### 1.2 Upstash (Redis)
1. Go to [upstash.com](https://upstash.com) and create a free account.
2. Click **Create Database** -> Name: `ambientdesk-redis` -> Select your closest region -> Click **Create**.
3. In the database details, copy the **`UPSTASH_REDIS_REST_URL`** or standard **Redis URL** under the **Node / Python** tab:
   ```
   rediss://default:[password]@[endpoint].upstash.io:6379
   ```

---

### Step 2: Deploy AI Agent Service on Render

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New +** -> **Web Service**.
3. Select your `ambientdesk-ai` repository.
4. Configure the service:
   * **Name**: `ambientdesk-ai-agent`
   * **Region**: Choose the same region as your database.
   * **Root Directory**: `services/ai-agent`
   * **Runtime**: `Python 3`
   * **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   * **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```
   * **Instance Type**: `Free`
5. Add **Environment Variables**:
   * `ENVIRONMENT`: `production`
   * `AI_AGENT_INTERNAL_TOKEN`: *(generate any random 32-character secret string)*
   * `GROQ_API_KEY`: *(your Groq API key)*
   * `GOOGLE_API_KEY`: *(your Google Gemini API key)*
   * `TAVILY_API_KEY`: *(your Tavily Search API key)*
   * `DATABASE_URL`: *(your Supabase connection URI from Step 1.1)*
6. Click **Deploy Web Service**.
7. Once deployed, copy your agent URL (e.g. `https://ambientdesk-ai-agent.onrender.com`).

---

### Step 3: Deploy Django Backend & Celery on Render

> [!NOTE]
> Render's Free tier doesn't provide separate background worker instances. We run Celery in the background of the Daphne web container concurrently so you never have to pay for a separate worker!

1. In Render, click **New +** -> **Web Service**.
2. Select your `ambientdesk-ai` repository.
3. Configure the service:
   * **Name**: `ambientdesk-backend`
   * **Region**: Same region as database.
   * **Root Directory**: `services/backend`
   * **Runtime**: `Python 3`
   * **Build Command**:
     ```bash
     pip install -r requirements.txt && python manage.py migrate --noinput && python manage.py collectstatic --noinput
     ```
   * **Start Command**:
     ```bash
     celery -A core worker -l info --concurrency=1 & daphne -b 0.0.0.0 -p $PORT core.asgi:application
     ```
   * **Instance Type**: `Free`
4. Add **Environment Variables**:
   * `DJANGO_SECRET_KEY`: *(generate a long 50+ character random string)*
   * `DJANGO_DEBUG`: `False`
   * `DJANGO_ALLOWED_HOSTS`: `*`
   * `DATABASE_URL`: *(your Supabase connection URI from Step 1.1)*
   * `REDIS_URL`: *(your Upstash Redis connection string from Step 1.2)*
   * `AI_AGENT_SERVICE_URL`: `https://ambientdesk-ai-agent.onrender.com` *(URL from Step 2)*
   * `AI_AGENT_INTERNAL_TOKEN`: *(same 32-char token set in Step 2)*
   * `CORS_ALLOWED_ORIGINS`: `https://your-frontend.vercel.app` *(update after Step 4)*
   * `DJANGO_CSRF_TRUSTED_ORIGINS`: `https://your-frontend.vercel.app` *(update after Step 4)*
5. Click **Deploy Web Service**.
6. Once deployed, copy your backend URL (e.g. `https://ambientdesk-backend.onrender.com`).

---

### Step 4: Deploy React Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New...** -> **Project**.
3. Import your `ambientdesk-ai` repository.
4. Configure project settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click *Edit* and select **`frontend`**.
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
5. Expand **Environment Variables** and add:
   * `VITE_API_URL`: `https://ambientdesk-backend.onrender.com/api`
   * `VITE_WS_URL`: `wss://ambientdesk-backend.onrender.com`
6. Click **Deploy**.
7. In ~1 minute, Vercel gives you your live URL (e.g. `https://ambientdesk-ai.vercel.app`).

---

### Step 5: Link CORS in Render Backend

Now that you have your live Vercel URL:
1. Open Render -> `ambientdesk-backend` -> **Environment**.
2. Update:
   * `CORS_ALLOWED_ORIGINS`: `https://ambientdesk-ai.vercel.app`
   * `DJANGO_CSRF_TRUSTED_ORIGINS`: `https://ambientdesk-ai.vercel.app`
3. Click **Save Changes** (Render will automatically redeploy in 30 seconds).

---

## 4. Free-Tier Optimizations & Tips

### Preventing Render Free Tier Sleep (Spin-Down)
Render's free tier puts web services to sleep after 15 minutes of inactivity. When a user visits after inactivity, it takes ~45 seconds to spin up.
* **Keep-Warm Solution**: Use a free uptime monitor like [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) to ping `https://ambientdesk-backend.onrender.com/api/tasks/` every 14 minutes. This keeps your free backend warm and instant 24/7!

### Creating a Superuser on Render
To log into Django Admin on your live deployment:
1. Open Render dashboard -> Click `ambientdesk-backend`.
2. Navigate to the **Shell** tab on the left menu.
3. Run:
   ```bash
   python manage.py createsuperuser
   ```
4. Enter your email and admin password. You can now access `https://ambientdesk-backend.onrender.com/admin/`.
