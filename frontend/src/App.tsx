import React, { useState, useEffect, useRef } from "react";
import {
  Bot,
  Send,
  AlertCircle,
  Clock,
  Loader2,
  ShieldAlert,
  RefreshCw,
  Search,
  Database,
  Calculator,
  LogOut,
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
  X,
  Settings,
  ShieldCheck,
  Cpu,
  KeyRound,
  Plus,
  Menu,
} from "lucide-react";
import type { AgentTask, UserProfile } from "./types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useToast } from "./Toast";
import {
  login,
  register,
  logout,
  fetchTasks,
  createTask,
  approveTask,
  fetchCurrentUser,
  updateProfile,
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
    category: "Chained Workflow",
    icon: Mail,
    text: "Research top 3 AI agent security best practices and email an executive brief to dev-lead@ambientdesk.ai",
  },
  {
    category: "Guardrail Test",
    icon: ShieldAlert,
    text: "Send the quarterly system health report to fenil@#gmail.com",
  },
  {
    category: "Inbox Triage & RAG",
    icon: Database,
    text: "Check recent incoming emails for client compliance questions and cross-reference our knowledge base to draft a reply",
  },
  {
    category: "Deterministic Math",
    icon: Calculator,
    text: "Calculate monthly burn rate: 450000 / 18 months with 8.5% annual inflation buffer",
  },
  {
    category: "HITL Action",
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
  const [isNewChat, setIsNewChat] = useState<boolean>(false);
  const isNewChatRef = useRef<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [showEarlierTurns, setShowEarlierTurns] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);
  const [outputColorTheme, setOutputColorTheme] = useState<"auto" | "cyan" | "violet" | "amber" | "rose" | "emerald">(() => {
    return (localStorage.getItem("ambient_output_theme") as any) || "auto";
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const { showToast } = useToast();

  const startNewChat = () => {
    isNewChatRef.current = true;
    setIsNewChat(true);
    setSelectedTask(null);
    setPrompt("");
    setShowEarlierTurns(false);
    setIsMobileMenuOpen(false);
    showToast("New chat session started", "info");
  };

  const selectTask = (task: AgentTask) => {
    isNewChatRef.current = false;
    setIsNewChat(false);
    setSelectedTask(task);
    setShowEarlierTurns(false);
    setIsMobileMenuOpen(false);
  };

  // Profile Modal State
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [profileTab, setProfileTab] = useState<"overview" | "edit" | "security">("overview");
  const [profileNameInput, setProfileNameInput] = useState<string>("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>("");
  const [newPasswordInput, setNewPasswordInput] = useState<string>("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  const socketsRef = useRef<{ [taskId: string]: WebSocket }>({});

  useEffect(() => {
    localStorage.removeItem("ambient_token");
    const token = sessionStorage.getItem("ambient_token");
    const storedUser = sessionStorage.getItem("ambient_user");

    if (token) {
      setIsAuthenticated(true);
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setCurrentUser(parsed);
          setProfileNameInput(parsed.full_name || "");
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
      setIsProfileOpen(false);
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
      setProfileNameInput(user.full_name || "");
    } catch {
      // ignore
    }
  };

  const loadTasks = async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
      setSelectedTask((current) => {
        if (isNewChatRef.current) return null;
        if (!current) return data[0] || null;
        const match = data.find((t) => t.id === current.id);
        return match || current;
      });
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

  // Smart polling fallback: refresh every 1.5s whenever any task is actively running
  useEffect(() => {
    if (!isAuthenticated) return;
    const hasActiveTask = tasks.some(
      (t) => t.status === "pending" || t.status === "processing"
    );
    if (!hasActiveTask) return;

    const interval = setInterval(() => {
      loadTasks();
    }, 1500);

    return () => clearInterval(interval);
  }, [isAuthenticated, tasks]);

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setTasks([]);
    setSelectedTask(null);
    isNewChatRef.current = false;
    setIsNewChat(false);
    setIsProfileOpen(false);
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
          // Instant state & logs refresh upon milestone or completion
          if (
            updated.status === "completed" ||
            updated.status === "awaiting_approval" ||
            updated.status === "failed"
          ) {
            loadTasks();
            loadCurrentUser();
          }
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
        setProfileNameInput(res.user.full_name || "");
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
    const submittedPrompt = prompt.trim();
    setIsSubmitting(true);
    try {
      // If user is currently viewing a task and has NOT clicked Start New Chat, continue this thread!
      const isContinuing = !isNewChatRef.current && selectedTask !== null;
      const targetTaskId = isContinuing ? selectedTask.id : undefined;

      if (isContinuing) {
        showToast("Follow-up sent to agent", "info");
      } else {
        showToast("Task dispatched to agent", "info");
      }

      const taskResult = await createTask(submittedPrompt, targetTaskId);

      if (targetTaskId) {
        setTasks((prev) =>
          prev.map((t) => (t.id === targetTaskId ? taskResult : t))
        );
        setSelectedTask(taskResult);
      } else {
        setTasks((prev) => [taskResult, ...prev]);
        setSelectedTask(taskResult);
        isNewChatRef.current = false;
        setIsNewChat(false);
      }

      setPrompt("");
      subscribeToTask(taskResult.id);
      loadCurrentUser();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        showToast("Failed to dispatch task. Please verify connection.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproval = async (taskId: string, approved: boolean) => {
    if (isApproving) return;
    setIsApproving(true);
    try {
      await approveTask(taskId, approved);
      showToast(
        approved ? "Action confirmed and executing" : "Action rejected",
        approved ? "success" : "info"
      );
      // Immediately reflect optimistic state
      setSelectedTask((prev) =>
        prev && prev.id === taskId
          ? {
              ...prev,
              status: approved ? "processing" : "completed",
              approval_prompt: null,
            }
          : prev
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: approved ? "processing" : "completed",
                approval_prompt: null,
              }
            : t
        )
      );
      await loadTasks();
      loadCurrentUser();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        const detail =
          err.response?.data?.detail ||
          "Approval action could not be completed. The task may have already progressed.";
        showToast(detail, "error");
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleCopyOutput = () => {
    if (!selectedTask?.output) return;
    const rawOutputTurns = selectedTask.output
      .split(/(?:\r?\n\s*)*\[Follow-up\]:\s*/)
      .map((t) => t.trim())
      .filter(Boolean);
    const textToCopy = rawOutputTurns[rawOutputTurns.length - 1] || selectedTask.output;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    showToast("Response copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenProfile = () => {
    setProfileNameInput(currentUser?.full_name || "");
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setIsProfileOpen(true);
    loadCurrentUser();
  };

  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileNameInput.trim()) return;
    setIsUpdatingProfile(true);
    try {
      const updated = await updateProfile({ full_name: profileNameInput.trim() });
      setCurrentUser(updated);
      showToast("Profile name updated successfully!", "success");
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Failed to update profile name.";
      showToast(errorMsg, "error");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordInput !== confirmPasswordInput) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (newPasswordInput.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }
    setIsUpdatingProfile(true);
    try {
      await updateProfile({
        current_password: currentPasswordInput,
        new_password: newPasswordInput,
      });
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      showToast("Password changed successfully!", "success");
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Failed to change password.";
      showToast(errorMsg, "error");
    } finally {
      setIsUpdatingProfile(false);
    }
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
        return <Database className="h-4 w-4 text-purple-400" />;
      case "calculation":
        return <Calculator className="h-4 w-4 text-pink-400" />;
      case "sensitive_action":
        return <ShieldAlert className="h-4 w-4 text-amber-400" />;
      case "direct_answer":
        return <Sparkles className="h-4 w-4 text-emerald-400" />;
      default:
        return <Bot className="h-4 w-4 text-teal-400" />;
    }
  };

  const getCategoryTheme = (category?: string, overrideColor?: string) => {
    const effectiveTheme = overrideColor && overrideColor !== "auto" ? overrideColor : category;

    switch (effectiveTheme) {
      case "cyan":
        return {
          border: "border-cyan-500/50",
          glow: "shadow-cyan-500/20",
          badgeBg: "bg-cyan-500/20 border-cyan-500/40 text-cyan-200",
          gradient: "from-cyan-300 via-sky-200 to-indigo-300",
          accentBar: "from-cyan-400 via-sky-500 to-indigo-500",
          label: "Electric Cyan Synthesis",
          iconColor: "text-cyan-400",
          activeSidebar: "border-cyan-500/60 bg-cyan-950/25 border-l-4 border-l-cyan-400 shadow-md shadow-cyan-500/5",
          heroBg: "from-cyan-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "violet":
        return {
          border: "border-violet-500/50",
          glow: "shadow-violet-500/20",
          badgeBg: "bg-violet-500/20 border-violet-500/40 text-violet-200",
          gradient: "from-violet-300 via-fuchsia-200 to-indigo-200",
          accentBar: "from-violet-500 via-fuchsia-500 to-cyan-400",
          label: "Neon Violet Synthesis",
          iconColor: "text-violet-400",
          activeSidebar: "border-violet-500/60 bg-violet-950/25 border-l-4 border-l-violet-400 shadow-md shadow-violet-500/5",
          heroBg: "from-violet-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "amber":
        return {
          border: "border-amber-500/50",
          glow: "shadow-amber-500/20",
          badgeBg: "bg-amber-500/20 border-amber-500/40 text-amber-200",
          gradient: "from-amber-300 via-orange-200 to-yellow-200",
          accentBar: "from-amber-400 via-orange-500 to-yellow-500",
          label: "Sunset Amber Synthesis",
          iconColor: "text-amber-400",
          activeSidebar: "border-amber-500/60 bg-amber-950/25 border-l-4 border-l-amber-400 shadow-md shadow-amber-500/5",
          heroBg: "from-amber-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "rose":
        return {
          border: "border-pink-500/50",
          glow: "shadow-pink-500/20",
          badgeBg: "bg-pink-500/20 border-pink-500/40 text-pink-200",
          gradient: "from-pink-300 via-rose-200 to-fuchsia-300",
          accentBar: "from-pink-500 via-rose-500 to-purple-500",
          label: "Vibrant Rose Synthesis",
          iconColor: "text-pink-400",
          activeSidebar: "border-pink-500/60 bg-pink-950/25 border-l-4 border-l-pink-400 shadow-md shadow-pink-500/5",
          heroBg: "from-pink-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "emerald":
        return {
          border: "border-emerald-500/50",
          glow: "shadow-emerald-500/20",
          badgeBg: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200",
          gradient: "from-emerald-300 via-teal-200 to-cyan-300",
          accentBar: "from-emerald-400 via-teal-500 to-cyan-500",
          label: "Cyber Emerald Synthesis",
          iconColor: "text-emerald-400",
          activeSidebar: "border-emerald-500/60 bg-emerald-950/25 border-l-4 border-l-emerald-400 shadow-md shadow-emerald-500/5",
          heroBg: "from-emerald-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "web_search":
        return {
          border: "border-sky-500/50",
          glow: "shadow-sky-500/15",
          badgeBg: "bg-sky-500/20 border-sky-500/40 text-sky-200",
          gradient: "from-sky-300 via-blue-200 to-indigo-300",
          accentBar: "from-sky-500 via-blue-500 to-indigo-500",
          label: "Live Web Intelligence",
          iconColor: "text-sky-400",
          activeSidebar: "border-sky-500/60 bg-sky-950/25 border-l-4 border-l-sky-400 shadow-md shadow-sky-500/5",
          heroBg: "from-sky-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "rag_retrieval":
        return {
          border: "border-purple-500/50",
          glow: "shadow-purple-500/15",
          badgeBg: "bg-purple-500/20 border-purple-500/40 text-purple-200",
          gradient: "from-purple-300 via-pink-200 to-indigo-200",
          accentBar: "from-purple-500 via-indigo-500 to-blue-500",
          label: "Knowledge Base (RAG)",
          iconColor: "text-purple-400",
          activeSidebar: "border-purple-500/60 bg-purple-950/25 border-l-4 border-l-purple-400 shadow-md shadow-purple-500/5",
          heroBg: "from-purple-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "calculation":
        return {
          border: "border-pink-500/50",
          glow: "shadow-pink-500/15",
          badgeBg: "bg-pink-500/20 border-pink-500/40 text-pink-200",
          gradient: "from-pink-300 via-rose-200 to-amber-200",
          accentBar: "from-pink-500 via-rose-500 to-orange-500",
          label: "Deterministic Math Engine",
          iconColor: "text-pink-400",
          activeSidebar: "border-pink-500/60 bg-pink-950/25 border-l-4 border-l-pink-400 shadow-md shadow-pink-500/5",
          heroBg: "from-pink-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "sensitive_action":
        return {
          border: "border-amber-500/50",
          glow: "shadow-amber-500/15",
          badgeBg: "bg-amber-500/20 border-amber-500/40 text-amber-200",
          gradient: "from-amber-300 via-orange-200 to-yellow-200",
          accentBar: "from-amber-500 via-orange-500 to-yellow-500",
          label: "Human-in-the-Loop Action",
          iconColor: "text-amber-400",
          activeSidebar: "border-amber-500/60 bg-amber-950/25 border-l-4 border-l-amber-400 shadow-md shadow-amber-500/5",
          heroBg: "from-amber-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      case "direct_answer":
        return {
          border: "border-cyan-500/50",
          glow: "shadow-cyan-500/20",
          badgeBg: "bg-cyan-500/20 border-cyan-500/40 text-cyan-200",
          gradient: "from-cyan-300 via-sky-200 to-indigo-300",
          accentBar: "from-cyan-400 via-sky-500 to-indigo-500",
          label: "Direct AI Synthesis",
          iconColor: "text-cyan-400",
          activeSidebar: "border-cyan-500/60 bg-cyan-950/25 border-l-4 border-l-cyan-400 shadow-md shadow-cyan-500/5",
          heroBg: "from-cyan-950/30 via-zinc-900/80 to-zinc-950/95",
        };
      default:
        return {
          border: "border-violet-500/50",
          glow: "shadow-violet-500/20",
          badgeBg: "bg-violet-500/20 border-violet-500/40 text-violet-200",
          gradient: "from-violet-300 via-purple-200 to-cyan-300",
          accentBar: "from-violet-500 via-purple-500 to-cyan-400",
          label: "Autonomous Synthesis",
          iconColor: "text-violet-400",
          activeSidebar: "border-violet-500/60 bg-violet-950/25 border-l-4 border-l-violet-400 shadow-md shadow-violet-500/5",
          heroBg: "from-violet-950/30 via-zinc-900/80 to-zinc-950/95",
        };
    }
  };

  const getNodeBadgeStyle = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("user")) return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    if (n.includes("triage")) return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    if (n.includes("research") || n.includes("search")) return "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
    if (n.includes("direct") || n.includes("answer") || n.includes("response")) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (n.includes("calc") || n.includes("math")) return "bg-pink-500/15 text-pink-300 border-pink-500/30";
    if (n.includes("guard") || n.includes("hitl") || n.includes("sensit") || n.includes("approval")) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    return "bg-teal-500/15 text-teal-300 border-teal-500/30";
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-zinc-950 font-sans antialiased overflow-hidden">
      {/* Top Navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/70 bg-zinc-900/50 px-3.5 sm:px-6 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex md:hidden items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/90 p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 transition active:scale-95"
            title="Toggle Tasks & Chats"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 text-zinc-950 shadow-md shadow-emerald-500/20 shrink-0">
            <Bot className="h-5 w-5 stroke-[2.2]" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-zinc-100">
              AmbientDesk AI
            </span>
          </div>
        </div>

        {/* Engine Status Minimal Indicator */}
        <div className="hidden lg:flex items-center space-x-2 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-400 text-xs">Engine Online</span>
        </div>

        {/* User Profile & Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {currentUser && (
            <button
              onClick={handleOpenProfile}
              title="Click to view Profile & Settings"
              className="flex items-center space-x-2 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-1 sm:px-2.5 sm:py-1 text-left transition hover:border-zinc-700 hover:bg-zinc-800/80"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-xs font-bold text-emerald-300 border border-emerald-500/30 shrink-0">
                {currentUser.full_name
                  ? currentUser.full_name[0].toUpperCase()
                  : currentUser.email[0].toUpperCase()}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-zinc-200 leading-tight">
                  {currentUser.full_name || currentUser.email.split("@")[0]}
                </p>
                <div className="flex items-center space-x-1">
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                      currentUser.role === "Admin"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </div>
              </div>
            </button>
          )}

          <button
            onClick={async () => {
              await loadTasks();
              showToast("Workspace synchronized", "info");
            }}
            title="Refresh Tasks"
            className="hidden sm:flex items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync</span>
          </button>

          <button
            onClick={() => {
              showToast("Signed out successfully", "info");
              handleLogout();
            }}
            title="Sign Out"
            className="flex items-center space-x-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          />
        )}

        {/* Left Sidebar: Task Navigator (Responsive Drawer) */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-in-out md:static md:flex md:w-64 lg:w-72 md:bg-zinc-900/30 md:shadow-none md:translate-x-0 ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          {/* Mobile Drawer Header */}
          <div className="flex md:hidden items-center justify-between border-b border-zinc-800/80 px-4 py-3 bg-zinc-950/40">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Bot className="h-4 w-4" />
              <span>Workspace Navigator</span>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search and Filters Header */}
          <div className="border-b border-zinc-800/60 p-3.5 space-y-2.5">
            {/* Start New Chat Button */}
            <button
              onClick={startNewChat}
              className="flex w-full items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 py-2.5 px-3 text-xs font-bold text-zinc-950 hover:opacity-95 hover:shadow-lg hover:shadow-emerald-500/20 transition shadow-md shadow-emerald-500/10 active:scale-[0.99]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Start New Chat Session</span>
            </button>

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
              filteredTasks.map((task) => {
                const isSelected = selectedTask?.id === task.id;
                const promptTitle = task.prompt.split("\n\n[Follow-up]: ")[0];
                return (
                  <div
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className={`group relative cursor-pointer rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-emerald-500/60 bg-emerald-950/20 shadow-md shadow-emerald-500/5"
                        : "border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`line-clamp-1 text-xs font-semibold ${isSelected ? "text-white" : "text-zinc-200"}`}>
                        {promptTitle || "Untitled chat"}
                      </p>
                      {task.status === "processing" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0 mt-0.5" />
                      ) : task.status === "awaiting_approval" ? (
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0 mt-1" />
                      ) : (
                        <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                          {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-400">
                      <div className="flex items-center space-x-1.5">
                        {renderCategoryIcon(task.triage_category)}
                        <span className="text-[10px] capitalize text-zinc-400">
                          {task.triage_category?.replace("_", " ") || "Chat"}
                        </span>
                      </div>
                      {task.prompt.includes("\n\n[Follow-up]: ") && (
                        <span className="text-[10px] text-teal-400 font-medium">
                          {task.prompt.split("\n\n[Follow-up]: ").length} msgs
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile Drawer Footer with Profile & Actions */}
          <div className="flex md:hidden items-center justify-between border-t border-zinc-800/80 p-3 bg-zinc-950/70">
            {currentUser && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenProfile();
                }}
                className="flex items-center space-x-2 text-xs font-medium text-zinc-300 hover:text-white"
              >
                <Settings className="h-4 w-4 text-emerald-400" />
                <span>Profile & Settings</span>
              </button>
            )}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
              className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Right Canvas: Task Inspector & Workspace */}
        <main className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-8">
            {selectedTask ? (
              <div className="mx-auto max-w-4xl space-y-6">
                {(() => {
                  const theme = getCategoryTheme(selectedTask.triage_category, outputColorTheme);

                  // Parse all prompt turns cleanly so activePrompt is never empty
                  const rawTurns = selectedTask.prompt
                    .split(/(?:\r?\n\s*)*\[Follow-up\]:\s*/)
                    .map((t) => t.trim())
                    .filter(Boolean);
                  const promptTurns = rawTurns.length > 0 ? rawTurns : [selectedTask.prompt.trim()];

                  // Parse all assistant output turns
                  const rawOutputTurns = selectedTask.output
                    ? selectedTask.output
                        .split(/(?:\r?\n\s*)*\[Follow-up\]:\s*/)
                        .map((t) => t.trim())
                        .filter(Boolean)
                    : [];

                  interface ConversationTurn {
                    index: number;
                    prompt: string;
                    output?: string;
                    isLatest: boolean;
                  }

                  const turns: ConversationTurn[] = promptTurns.map((turnPrompt, idx) => {
                    const isLatest = idx === promptTurns.length - 1;
                    let turnOutput: string | undefined = undefined;

                    if (rawOutputTurns.length === promptTurns.length) {
                      turnOutput = rawOutputTurns[idx];
                    } else if (rawOutputTurns.length === promptTurns.length - 1 && !isLatest) {
                      turnOutput = rawOutputTurns[idx];
                    } else if (isLatest && rawOutputTurns.length > 0) {
                      turnOutput = rawOutputTurns[rawOutputTurns.length - 1];
                    } else if (idx < rawOutputTurns.length) {
                      turnOutput = rawOutputTurns[idx];
                    }

                    return {
                      index: idx,
                      prompt: turnPrompt,
                      output: turnOutput,
                      isLatest,
                    };
                  });

                  const earlierTurns = turns.slice(0, turns.length - 1);
                  const latestTurn = turns[turns.length - 1] || {
                    index: 0,
                    prompt: selectedTask.prompt,
                    output: selectedTask.output,
                    isLatest: true,
                  };

                  // Filter out system user_message logs so only actual agent steps remain
                  const agentLogs = (selectedTask.logs || []).filter(
                    (l) => l.node_name !== "user_message"
                  );

                  return (
                    <div className="space-y-6 pb-6">
                      {/* Optional Earlier Conversation Turns */}
                      {earlierTurns.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex justify-center">
                            <button
                              onClick={() => setShowEarlierTurns(!showEarlierTurns)}
                              className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition shadow-sm"
                            >
                              {showEarlierTurns
                                ? "Hide earlier turns"
                                : `${earlierTurns.length} earlier ${earlierTurns.length === 1 ? "turn" : "turns"} in conversation`}
                            </button>
                          </div>
                          {showEarlierTurns && (
                            <div className="space-y-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5 animate-in fade-in duration-200">
                              {earlierTurns.map((turn) => (
                                <div
                                  key={turn.index}
                                  className="space-y-4 border-b border-zinc-800/60 pb-5 last:border-b-0 last:pb-0"
                                >
                                  {/* User Turn Speech Bubble */}
                                  <div className="flex justify-end">
                                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-800/80 px-4 py-2.5 text-xs sm:text-sm text-zinc-200 border border-zinc-700/40 leading-relaxed shadow-sm">
                                      <p className="whitespace-pre-wrap">{turn.prompt}</p>
                                    </div>
                                  </div>

                                  {/* Assistant Turn Response */}
                                  {turn.output ? (
                                    <div className="flex items-start space-x-3.5 group pt-1">
                                      <div
                                        className={`flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700/70 ${theme.iconColor} shrink-0 mt-0.5 shadow-sm`}
                                      >
                                        <Bot className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1 space-y-2 min-w-0">
                                        <div className="text-zinc-200 text-xs sm:text-sm leading-relaxed break-words">
                                          <MarkdownRenderer content={turn.output} />
                                        </div>
                                        <div className="flex items-center space-x-2 pt-0.5 text-xs text-zinc-500">
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(turn.output!);
                                              showToast("Response copied to clipboard!", "success");
                                            }}
                                            className="inline-flex items-center space-x-1.5 rounded-md px-2 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition active:scale-95 text-[11px]"
                                            title="Copy response"
                                          >
                                            <Copy className="h-3 w-3" />
                                            <span>Copy</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-2 text-xs text-zinc-500 italic pl-10">
                                      <span>Response not retained in earlier session history</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 1. User Message (Clean Right-Aligned Speech Bubble) */}
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-800/90 px-4.5 py-3 text-sm text-zinc-100 border border-zinc-700/50 shadow-sm leading-relaxed">
                          <p className="whitespace-pre-wrap">{latestTurn.prompt}</p>
                          <div className="mt-1.5 flex items-center justify-end space-x-1.5 text-[10px] text-zinc-400">
                            <Clock className="h-3 w-3" />
                            <span>
                              {new Date(selectedTask.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. HITL Authorization Banner (When awaiting approval) */}
                      {selectedTask.status === "awaiting_approval" && (
                        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3.5 shadow-lg shadow-amber-500/5">
                          <div className="flex items-center space-x-2.5 text-amber-400">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30">
                              <ShieldAlert className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold uppercase tracking-wider">
                                Human Authorization Required
                              </h3>
                              <p className="text-[11px] text-amber-300/80">
                                Sensitive operation requires your confirmation.
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-amber-500/20 bg-zinc-950/70 p-3.5 text-xs font-mono text-amber-200 leading-relaxed">
                            {selectedTask.approval_prompt ||
                              "Action payload pending review: Proceed with executing external side-effect."}
                          </div>

                          <div className="flex items-center space-x-3 pt-1">
                            <button
                              onClick={() => handleApproval(selectedTask.id, true)}
                              disabled={isApproving}
                              className="flex items-center space-x-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition shadow-md shadow-emerald-500/20"
                            >
                              {isApproving ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-950" />
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                  <span>Confirm & Execute</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleApproval(selectedTask.id, false)}
                              disabled={isApproving}
                              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition"
                            >
                              Reject Action
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 3. Assistant Response / Loading State */}
                      {selectedTask.status === "processing" ? (
                        <div className="flex items-start space-x-3.5 pt-1 animate-in fade-in duration-200">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700/60 ${theme.iconColor} shrink-0 mt-0.5 shadow-sm`}>
                            <Bot className="h-4 w-4 animate-pulse" />
                          </div>
                          <div className="flex-1 space-y-2.5 pt-0.5">
                            <div className="inline-flex items-center space-x-2 text-xs text-zinc-400 font-mono">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                              <span>Synthesizing reasoning & orchestrating nodes...</span>
                            </div>
                            <div className="space-y-2 max-w-md">
                              <div className="h-2.5 w-4/5 rounded-full bg-zinc-800/80 animate-pulse" />
                              <div className="h-2.5 w-3/5 rounded-full bg-zinc-800/60 animate-pulse [animation-delay:0.15s]" />
                            </div>
                          </div>
                        </div>
                      ) : latestTurn.output ? (
                        <div className="flex items-start space-x-3.5 group">
                          {/* Assistant Avatar */}
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700/70 ${theme.iconColor} shrink-0 mt-0.5 shadow-sm`}>
                            <Bot className="h-4 w-4" />
                          </div>

                          <div className="flex-1 space-y-3 min-w-0">
                            {/* DeepSeek / Claude-style Inline Collapsible Reasoning Pill */}
                            {(selectedTask.execution_time_ms > 0 || agentLogs.length > 0) && (
                              <div>
                                <button
                                  onClick={() => setShowLogs(!showLogs)}
                                  className="inline-flex items-center space-x-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/80 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition font-mono"
                                >
                                  <Sparkles className={`h-3 w-3 ${theme.iconColor}`} />
                                  <span>
                                    {selectedTask.execution_time_ms > 0
                                      ? `Thought for ${(selectedTask.execution_time_ms / 1000).toFixed(1)}s`
                                      : "Orchestration trace"}
                                    {agentLogs.length > 0 ? ` (${agentLogs.length} steps)` : ""}
                                  </span>
                                  {showLogs ? (
                                    <ChevronUp className="h-3 w-3 text-zinc-400" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                                  )}
                                </button>

                                {/* Collapsible Trace Drawer */}
                                {showLogs && (
                                  <div className="mt-2.5 max-h-64 overflow-y-auto space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-xs animate-in fade-in duration-150">
                                    {selectedTask.triage_category && (
                                      <div className="flex items-center space-x-2 text-zinc-400 pb-2 border-b border-zinc-800/60 text-xs">
                                        <div className="rounded p-1 bg-zinc-950 border border-zinc-800">
                                          {renderCategoryIcon(selectedTask.triage_category)}
                                        </div>
                                        <div>
                                          <span className="font-semibold text-zinc-300">Triage:</span>{" "}
                                          <span className="capitalize text-emerald-400 font-medium">
                                            {selectedTask.triage_category.replace("_", " ")}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {agentLogs.length > 0 ? (
                                      agentLogs.map((log) => (
                                        <div
                                          key={log.id}
                                          className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/50 text-[11px] font-mono space-y-1"
                                        >
                                          <div className="flex items-center justify-between text-zinc-400">
                                            <span
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getNodeBadgeStyle(
                                                log.node_name
                                              )}`}
                                            >
                                              [{log.node_name}]
                                            </span>
                                            <span className="text-[10px] text-zinc-500">
                                              {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                          </div>
                                          <p className="text-zinc-300 font-sans text-xs pt-0.5 leading-relaxed">
                                            {log.message}
                                          </p>
                                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                                            <div className="mt-1 text-[10px] text-zinc-500 font-mono">
                                              {log.metadata.latency_ms !== undefined && (
                                                <span>
                                                  Latency: {(Number(log.metadata.latency_ms) / 1000).toFixed(2)}s
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-zinc-500 text-xs">No discrete steps recorded.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Direct Clean Markdown Response */}
                            <div className="text-zinc-100 text-sm sm:text-base leading-relaxed break-words">
                              <MarkdownRenderer content={latestTurn.output} />
                            </div>

                            {/* Unobtrusive Action Row */}
                            <div className="flex items-center space-x-2.5 pt-1 text-xs text-zinc-500">
                              <button
                                onClick={handleCopyOutput}
                                className="inline-flex items-center space-x-1.5 rounded-md px-2 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition active:scale-95"
                                title="Copy response"
                              >
                                {copied ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    <span className="text-[11px] text-emerald-400 font-medium">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span className="text-[11px]">Copy</span>
                                  </>
                                )}
                              </button>
                              <span className="text-zinc-700">·</span>
                              <span className="text-[11px] font-mono text-zinc-500">Gemini 2.5 Flash</span>
                              {selectedTask.execution_time_ms > 0 && (
                                <>
                                  <span className="text-zinc-700">·</span>
                                  <span className="text-[11px] font-mono text-zinc-500">
                                    {(selectedTask.execution_time_ms / 1000).toFixed(2)}s
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* Error Banner */}
                      {selectedTask.status === "failed" && selectedTask.error_message && (
                        <div className="flex items-start space-x-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                          <div>
                            <h4 className="font-semibold text-rose-200">Execution Error</h4>
                            <p className="mt-0.5 leading-relaxed">{selectedTask.error_message}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                        onClick={() => {
                          setPrompt(item.text);
                          startNewChat();
                        }}
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
                  placeholder={
                    selectedTask && !isNewChat
                      ? "Reply to continue this conversation... (or click 'Start New Chat')"
                      : "Ask AmbientDesk to research, query docs, calculate, or execute tasks..."
                  }
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
              <div className="mt-1.5 flex items-center justify-end px-2 text-[10px] text-zinc-500">
                <span>Press Enter to send</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* User Profile & Account Settings Modal */}
      {isProfileOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-3 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-800/90 bg-zinc-900 p-4 sm:p-6 md:p-8 shadow-2xl space-y-5 sm:space-y-6 scrollbar-thin">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-800/80 pb-5">
              <div className="flex items-center space-x-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-xl font-bold text-zinc-950 shadow-lg shadow-emerald-500/20">
                  {currentUser.full_name
                    ? currentUser.full_name[0].toUpperCase()
                    : currentUser.email[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-bold text-zinc-100">
                      {currentUser.full_name || currentUser.email.split("@")[0]}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        currentUser.role === "Admin"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{currentUser.email}</p>
                  {currentUser.date_joined && (
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Joined {new Date(currentUser.date_joined).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsProfileOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="grid grid-cols-3 rounded-xl bg-zinc-950/80 p-1 text-xs font-semibold border border-zinc-800">
              <button
                type="button"
                onClick={() => setProfileTab("overview")}
                className={`flex items-center justify-center space-x-1.5 rounded-lg py-2 transition ${
                  profileTab === "overview"
                    ? "bg-emerald-500 text-zinc-950 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Overview</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("edit")}
                className={`flex items-center justify-center space-x-1.5 rounded-lg py-2 transition ${
                  profileTab === "edit"
                    ? "bg-emerald-500 text-zinc-950 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Account</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab("security")}
                className={`flex items-center justify-center space-x-1.5 rounded-lg py-2 transition ${
                  profileTab === "security"
                    ? "bg-emerald-500 text-zinc-950 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Security</span>
              </button>
            </div>

            {/* Tab 1: Overview & Usage Statistics */}
            {profileTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 text-center">
                    <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                      Tasks
                    </span>
                    <p className="mt-1 text-xl font-bold text-zinc-100">
                      {currentUser.stats?.total_tasks ?? tasks.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 text-center">
                    <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
                      Completed
                    </span>
                    <p className="mt-1 text-xl font-bold text-emerald-400">
                      {currentUser.stats?.completed_tasks ??
                        tasks.filter((t) => t.status === "completed").length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 text-center">
                    <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
                      Pending
                    </span>
                    <p className="mt-1 text-xl font-bold text-amber-400">
                      {currentUser.stats?.awaiting_approval ??
                        tasks.filter((t) => t.status === "awaiting_approval").length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 text-center">
                    <span className="text-[11px] font-medium text-sky-400 uppercase tracking-wider">
                      Execution
                    </span>
                    <p className="mt-1 text-xl font-bold text-sky-400">
                      {currentUser.stats?.total_execution_time_s
                        ? `${currentUser.stats.total_execution_time_s}s`
                        : "0s"}
                    </p>
                  </div>
                </div>

                {/* Workspace Capabilities */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                    <span>Enabled Orchestration Stack</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 pt-1">
                    <div className="flex items-center space-x-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Groq Llama 3.3 70B Versatile</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Gemini 2.0 Flash Fallback</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Tavily Live Web Search</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>pgvector RAG + PostgresSaver</span>
                    </div>
                  </div>
                </div>

                {/* AI Output Theme Customization */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-zinc-200">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                      <span>AI Output Accent Theme</span>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">Workspace Setting</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Set your preferred accent color for Agent Synthesis Output labels and cards:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {[
                      { id: "auto", label: "Smart Dynamic", desc: "Intent-based colors", badge: "bg-gradient-to-r from-cyan-400 to-indigo-400", border: "border-cyan-500/40" },
                      { id: "cyan", label: "Electric Cyan", desc: "High-tech ice blue", badge: "bg-cyan-400", border: "border-cyan-500/40" },
                      { id: "violet", label: "Neon Violet", desc: "Cyber purple / violet", badge: "bg-violet-400", border: "border-violet-500/40" },
                      { id: "amber", label: "Sunset Amber", desc: "Warm golden glow", badge: "bg-amber-400", border: "border-amber-500/40" },
                      { id: "rose", label: "Vibrant Rose", desc: "Radiant pink / fuchsia", badge: "bg-pink-400", border: "border-pink-500/40" },
                      { id: "emerald", label: "Cyber Emerald", desc: "Matrix green styling", badge: "bg-emerald-400", border: "border-emerald-500/40" },
                    ].map((themeOpt) => {
                      const isSelected = outputColorTheme === themeOpt.id;
                      return (
                        <button
                          key={themeOpt.id}
                          type="button"
                          onClick={() => {
                            setOutputColorTheme(themeOpt.id as any);
                            localStorage.setItem("ambient_output_theme", themeOpt.id);
                          }}
                          className={`flex items-start space-x-2.5 rounded-xl border p-2.5 text-left transition ${
                            isSelected
                              ? `${themeOpt.border} bg-zinc-900 shadow-md ring-1 ring-emerald-500/50`
                              : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60"
                          }`}
                        >
                          <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${themeOpt.badge} ${isSelected ? "ring-2 ring-white" : ""}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-zinc-300"}`}>
                                {themeOpt.label}
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                            </div>
                            <span className="block text-[10px] text-zinc-500 truncate mt-0.5">
                              {themeOpt.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Edit Account Details */}
            {profileTab === "edit" && (
              <form onSubmit={handleSaveProfileName} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    placeholder="Your Name"
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={currentUser.email}
                    disabled
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-3.5 py-2.5 text-sm text-zinc-500 cursor-not-allowed"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Account email is unique and linked to your workspace sessions.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex items-center space-x-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 active:scale-[0.98] transition disabled:opacity-50"
                  >
                    {isUpdatingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 stroke-[2.5]" />
                    )}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: Security & Password */}
            {profileTab === "security" && (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="At least 8 characters"
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none transition"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Confirm new password"
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none transition"
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex items-center space-x-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 active:scale-[0.98] transition disabled:opacity-50"
                  >
                    {isUpdatingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
