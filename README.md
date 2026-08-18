# ambientdesk-ai

A production-grade multi-agent system that triages, plans, and executes multiple user tasks concurrently with human-in-the-loop (HITL) approval and persistent memory.

## Architecture
- **AI Agent Service**: FastAPI + LangGraph + Groq / Gemini (with model-routing fallbacks)
- **API Backend**: Django + DRF + Django Channels + Celery
- **Data & Broker**: PostgreSQL (`pgvector`), Redis
- **Frontend**: React (Vite) + WebSocket streaming client

## Quick Start (Step 1 Dev Environment)
1. Clone the repository:
   ```bash
   git clone <repo-url> ambientdesk-ai
   cd ambientdesk-ai We need to burn for the current