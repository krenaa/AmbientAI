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
  Calculator
} from "lucide-react";
import type { AgentTask, TaskStatus } from "./types";
import { login, fetchTasks, createTask, approveTask } from "./api";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [email, setEmail] = useState("admin@gmail.com");
  const [password, setPassword] = useState("admin@123");
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const socketsRef = useRef<{ [taskId: string]: WebSocket }>({});

  useEffect(() => {
    const token = localStorage.getItem("ambient_token");
    if (token) {
      setIsAuthenticated(true);
      loadTasks();
    }
  }, []);

  const loadTasks = async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
      if (data.length > 0 && !selectedTask) {
        setSelectedTask(data[0]);
      }
      data.forEach((t) => {
        if (t.status === "pending" || t.status === "processing" || t.status === "awaiting_approval") {
          subscribeToTask(t.id);
        }
      });
    } catch (err) {
      console.error("Failed to load tasks", err);
    }
  };

  const subscribeToTask = (taskId: string) => {
    if (socketsRef.current[taskId]) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/tasks/${taskId}/`);
    ws.onmessage = (event) => {
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
    };
    ws.onclose = () => {
      delete socketsRef.current[taskId];
    };
    socketsRef.current[taskId] = ws;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      setIsAuthenticated(true);
      loadTasks();
    } catch {
      alert("Invalid credentials. Verify your Django superuser credentials.");
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
    } catch (err) {
      console.error(err);
      alert("Failed to submit task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproval = async (taskId: string, approved: boolean) => {
    try {
      await approveTask(taskId, approved);
      loadTasks();
    } catch (err) {
      console.error(err);
      alert("Approval action failed.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Bot className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">AmbientDesk AI</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Sign In to Agent Control
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
          <span className="flex items-center space-x-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Completed</span>
          </span>
        );
      case "processing":
        return (
          <span className="flex items-center space-x-1.5 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Executing</span>
          </span>
        );
      case "awaiting_approval":
        return (
          <span className="flex items-center space-x-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Needs Approval</span>
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center space-x-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Queued</span>
          </span>
        );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex h-14 items-center justify-between border-b border-zinc-800/80 px-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Bot className="h-5 w-5" />
          </div>
          <span className="font-semibold text-zinc-100">AmbientDesk AI</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">Multi-Task Agentic Suite</span>
        </div>
        <button
          onClick={loadTasks}
          className="flex items-center space-x-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-96 flex-col border-r border-zinc-800/80 bg-zinc-900/30">
          <div className="border-b border-zinc-800/60 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Tasks in Progress & History ({tasks.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {tasks.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">No tasks created yet.</div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`cursor-pointer rounded-lg border p-3.5 transition ${
                    selectedTask?.id === task.id
                      ? "border-emerald-500/40 bg-zinc-900"
                      : "border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      {renderCategoryIcon(task.triage_category)}
                      <span className="text-xs font-medium capitalize text-zinc-300">
                        {task.triage_category?.replace("_", " ") || "General Agent"}
                      </span>
                    </div>
                    {renderStatusBadge(task.status)}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-300">{task.prompt}</p>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
          <div className="flex-1 overflow-y-auto p-6">
            {selectedTask ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">{selectedTask.prompt}</h2>
                    <div className="mt-1 flex items-center space-x-3 text-xs text-zinc-400">
                      <span>ID: {selectedTask.id}</span>
                      {selectedTask.execution_time_ms > 0 && (
                        <span>Latency: {(selectedTask.execution_time_ms / 1000).toFixed(2)}s</span>
                      )}
                    </div>
                  </div>
                  {renderStatusBadge(selectedTask.status)}
                </div>

                {selectedTask.status === "awaiting_approval" && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                    <div className="flex items-center space-x-2 text-amber-400">
                      <ShieldAlert className="h-5 w-5" />
                      <h3 className="text-sm font-semibold">Human Approval Required</h3>
                    </div>
                    <p className="mt-2 text-xs text-amber-200/90">
                      {selectedTask.approval_prompt ||
                        "The agent requires authorization to execute a sensitive action."}
                    </p>
                    <div className="mt-4 flex space-x-3">
                      <button
                        onClick={() => handleApproval(selectedTask.id, true)}
                        className="rounded bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                      >
                        Approve & Resume
                      </button>
                      <button
                        onClick={() => handleApproval(selectedTask.id, false)}
                        className="rounded bg-rose-500/20 px-4 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30"
                      >
                        Reject Action
                      </button>
                    </div>
                  </div>
                )}

                {selectedTask.output && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Agent Synthesis Output
                    </span>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                      {selectedTask.output}
                    </div>
                  </div>
                )}

                {selectedTask.error_message && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
                    {selectedTask.error_message}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div className="space-y-2">
                  <Bot className="mx-auto h-8 w-8 text-zinc-600" />
                  <p className="text-sm text-zinc-400">Select a task or submit a prompt below to dispatch an agent.</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800/80 bg-zinc-900/40 p-4">
            <form onSubmit={handleSubmitTask} className="relative flex items-center">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask AmbientDesk to research, query docs, calculate, or execute tasks..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 pr-24 text-sm text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSubmitting || !prompt.trim()}
                className="absolute right-2 flex items-center space-x-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Dispatch</span>
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}