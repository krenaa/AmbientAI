# AmbientDesk AI — Live Production Deployment Guide

This guide walks you through deploying **AmbientDesk AI** to a live production server.

---

## 1. Prerequisites & Environment Setup

### Production `.env` File
Create a `.env` file on your server (or in root directory) based on `.env.example`:

```bash
# --- AI Provider Keys ---
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
GOOGLE_API_KEY=AIza...
GOOGLE_MODEL=gemini-2.0-flash
TAVILY_API_KEY=tvly-...

# --- Observability ---
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=ambientdesk-prod

# --- Database & Cache ---
POSTGRES_DB=ambientdesk_db
POSTGRES_USER=ambientdesk_user
POSTGRES_PASSWORD=generate_a_secure_postgres_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
REDIS_URL=redis://redis:6379/0

# --- Service Communication ---
AI_AGENT_SERVICE_URL=http://ai-agent:8001
AI_AGENT_INTERNAL_TOKEN=generate_a_random_32_char_token

# --- Django Security (Production) ---
DJANGO_SECRET_KEY=generate_a_strong_50_character_secret_key
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com,localhost,backend
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 2. Deploying to Any Cloud VPS (DigitalOcean / Hetzner / AWS EC2 / Linode)

This is the recommended, cost-effective ($10–$20/mo) option that handles WebSockets smoothly without platform timeouts.

### Step 1: Install Docker & Docker Compose
On your Ubuntu/Debian server:
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

### Step 2: Clone Code & Configure
```bash
git clone <your-repo-url> ambientdesk-ai
cd ambientdesk-ai
cp .env.example .env
# Edit .env with your real API keys and secrets:
nano .env
```

### Step 3: Launch the Full Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 4: Verify Running Containers
```bash
docker compose -f docker-compose.prod.yml ps
```
You should see 7 running containers:
* `ambientdesk_postgres` (pgvector)
* `ambientdesk_redis` (message broker & channel layer)
* `ambientdesk_ai_agent` (FastAPI LangGraph engine)
* `ambientdesk_backend` (Django REST & Daphne ASGI)
* `ambientdesk_celery` (Background task worker)
* `ambientdesk_frontend` (Vite build served by Nginx)
* `ambientdesk_gateway` (Gateway reverse proxy on port 80)

### Step 5: (Optional) Setup Free SSL with Certbot
Install Certbot for automated HTTPS:
```bash
sudo apt install -y certbot python3-certbot-nginx
```
Configure your domain DNS A-record to point to your VPS IP, then run:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 3. Alternative: Deploying to Managed PaaS (Railway / Render)

If you prefer managed cloud platforms:

### Railway (One-Click)
1. **New Project** -> Deploy from GitHub repo.
2. Add **PostgreSQL** plugin (enable `pgvector` extension in database console).
3. Add **Redis** plugin.
4. Deploy the 3 services:
   * **AI Agent**: Root `/services/ai-agent`, start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * **Backend**: Root `/services/backend`, start command: `daphne -b 0.0.0.0 -p $PORT core.asgi:application`
   * **Celery**: Root `/services/backend`, start command: `celery -A core worker -l info`
   * **Frontend**: Root `/frontend`, build: `npm run build`, output: `dist/`

---

## 4. Operational Commands & Maintenance

### Check Logs in Real Time
```bash
# View backend logs
docker logs -f ambientdesk_backend

# View AI agent execution logs
docker logs -f ambientdesk_ai_agent

# View Celery task execution
docker logs -f ambientdesk_celery
```

### Create a Superuser
```bash
docker exec -it ambientdesk_backend python manage.py createsuperuser
```

### Update Code & Redeploy
```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```
