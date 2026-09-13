import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  Bot,
  LogIn,
  UserPlus,
  LogOut,
  MessageSquare,
  FileText,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useAuth, AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./Toast";
import {
  registerUser,
  loginUser,
  getConversations,
  updateConversation,
  deleteConversation,
} from "./services/api";
import { prefetchConversationMessages } from "./hooks/useWebSocket";
import { ChatWindow } from "./components/ChatWindow";

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
              placeholder="developer@ambientai.com"
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

interface ConversationItem {
  id: string;
  title: string;
  has_pdf?: boolean;
  pdf_name?: string;
}

const MainDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(() => crypto.randomUUID());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const refreshConversations = async () => {
    try {
      const list = await getConversations();
      if (list && list.length > 0) {
        setConversations(list);
      }
    } catch (e) {
      console.debug("Could not refresh conversations:", e);
    }
  };

  // Load conversations from backend with retry
  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchConvs = async (retries = 0) => {
      try {
        const list = await getConversations();
        if (isMounted) {
          if (list && list.length > 0) {
            setConversations(list);
            setActiveConvId((prev) => (list.some((c) => c.id === prev) ? prev : list[0].id));
            // Proactively warm cache for all user conversations for 0ms instant loading
            list.forEach((c) => {
              prefetchConversationMessages(c.id);
            });
          } else {
            setConversations([]);
          }
        }
      } catch (e) {
        console.debug("Could not fetch conversations:", e);
        if (isMounted && retries < 3) {
          retryTimer = setTimeout(() => fetchConvs(retries + 1), 1000);
        }
      }
    };
    fetchConvs();
    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Opens a new draft chat - does NOT appear in sidebar until a prompt is entered and run!
  const handleCreateConversation = () => {
    const newDraftId = crypto.randomUUID();
    setActiveConvId(newDraftId);
  };

  // When prompt is entered and run: add to sidebar named according to its reference
  const handleMessageSent = (convId: string, promptText: string) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === convId);
      if (!exists) {
        return [{ id: convId, title: promptText }, ...prev];
      }
      if (
        exists.title === "New Conversation" ||
        exists.title === "General Workspace" ||
        exists.title === "New Chat" ||
        /^Chat\s+\d+$/i.test(exists.title)
      ) {
        return prev.map((c) => (c.id === convId ? { ...c, title: promptText } : c));
      }
      return prev;
    });
  };

  const handleStartRename = (conv: ConversationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async (id: string, e?: React.FormEvent, overrideTitle?: string) => {
    if (e) e.preventDefault();
    const cleanTitle = (overrideTitle !== undefined ? overrideTitle : editTitle).trim();
    if (!cleanTitle) {
      setEditingId(null);
      return;
    }
    try {
      await updateConversation(id, cleanTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: cleanTitle } : c))
      );
      toast.success("Chat renamed!");
    } catch (err) {
      // Local fallback update
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: cleanTitle } : c))
      );
      toast.success("Chat renamed!");
    } finally {
      setEditingId(null);
    }
  };

  const handleDeleteConversation = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    try {
      await deleteConversation(id);
    } catch (err) {
      console.debug("Delete request error:", err);
    }

    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (remaining.length > 0) {
      if (activeConvId === id) {
        setActiveConvId(remaining[0].id);
      }
    } else {
      // If 0 chats left, switch to a fresh draft ready for typing
      setActiveConvId(crypto.randomUUID());
    }
    toast.success("Chat deleted!");
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar with previous version Agent Studio aesthetic */}
      <aside className="w-64 border-r border-zinc-800/80 bg-zinc-900/50 flex flex-col shrink-0">
        {/* Studio Branding */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white">AmbientAI</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider bg-zinc-800 text-cyan-400 border border-zinc-700/60 uppercase">
                STUDIO
              </span>
            </div>
          </div>
        </div>

        {/* New Session Button */}
        <div className="p-3 border-b border-zinc-800/60">
          <button
            onClick={handleCreateConversation}
            className="w-full py-2.5 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/80 hover:border-cyan-500/50 text-white text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer group"
          >
            <PlusCircle className="w-4 h-4 text-cyan-400 group-hover:rotate-90 transition-transform duration-200" />
            <span>+ New Session</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Agent Sessions
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {conversations.length} total
            </span>
          </div>

          {conversations.map((conv) => {
            const isActive = conv.id === activeConvId;
            const isEditing = conv.id === editingId;

            if (isEditing) {
              return (
                <form
                  key={conv.id}
                  onSubmit={(e) => handleSaveRename(conv.id, e)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-zinc-800 border border-cyan-500/80"
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              );
            }

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`group w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer truncate ${
                  isActive
                    ? "bg-zinc-800/90 border border-zinc-700/90 text-white font-medium shadow-sm ring-1 ring-cyan-500/20"
                    : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  {conv.has_pdf ? (
                    <div className="shrink-0 flex items-center" title={`PDF attached: ${conv.pdf_name || "Document"}`}>
                      <FileText
                        className={`w-3.5 h-3.5 ${
                          isActive ? "text-purple-400" : "text-purple-400/90 group-hover:text-purple-300"
                        }`}
                      />
                    </div>
                  ) : (
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-400"
                      }`}
                    />
                  )}
                  <span className="truncate">{conv.title}</span>
                  {conv.has_pdf && (
                    <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-tight shrink-0">
                      PDF
                    </span>
                  )}
                </div>

                <div
                  className={`${
                    isActive ? "flex" : "hidden group-hover:flex"
                  } items-center gap-1 shrink-0`}
                >
                  <button
                    onClick={(e) => handleStartRename(conv, e)}
                    className="p-1 text-zinc-400 hover:text-cyan-400 rounded transition-colors cursor-pointer"
                    title="Rename Chat"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="p-1 text-zinc-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 truncate pr-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-xs text-zinc-300 font-medium truncate">{user?.email}</span>
                <span className="text-[10px] text-zinc-500">Core v1.0.0 • Online</span>
              </div>
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
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
        <ChatWindow
          key={activeConvId}
          conversationId={activeConvId}
          conversationTitle={activeConv?.title}
          onRename={(newTitle) => handleSaveRename(activeConvId, undefined, newTitle)}
          onDelete={() => handleDeleteConversation(activeConvId)}
          onMessageSent={handleMessageSent}
          onDocumentUploaded={refreshConversations}
        />
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
        gutter={12}
        toastOptions={{
          duration: 2800,
          style: {
            background: "rgba(18, 18, 23, 0.95)",
            color: "#f4f4f5",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 20px 0 rgba(6, 182, 212, 0.15)",
            borderRadius: "16px",
            padding: "11px 18px",
            fontSize: "13px",
            fontWeight: "500",
            maxWidth: "420px",
            letterSpacing: "-0.01em",
          },
          success: {
            duration: 2500,
            style: {
              border: "1px solid rgba(52, 211, 153, 0.35)",
              boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 25px rgba(52, 211, 153, 0.18)",
            },
            iconTheme: {
              primary: "#34d399",
              secondary: "#121217",
            },
          },
          error: {
            duration: 4000,
            style: {
              border: "1px solid rgba(244, 63, 94, 0.4)",
              boxShadow: "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 25px rgba(244, 63, 94, 0.18)",
            },
            iconTheme: {
              primary: "#fb7185",
              secondary: "#121217",
            },
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
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
