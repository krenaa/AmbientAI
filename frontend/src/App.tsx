import React, { useState, useEffect, useRef } from "react";
import {
  Bot,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  ShieldAlert,
  RefreshCw,
  Search,
  Database,
  Calculator,
  LogOut,
  ListTree,
  UserPlus,
  LogIn,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  Check,
  User,
  Activity,
  FileText,
  Mail,
  Lock,
} from "lucide-react";
import type { AgentTask, TaskStatus, UserProfile } from "./types";
import {
  login,
  register,
  logout,
  fetchTasks,
  createTask,
  approveTask,
  fetchCurrentUser,
} from "./api";

const getWebSocketUrl = (taskId: string): string => {
  if (import.meta.env.VITE_WS_URL) {
    return `${import.meta.env.VITE_WS_URL}/ws/tasks/${taskId}/`;
  }
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return `ws://localhost:8000/ws/tasks/${taskId}/`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/tasks/${taskId}/`;
};

const SUGGESTED_PROMPTS = [
  {
    category: "Research",
    icon: Search,
    text: "Research the latest advancements in small reasoning models for edge devices",
  },
  {
    category: "Calculation",
    icon: Calculator,
    text: "Calculate monthly burn rate: 450000 / 18 months with 8.5% annual inflation buffer",
  },
  {
    category: "Knowledge Base",
    icon: Database,
    text: "Retrieve company policy documents on AI agent tool authorization and HITL protocols",
  },
  {
    category: "Action (HITL)",
    icon: ShieldAlert,
    text: "Send external notification to devops-team about upcoming database maintenance window",
  },
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  const socketsRef = useRef<{ [taskId: string]: WebSocket }>({});

  useEffect(() => {
    localStorage.removeItem("ambient_token");
    const token = sessionStorage.getItem("ambient_token");
    const storedUser = sessionStorage.getItem("ambient_user");

    if (token) {
      setIsAuthenticated(true);
      if (storedUser) {
        try {
          setCurrentUser(JSON.parse(storedUser));
        } catch {
          // ignore
        }
      }
      loadCurrentUser();
      loadTasks();
    } else {
      setIsAuthenticated(false);
    }

    const handleSessionExpired = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setTasks([]);
      setSelectedTask(null);
      setAuthError("Your session expired. Please sign in again to continue.");

      Object.values(socketsRef.current).forEach((ws) => ws.close());
      socketsRef.current = {};
    };

    window.addEventListener("ambient_session_expired", handleSessionExpired);
    return () => {
      window.removeEventListener(
        "ambient_session_expired",
        handleSessionExpired
      );
      Object.values(socketsRef.current).forEach((ws) => ws.close());
    };
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
    } catch {
      // ignore
    }
  };

  const loadTasks = async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
      if (data.length > 0 && !selectedTask) {
        setSelectedTask(data[0]);
      }
      data.forEach((t) => {
        if (
          t.status === "pending" ||
          t.status === "processing" ||
          t.status === "awaiting_approval"
        ) {
          subscribeToTask(t.id);
        }
      });
    } catch (err: any) {
      if (err.response?.status !== 401) {
        console.error("Failed to load tasks", err);
      }
    }
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setTasks([]);
    setSelectedTask(null);
    setAuthError(null);
  };

  const subscribeToTask = (taskId: string) => {
    if (socketsRef.current[taskId]) return;
    const wsUrl = getWebSocketUrl(taskId);
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const res = JSON.parse(event.data);
        if (res.type === "task_update") {
          const updated = res.data;
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t))
          );
          setSelectedTask((prev) =>
            prev && prev.id === taskId ? { ...prev, ...updated } : prev
          );
        }
      } catch (e) {
        console.error("Error parsing WebSocket event", e);
      }
    };

    ws.onclose = () => {
      delete socketsRef.current[taskId];
    };

    socketsRef.current[taskId] = ws;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      let res;
      if (authMode === "register") {
        res = await register(email, password, fullName);
      } else {
        res = await login(email, password);
      }
      if (res.user) {
        setCurrentUser(res.user);
      }
      setIsAuthenticated(true);
      loadCurrentUser();
      loadTasks();
    } catch (err: any) {
      const detail =
        err.response?.data?.email?.[0] ||
        err.response?.data?.password?.[0] ||
        err.response?.data?.detail ||
        (authMode === "register"
          ? "Registration failed. Please check your credentials."
          : "Invalid email or password. Please try again.");
      setAuthError(detail);
    }
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const newTask = await createTask(prompt);
      setTasks((prev) => [newTask, ...prev]);
      setSelectedTask(newTask);
      setPrompt("");
      subscribeToTask(newTask.id);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        alert("Failed to dispatch task. Please verify server connection.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproval = async (taskId: string, approved: boolean) => {
    try {
      await approveTask(taskId, approved);
      loadTasks();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        alert("Approval action failed.");
      }
    }
  };

  const handleCopyOutput = () => {
    if (!selectedTask?.output) return;
    navigator.clipboard.writeText(selectedTask.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesQuery =
      task.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || task.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  // Authentication View
  if (!isAuthenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4 overflow-hidden selection:bg-emerald-500 selection:text-zinc-950">
        {/* Background Ambient Glows */}
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

        <div className="relative w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-zinc-950 shadow-lg shadow-emerald-500/20">
              <Bot className="h-7 w-7 stroke-[2.2]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              AmbientDesk AI
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Multi-Agent Orchestration Control Plane
            </p>
            <div className="mt-2.5 inline-flex items-center space-x-1.5 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>For Team Members & Workspace Admins</span>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-zinc-950/80 p-1 text-xs font-medium border border-zinc-800/80">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
              className={`flex items-center justify-center space-x-1.5 rounded-lg py-2 transition ${
                authMode === "login"
                  ? "bg-emerald-500 text-zinc-950 font-semibold shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
              className={`flex items-center justify-center space-x-1.5 rounded-lg py-2 transition ${
                authMode === "register"
                  ? "bg-emerald-500 text-zinc-950 font-semibold shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Create Account</span>
            </button>
          </div>

          {authError && (
            <div className="mb-5 flex items-start space-x-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Full Name
                </label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-10 pr-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-10 pr-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-10 pr-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:opacity-95 active:scale-[0.99]"
            >
              {authMode === "register"
                ? "Create Account & Sign In"
                : "Sign In to Workspace"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const renderCategoryIcon = (category?: string) => {
    switch (category) {
      case "web_search":
        return <Search className="h-4 w-4 text-sky-400" />;
      case "rag_retrieval":
        return <Database className="h-4 w-4 text-emerald-400" />;
      case "calculation":
        return <Calculator className="h-4 w-4 text-purple-400" />;
      case "sensitive_action":
        return <ShieldAlert className="h-4 w-4 text-amber-400" />;
      default:
        return <Bot className="h-4 w-4 text-zinc-400" />;
    }
  };

  const renderStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Completed</span>
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5 text-xs font-medium text-sky-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Executing</span>
          </span>
        );
      case "awaiting_approval":
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-400 animate-pulse">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Needs Approval</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-xs font-medium text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Queued</span>
          </span>
        );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-zinc-950 font-sans antialiased overflow-hidden">
      {/* Top Navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/70 bg-zinc-900/50 px-6 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 text-zinc-950 shadow-md shadow-emerald-500/20">
            <Bot className="h-5 w-5 stroke-[2.2]" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-zinc-100">
              AmbientDesk AI
            </span>
            <span className="ml-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              v2.0 Orchestrator
            </span>
          </div>
        </div>

        {/* Engine Operational Pill */}
        <div className="hidden md:flex items-center space-x-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-400">
          <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
          <span>Multi-Agent Engine Online</span>
        </div>

        {/* User Profile & Actions */}
        <div className="flex items-center space-x-3">
          {currentUser && (
            <div className="flex items-center space-x-2 border-r border-zinc-800/80 pr-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200 border border-zinc-700">
                {currentUser.full_name
                  ? currentUser.full_name[0].toUpperCase()
                  : currentUser.email[0].toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium text-zinc-200 leading-none">
                  {currentUser.full_name || currentUser.email.split("@")[0]}
                </p>
                <div className="mt-0.5 flex items-center space-x-1">
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${
                      currentUser.role === "Admin"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={loadTasks}
            title="Refresh Tasks"
            className="flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="flex items-center space-x-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Task Navigator */}
        <aside className="flex w-84 md:w-96 flex-col border-r border-zinc-800/70 bg-zinc-900/30 backdrop-blur-sm">
          {/* Search and Filters Header */}
          <div className="border-b border-zinc-800/60 p-3.5 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tasks by query or ID..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex space-x-1 overflow-x-auto text-[11px] font-medium text-zinc-400 scrollbar-none">
              {[
                { id: "all", label: "All" },
                { id: "processing", label: "Executing" },
                { id: "awaiting_approval", label: "Approval" },
                { id: "completed", label: "Done" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 whitespace-nowrap transition ${
                    statusFilter === tab.id
                      ? "bg-zinc-800 text-zinc-100 font-semibold"
                      : "hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="py-16 text-center text-xs text-zinc-500">
                <FileText className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
                <span>No tasks match your filter.</span>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`group relative cursor-pointer rounded-xl border p-3.5 transition-all ${
                    selectedTask?.id === task.id
                      ? "border-emerald-500/50 bg-zinc-900/90 shadow-md shadow-emerald-500/5"
                      : "border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <div className="rounded-md bg-zinc-900 p-1 border border-zinc-800">
                        {renderCategoryIcon(task.triage_category)}
                      </div>
                      <span className="text-xs font-semibold capitalize text-zinc-200">
                        {task.triage_category?.replace("_", " ") || "General Agent"}
                      </span>
                    </div>
                    {renderStatusBadge(task.status)}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-300 leading-relaxed">
                    {task.prompt}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                    <span>{new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {task.execution_time_ms > 0 && (
                      <span>{(task.execution_time_ms / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right Canvas: Task Inspector & Workspace */}
        <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            {selectedTask ? (
              <div className="mx-auto max-w-4xl space-y-6">
                {/* Task Title & Meta Bar */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                          User Prompt
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-xs text-zinc-500 font-mono">
                          ID: {selectedTask.id}
                        </span>
                      </div>
                      <h2 className="text-base md:text-lg font-semibold text-zinc-100 leading-snug">
                        {selectedTask.prompt}
                      </h2>
                    </div>
                    <div className="shrink-0">{renderStatusBadge(selectedTask.status)}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-800/60 pt-3 text-xs text-zinc-400">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="h-3.5 w-3.5 text-zinc-500" />
                      <span>
                        Created: {new Date(selectedTask.created_at).toLocaleString()}
                      </span>
                    </div>
                    {selectedTask.execution_time_ms > 0 && (
                      <>
                        <span className="text-zinc-700">•</span>
                        <div className="flex items-center space-x-1.5">
                          <Activity className="h-3.5 w-3.5 text-zinc-500" />
                          <span>
                            Latency:{" "}
                            {(selectedTask.execution_time_ms / 1000).toFixed(2)}s
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* HITL Card (Awaiting Approval) */}
                {selectedTask.status === "awaiting_approval" && (
                  <div className="relative overflow-hidden rounded-2xl border border-amber-500/50 bg-gradient-to-b from-amber-500/15 to-amber-500/5 p-6 shadow-xl shadow-amber-500/5">
                    <div className="flex items-center space-x-3 text-amber-400">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold tracking-tight">
                          Human Authorization Required
                        </h3>
                        <p className="text-xs text-amber-300/80">
                          A sensitive action has been paused waiting for your confirmation.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-zinc-950/60 p-4 text-xs font-mono text-amber-200 leading-relaxed">
                      {selectedTask.approval_prompt ||
                        "Action payload pending review: Proceed with executing external side-effect."}
                    </div>

                    <div className="mt-5 flex items-center space-x-3">
                      <button
                        onClick={() => handleApproval(selectedTask.id, true)}
                        className="flex items-center space-x-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 active:scale-[0.98] transition shadow-md shadow-emerald-500/20"
                      >
                        <Check className="h-4 w-4 stroke-[2.5]" />
                        <span>Confirm & Execute Action</span>
                      </button>
                      <button
                        onClick={() => handleApproval(selectedTask.id, false)}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 active:scale-[0.98] transition"
                      >
                        Reject Action
                      </button>
                    </div>
                  </div>
                )}

                {/* Execution Pipeline & Agent Thought Timeline */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-zinc-200">
                      <ListTree className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Agent Orchestration Steps
                      </span>
                    </div>
                    <button
                      onClick={() => setShowLogs(!showLogs)}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
                    >
                      {showLogs ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {showLogs && (
                    <div className="mt-4 space-y-3">
                      {selectedTask.status === "processing" && (
                        <div className="flex items-center space-x-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs text-sky-300">
                          <Loader2 className="h-4 w-4 animate-spin text-sky-400 shrink-0" />
                          <span>Graph execution active: Processing nodes and reasoning...</span>
                        </div>
                      )}

                      {selectedTask.triage_category && (
                        <div className="flex items-center space-x-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
                          <div className="rounded-lg bg-zinc-900 p-1.5 border border-zinc-800">
                            {renderCategoryIcon(selectedTask.triage_category)}
                          </div>
                          <div className="flex-1">
                            <span className="font-semibold text-zinc-300">Triage Specialist:</span>{" "}
                            <span className="text-zinc-400">Classified intent as</span>{" "}
                            <span className="font-medium text-emerald-400 capitalize">
                              {selectedTask.triage_category.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                      )}

                      {selectedTask.logs && selectedTask.logs.length > 0 ? (
                        selectedTask.logs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-zinc-400">
                              <span className="font-mono font-bold text-emerald-400 uppercase tracking-wide">
                                [{log.node_name}]
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-zinc-300 leading-relaxed">{log.message}</p>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <pre className="mt-2 rounded-lg bg-zinc-900/90 p-2 text-[11px] text-zinc-400 font-mono overflow-x-auto border border-zinc-800/60">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))
                      ) : (
                        !selectedTask.triage_category &&
                        selectedTask.status !== "processing" && (
                          <p className="text-xs text-zinc-500">
                            No discrete node events captured for this run.
                          </p>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Synthesis Output Card */}
                {selectedTask.output && (
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          Agent Synthesis Output
                        </span>
                      </div>
                      <button
                        onClick={handleCopyOutput}
                        className="flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Output</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-5 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap font-sans">
                      {selectedTask.output}
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {selectedTask.status === "failed" && selectedTask.error_message && (
                  <div className="flex items-start space-x-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-xs text-rose-300">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <h4 className="font-semibold text-rose-200">Execution Error</h4>
                      <p className="mt-1 leading-relaxed">{selectedTask.error_message}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Hero Empty State */
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 text-emerald-400 border border-emerald-500/20">
                  <Bot className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-zinc-100">
                  AmbientDesk Multi-Agent Workspace
                </h3>
                <p className="mt-2 max-w-md text-xs text-zinc-400 leading-relaxed">
                  Dispatch tasks across Web Search, RAG Document Retrieval, Safe
                  Mathematical Calculations, or Sensitive HITL Operations.
                </p>

                {/* Prompt Suggestions Grid */}
                <div className="mt-8 grid w-full grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {SUGGESTED_PROMPTS.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => setPrompt(item.text)}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 text-xs transition hover:border-emerald-500/40 hover:bg-zinc-900/80"
                      >
                        <div className="flex items-center space-x-2 text-emerald-400 mb-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="font-semibold text-[11px] uppercase tracking-wider">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-zinc-300 line-clamp-2 leading-relaxed">
                          {item.text}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Floating Dispatch Input Dock */}
          <div className="border-t border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-md">
            <div className="mx-auto max-w-4xl">
              <form onSubmit={handleSubmitTask} className="relative flex items-center">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask AmbientDesk to research, query docs, calculate, or execute tasks..."
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/90 px-5 py-3.5 pr-28 text-sm text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition shadow-inner"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !prompt.trim()}
                  className="absolute right-2 flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2 text-xs font-bold text-zinc-950 transition hover:opacity-95 disabled:opacity-40 active:scale-[0.98] shadow-md shadow-emerald-500/20"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>Dispatch</span>
                </button>
              </form>
              <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-zinc-500">
                <span>Autonomous LangGraph State Machine</span>
                <span>Press Enter to dispatch agent</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
