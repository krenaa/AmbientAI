import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  Bot,
  LogIn,
  UserPlus,
  LogOut,
  Send,
  MessageSquare,
  Sparkles,
  PlusCircle,
} from "lucide-react";
import { useAuth, AuthProvider } from "./context/AuthContext";
import { checkHealth, registerUser, loginUser } from "./services/api";

const AuthView: React.FC = () => {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        const res = await registerUser(email, password);
        login(res.access_token, res.user);
        toast.success("Account created and logged in!");
      } else {
        const res = await loginUser(email, password);
        login(res.access_token, res.user);
        toast.success("Logged in successfully!");
      }
    } catch (err: any) {
      const detail =
        err.response?.data?.detail || "Authentication failed. Please check credentials.";
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 ambient-gradient">
      <div className="w-full max-w-md rounded-2xl glass-panel p-8 shadow-2xl border border-white/10">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg mb-3">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">AmbientAI</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {isRegister ? "Create a new account" : "Sign in to access your agentic workspace"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="developer@ambientai.local"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-700/60 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-700/60 text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium shadow-md hover:shadow-cyan-500/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isRegister ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Register</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer"
          >
            {isRegister
              ? "Already have an account? Sign in"
              : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
};

const MainDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      try {
        await checkHealth();
        if (isMounted) setBackendStatus("online");
      } catch (e) {
        if (isMounted) setBackendStatus("offline");
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800/80 bg-zinc-900/40 flex flex-col">
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <Bot className="w-5 h-5" />
            </div>
            <span className="font-semibold text-sm tracking-wide text-white">AmbientAI</span>
          </div>
          <button
            onClick={() => toast.success("New chat initialized")}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="New Conversation"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Conversations
          </div>
          <button className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-sm text-zinc-200 flex items-center gap-2 cursor-pointer">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <span className="truncate">General Workspace</span>
          </button>
        </div>

        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <div className="flex flex-col truncate pr-2">
              <span className="text-xs text-zinc-400 truncate">{user?.email}</span>
              <span className="text-[10px] text-zinc-500">Core v1.0.0</span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-400 text-zinc-400 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative">
        {/* Top Header */}
        <header className="h-14 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-900/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-zinc-200">LangGraph HITL Core</h2>
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              StateGraph + RAG
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === "online"
                    ? "bg-emerald-500 animate-pulse"
                    : backendStatus === "checking"
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              />
              Backend: {backendStatus}
            </span>
          </div>
        </header>

        {/* Messages placeholder */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
            <Sparkles className="w-8 h-8 animate-pulse-glow" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">AmbientAI Core Rebuild</h3>
          <p className="text-sm text-zinc-400 max-w-md">
            Minimal resilient architecture featuring native WebSockets, LangGraph checkpointing, and pgvector RAG.
          </p>
        </div>

        {/* Input Bar Placeholder */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40">
          <div className="max-w-4xl mx-auto flex items-center gap-2 rounded-xl bg-zinc-900/80 border border-zinc-700/60 p-2 focus-within:border-cyan-500 transition-colors">
            <input
              type="text"
              placeholder="Ask a question or request a task..."
              className="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
            <button
              onClick={() => toast("Input wired in Phase 4")}
              className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-medium transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#f4f4f5",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          },
        }}
      />
      {isAuthenticated ? <MainDashboard /> : <AuthView />}
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
