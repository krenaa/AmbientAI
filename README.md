# AmbientDesk AI 🌐🤖

<div align="center">

![AmbientDesk AI Banner](docs/images/banner.jpg)

### **Autonomous Multi-Agent AI Workspace with Human-in-the-Loop (HITL) Guardrails, pgvector RAG & Real-Time Streaming**

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-StateGraph-FF6F00.svg?logo=langchain&logoColor=white)](https://github.com/langchain-ai/langgraph)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL pgvector](https://img.shields.io/badge/PostgreSQL-pgvector-336791.svg?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🚀 **Live Production App:** [https://ambient-ai-steel.vercel.app/](https://ambient-ai-steel.vercel.app/) • ⚙️ **Render Backend API:** [https://ambientdesk-backend.onrender.com/](https://ambientdesk-backend.onrender.com/)

[Quick Start](#-quick-start-native-execution) • [Key Features](#-key-features) • [System Architecture](#-system-architecture) • [Showcase Prompts](#-showcase-prompts-to-test-the-system) • [Deployment Guide](DEPLOYMENT.md)

</div>

---

## 📌 Overview

**AmbientDesk AI** is an enterprise-grade multimodal desktop intelligence workspace engineered to route, research, index, and execute multi-step tasks autonomously while keeping humans securely in the loop with **Human-in-the-Loop (HITL)** approvals.

Built on an asynchronous **FastAPI + LangGraph** backend with a high-contrast warm-sand **React 19 + TypeScript** studio:
1. **Smart Autonomous Intent Routing**: Automatically classifies queries into direct responses, live web search grounding, internal document search (`pgvector`), or sensitive operations.
2. **Human-in-the-Loop (HITL) Guardrails**: Automatically pauses prior to state-changing or sensitive actions (sending notifications, altering database states) to request explicit human approval.
3. **Resilient Multi-Model Fallbacks**: Chained inference using **Groq** (`llama-3.1-8b-instant`) with automatic fallback to **Google Gemini** (`gemini-2.5-flash-lite`, `gemini-2.5-flash`).
4. **Real-Time Streaming & Telemetry**: Native WebSockets stream live thinking indicators, tool execution steps, and tokens with an interactive **Stop Generation** control.
5. **Rich Markdown & Structured Tables**: Auto-formats comparisons, equations, and chronologies into clean tables, highlighted keyword pills (`code`), and callout cards.
6. **Live Execution Analytics**: Dynamic profile dashboard tracking real-time tasks, compute time in seconds, vector database chunks, and active sessions.

---

## 📸 Application Interface & Visual Walkthrough

### 1. Interactive Workspace & Rich Markdown Output
<div align="center">

![Interactive Workspace Home Screen](docs/images/home_screen.png)
*Clean modern chat interface with real-time streaming, GitHub-flavored Markdown tables, highlighted key terms, and the interactive Stop generation button.*

</div>

---

### 2. Human-in-the-Loop (HITL) Security Guardrails
<div align="center">

![Human in the Loop Approval Card](docs/images/hitl.png)

![Human in the Loop Approval Popup Dialog](docs/images/hitl_popup.png)
*When sensitive operations are detected, execution pauses and requests supervisor review via Approve (`✓`) or Reject (`✗`) buttons before executing.*

</div>

---

### 3. Knowledge Base & PDF RAG Ingestion (High Contrast)
<div align="center">

![Knowledge Base PDF Ingestion](docs/images/rag_pdf_upload.png)

![Document Indexed Successfully](docs/images/rag_pdf_indexed.png)
*Drag-and-drop PDF ingestion modal with high-contrast text, automated text chunking, and 768-dim vector embeddings persisted in Neon PostgreSQL.*

</div>

---

### 4. pgvector Semantic Search & Document Retrieval
<div align="center">

![Vector Semantic Search Trace](docs/images/rag_search_trace.png)
*Live cosine similarity search across indexed documents with source attribution and chunk extraction.*

</div>

---

### 5. Live Web Grounding & Multi-Source Research
<div align="center">

![Live Web Search and Telemetry Trace](docs/images/web_search_trace.png)
*Real-time web search synthesis displaying live news, timestamps, source attribution, and structured insights.*

</div>

---

### 6. Real-Time Profile Overview & Execution Analytics
<div align="center">

![Real-Time Profile Overview](docs/images/profile_overview.png)
*Live execution metrics calculating total executions, completed tasks, compute duration, vector chunks, and session history directly from PostgreSQL.*

</div>

---

### 7. Mobile-Optimized Responsive Workspace
<div align="center">

![Mobile Workspace View](docs/images/mobile_view.png)
*Fully responsive mobile layout featuring AmbientAI squircle branding and quick drawer navigation.*

</div>


---

## 🚀 Key Features

| Capability | Technical Implementation | Benefit |
| :--- | :--- | :--- |
| **Stateful Multi-Agent Graph** | LangGraph `StateGraph` + `MemorySaver` checkpointer | Multi-turn reasoning with conversational memory and pause/resume execution |
| **Human-In-The-Loop (HITL)** | LangGraph `interrupt()` + FastAPI approval endpoint | Halts sensitive operations until confirmed by the user |
| **Resilient Model Routing** | Fallback chaining: Groq Llama ➔ Google Gemini 2.5 / 3.6 | Zero downtime against LLM rate limits or API outages |
| **pgvector Semantic RAG** | PostgreSQL `pgvector` extension + LangChain VectorStore | High-speed semantic search on internal documentation |
| **Live Web Intelligence** | Tavily Search API with automated content cleaning | Real-time factual queries with citations and source URL attribution |
| **Defensive Tool Guardrails** | Regex email validation + AST Math parser | Eliminates malformed inputs, unsafe `eval()`, and prompt injection risks |
| **Live Telemetry & Logs** | Native FastAPI WebSockets (`/ws/tasks/{id}/`) | Sub-second step-by-step UI updates showing which tool is actively running |

---

## 🏗 System Architecture

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Layer (React 19 + TypeScript + Vite)"]
        UI["React Dashboard (:5173)"]
        WSClient["Native WebSocket Client"]
        HITLModal["HITL Approval Modal"]
    end

    subgraph BackendLayer ["Unified Async Backend (FastAPI + LangGraph)"]
        FastAPIServer["FastAPI Server (:8000)"]
        AuthRouter["JWT Auth & User Management"]
        TaskRouter["Task Dispatch & HITL Approvals"]
        WSManager["WebSocket Connection Manager"]
        StateGraph["LangGraph State Machine Engine"]
        MemorySaver["State Checkpointer"]
    end

    subgraph ToolSuite ["Defensive Tool Suite"]
        TavilyTool["Tavily Web Search"]
        RAGTool["pgvector Semantic RAG"]
        MathTool["Sandboxed AST Math Evaluator"]
        EmailTool["SMTP Email Dispatcher"]
        InboxTool["Enterprise Inbox Auditor"]
    end

    subgraph ExternalLLM ["Resilient Model Routing"]
        Groq["Groq (Llama-3.1-8b-instant)"]
        Gemini["Google Gemini (gemini-2.5-flash)"]
    end

    subgraph DataBroker ["Storage & Persistence"]
        Postgres[("PostgreSQL 16 + pgvector (Local / Supabase / Neon)")]
    end

    UI <-->|HTTP REST / JSON| FastAPIServer
    WSClient <-->|WebSocket Stream /ws/tasks/:id/| WSManager
    FastAPIServer --> AuthRouter
    FastAPIServer --> TaskRouter
    TaskRouter --> StateGraph
    StateGraph <--> MemorySaver
    StateGraph --> ToolSuite
    StateGraph --> ExternalLLM
    ExternalLLM --> Groq
    Groq -. Fallback .-> Gemini
    AuthRouter --> Postgres
    TaskRouter --> Postgres
    ToolSuite --> Postgres
```

---

## 🔄 Execution Flow

```mermaid
stateDiagram-v2
    [*] --> TriageNode: User Query Received

    state TriageNode {
        [*] --> ClassifyIntent
        ClassifyIntent --> DirectAnswer: Read-only query / chit-chat
        ClassifyIntent --> Research: Needs web / RAG facts
        ClassifyIntent --> MathCalc: Needs deterministic evaluation
        ClassifyIntent --> SensitiveAction: State-changing action (Email / Alert)
    }

    TriageNode --> ApprovalNode: If is_sensitive == True
    TriageNode --> AgentNode: If is_sensitive == False

    state ApprovalNode {
        [*] --> InterruptWait: interrupt() Triggered
        InterruptWait --> ResumedState: Supervisor Approves / Rejects
    }

    ApprovalNode --> AgentNode: Dispatches status ("approved" | "rejected")

    state AgentNode {
        [*] --> InvokeLLM
        InvokeLLM --> ToolCallNeeded: Has tool_calls
        InvokeLLM --> FinalSynthesis: No tool_calls
    }

    AgentNode --> ToolExecutionNode: Routes to Tools
    ToolExecutionNode --> AgentNode: Passes Tool Output to LLM
    AgentNode --> [*]: Return Final Response to User
```

---

## 🎯 Showcase Prompts to Test the System

Use these prompts in the interface to test and demonstrate AmbientDesk AI:

### 1. 🛡️ Human-In-The-Loop (HITL) Guardrail & Approval
> **Prompt:**
> ```text
> Send an email notification to operations@ambientdesk.ai with subject 'Quarterly Infrastructure Audit' and body 'All cloud security policies and access controls verified successfully.'
> ```
> * **What it demonstrates:** Classifies state-changing actions, triggers LangGraph `interrupt()`, renders the interactive approval modal, and pauses execution until approved by the user.

---

### 2. 🌐 Live Web Search & Multi-Source Research
> **Prompt:**
> ```text
> Search the live web for: 3 latest breakthroughs in AI agents and summarize them.
> ```
> * **What it demonstrates:** Dynamic tool execution (`web_search`), live article parsing, source citation links, and real-time step telemetry.

---

### 3. 📂 Enterprise Knowledge Retrieval (pgvector RAG)
> **Prompt:**
> ```text
> What is our company policy on expense reimbursements and travel allowances?
> ```
> * **What it demonstrates:** Queries PostgreSQL `pgvector` similarity search to extract relevant internal policy clauses.

---

### 4. 🚨 Defensive Email Validation Guardrail
> **Prompt:**
> ```text
> Send the quarterly performance metrics report to team@#invalid_domain.com immediately.
> ```
> * **What it demonstrates:** RFC-compliant regex validator detects invalid email formats, prevents faulty network calls, and asks for clarification.

---

### 5. 🧮 Deterministic AST Math Calculation
> **Prompt:**
> ```text
> Calculate compound growth for principal $20,000 at 7.5% annual rate over 5 years using formula 20000 * (1 + 0.075)**5
> ```
> * **What it demonstrates:** Eliminates LLM calculation errors by delegating formulas to a safe Python Abstract Syntax Tree (`ast.parse`) math evaluator.

---

## ⚡ Quick Start (Native Execution)

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL database (Local or free cloud database like [Supabase](https://supabase.com) / [Neon](https://neon.tech))
- Groq API Key ([Get Groq Key](https://console.groq.com/)) or Google Gemini Key ([Get Gemini Key](https://aistudio.google.com/))
- (Optional) Tavily API Key ([Get Tavily Key](https://tavily.com/))

### 1. Clone & Configure Environment
```bash
git clone https://github.com/krenaa/AmbientAI.git
cd AmbientAI
cp .env.example .env
```
Edit `.env` with your API keys and PostgreSQL connection string.

---

### 2. Run the FastAPI Backend
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
*The FastAPI backend will automatically verify and initialize database tables and the `pgvector` extension at `http://localhost:8000`.*

---

### 3. Run the React Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

## 📡 API Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register new user account | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT token | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Yes |
| `GET` | `/api/tasks` | List all user tasks with status | Yes |
| `POST` | `/api/tasks/create` | Dispatch a new task to LangGraph | Yes |
| `POST` | `/api/tasks/{id}/approve` | Approve or reject a paused HITL action | Yes |
| `GET` | `/api/health` | Service health check | No |

---

## 📂 Project Structure

```text
ambientdesk-ai/
├── docs/                              # Screenshots & architecture previews
│   └── images/                        # UI screenshots (home_screen, hitl, etc.)
├── backend/                           # Unified FastAPI Backend
│   ├── app/
│   │   ├── agent/                     # LangGraph Multi-Agent Engine
│   │   │   ├── graph.py               # StateGraph & Node Definitions
│   │   │   ├── llm.py                 # Multi-Model Resilient Fallback Factory
│   │   │   ├── state.py               # AgentState & Pydantic Schemas
│   │   │   ├── tools.py               # Tavily, pgvector RAG, AST Math, Email Tools
│   │   │   └── vector_store.py        # pgvector Embeddings & Search
│   │   ├── api/                       # API Endpoints
│   │   │   ├── auth.py                # JWT Auth & Profile Routes
│   │   │   ├── tasks.py               # Task Creation & HITL Approval Routes
│   │   │   └── websockets.py          # Native Async WebSocket Streaming
│   │   ├── core/                      # Core Infrastructure
│   │   │   ├── database.py            # Async SQLAlchemy Engine & Session
│   │   │   └── security.py            # Password Hashing & JWT Verification
│   │   ├── models/                    # SQLAlchemy Database Models (User, Task, Log)
│   │   ├── schemas/                   # Pydantic Request/Response Schemas
│   │   ├── websocket_manager.py       # Live WebSocket Hub
│   │   ├── config.py                  # Pydantic Settings
│   │   └── main.py                    # FastAPI Entrypoint & Lifecycle
│   └── requirements.txt               # Backend Dependencies
├── frontend/                          # React 19 + TypeScript + Vite Client
│   ├── src/
│   │   ├── App.tsx                    # Main Dashboard & Live Stream View
│   │   ├── api.ts                     # Typed REST Client
│   │   ├── types.ts                   # TypeScript Interfaces
│   │   └── MarkdownRenderer.tsx       # Syntax Highlighted Output
│   └── package.json
├── run_backend.py                     # Convenience Root Runner
├── .env.example                       # Cleaned Environment Template
├── DEPLOYMENT.md                      # Production Deployment Guide
└── README.md                          # Project Documentation
```

---

## 🤝 Contributing

Contributions, feedback, and issue reports are warmly welcome!
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/awesome-agent`)
3. Commit your changes (`git commit -m 'Add awesome agent capability'`)
4. Push to the branch (`git push origin feature/awesome-agent`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">

Built with ❤️ by **Krena** • Powered by **LangGraph**, **Groq**, **Gemini**, and **FastAPI**

</div>