import React, { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  LogOut,
  MessageSquare,
  FileText,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  SignedIn,
  SignedOut,
  useAuth,
  useUser,
  useClerk,
  AuthenticateWithRedirectCallback,
} from "@clerk/clerk-react";
import { ToastProvider } from "./Toast";
import {
  getConversations,
  updateConversation,
  deleteConversation,
  setAuthTokenGetter,
} from "./services/api";
import { setAuthTokenGetter as setApiAuthTokenGetter } from "./api";
import { prefetchConversationMessages } from "./hooks/useWebSocket";
import { ChatWindow } from "./components/ChatWindow";
import { ProfileModal } from "./components/modals/ProfileModal";
import { getDeterministicAvatar } from "./utils/avatar";
import { AuthScreen } from "./components/auth/AuthScreen";

interface ConversationItem {
  id: string;
  title: string;
  has_pdf?: boolean;
  pdf_name?: string;
}

interface MainDashboardProps {
  clerkUser: any;
  onSignOut: () => void;
}

const MainDashboard: React.FC<MainDashboardProps> = ({ clerkUser, onSignOut }) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(() => crypto.randomUUID());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

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
            // Proactively warm cache for all user conversations for instant loading
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
    setIsMobileSidebarOpen(false);
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
    } catch {
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
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 relative">
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity duration-200"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar with AmbientDesk Studio aesthetic */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 border-r border-zinc-800/80 bg-zinc-900/95 md:bg-zinc-900/50 flex flex-col shrink-0 transform transition-transform duration-200 ease-in-out ${
          isMobileSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Studio Branding */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 shrink-0 flex items-center justify-center">
              <img src="/logo.png" alt="AmbientAI Logo" className="w-full h-full object-contain drop-shadow-sm" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-[#1C120C]">AmbientAI</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider bg-zinc-800 text-[#183E6C] border border-zinc-700/60 uppercase">
                STUDIO
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-[#1C120C] md:hidden cursor-pointer"
            title="Close Sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3 border-b border-zinc-800/60">
          <button
            onClick={handleCreateConversation}
            className="w-full py-2.5 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/80 hover:border-[#183E6C] text-[#1C120C] text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer group"
          >
            <PlusCircle className="w-4 h-4 text-[#183E6C] group-hover:rotate-90 transition-transform duration-200" />
            <span>+ New Session</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
            <span>Agent Sessions</span>
            <span className="text-[10px] lowercase text-zinc-400 font-mono">
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#183E6C] shadow-sm"
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-transparent text-xs text-[#1C120C] font-semibold focus:outline-none placeholder-zinc-500"
                  />
                  <button
                    type="submit"
                    className="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="p-1 text-zinc-500 hover:text-zinc-700 cursor-pointer"
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
                onClick={() => {
                  setActiveConvId(conv.id);
                  setIsMobileSidebarOpen(false);
                }}
                className={`group relative w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center transition-colors cursor-pointer ${
                  isActive
                    ? "bg-zinc-800/90 border border-zinc-700/90 text-[#1C120C] font-bold shadow-sm ring-1 ring-[#183E6C]/30"
                    : "text-zinc-600 hover:bg-zinc-800/60 hover:text-[#1C120C] border border-transparent"
                }`}
              >
                {/* Left Icon */}
                <div className="shrink-0 mr-2 flex items-center">
                  {conv.has_pdf ? (
                    <FileText
                      className={`w-3.5 h-3.5 ${
                        isActive ? "text-purple-400" : "text-purple-400/90 group-hover:text-purple-300"
                      }`}
                    />
                  ) : (
                    <MessageSquare
                      className={`w-3.5 h-3.5 ${
                        isActive ? "text-purple-400" : "text-purple-400/90 group-hover:text-purple-300"
                      }`}
                    />
                  )}
                </div>

                {/* Title Container */}
                <div className="flex-1 min-w-0 pr-12 flex items-center gap-1.5 overflow-hidden">
                  <span className="truncate block leading-tight">{conv.title}</span>
                  {conv.has_pdf && (
                    <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-tight shrink-0">
                      PDF
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div
                  className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
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

        {/* User Footer with Clerk Google identity */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex-1 flex items-center gap-2.5 truncate pr-2 text-left group hover:opacity-85 transition-opacity cursor-pointer"
              title="Click to view your profile"
            >
              {clerkUser?.imageUrl ? (
                <img
                  src={clerkUser.imageUrl}
                  alt={clerkUser.fullName || "User Avatar"}
                  className="w-7 h-7 rounded-lg object-cover border border-zinc-700/80 shadow-xs shrink-0"
                />
              ) : (
                <div
                  style={{
                    backgroundColor: getDeterministicAvatar(
                      clerkUser?.fullName,
                      clerkUser?.primaryEmailAddress?.emailAddress
                    ).bg,
                    borderColor: getDeterministicAvatar(
                      clerkUser?.fullName,
                      clerkUser?.primaryEmailAddress?.emailAddress
                    ).border,
                    color: getDeterministicAvatar(
                      clerkUser?.fullName,
                      clerkUser?.primaryEmailAddress?.emailAddress
                    ).text,
                  }}
                  className="w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-[10px] shrink-0 shadow-xs"
                >
                  {
                    getDeterministicAvatar(
                      clerkUser?.fullName,
                      clerkUser?.primaryEmailAddress?.emailAddress
                    ).initials
                  }
                </div>
              )}
              <div className="flex flex-col truncate min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-200 font-semibold truncate group-hover:text-cyan-400 transition-colors">
                    {clerkUser?.fullName ||
                      clerkUser?.primaryEmailAddress?.emailAddress ||
                      "Google User"}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 truncate">
                  {clerkUser?.primaryEmailAddress?.emailAddress || "Google SSO"}
                </span>
              </div>
            </button>
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-400 text-zinc-400 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden min-w-0">
        <ChatWindow
          key={activeConvId}
          conversationId={activeConvId}
          conversationTitle={activeConv?.title}
          onRename={(newTitle) => handleSaveRename(activeConvId, undefined, newTitle)}
          onDelete={() => handleDeleteConversation(activeConvId)}
          onMessageSent={handleMessageSent}
          onDocumentUploaded={refreshConversations}
          onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        />
      </main>

      {/* Profile & Account Details Modal */}
      {showProfileModal && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={
            {
              id: clerkUser?.id || "user",
              email: clerkUser?.primaryEmailAddress?.emailAddress || "",
              full_name: clerkUser?.fullName || "",
              created_at: clerkUser?.createdAt
                ? new Date(clerkUser.createdAt).toISOString()
                : new Date().toISOString(),
            } as any
          }
          onLogout={onSignOut}
        />
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();

  // Attach dynamic Clerk token to API clients whenever signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const tokenGetter = async () => {
        try {
          return await getToken();
        } catch (err) {
          console.warn("Failed to retrieve Clerk session token:", err);
          return null;
        }
      };
      setAuthTokenGetter(tokenGetter);
      setApiAuthTokenGetter(tokenGetter);
    }
  }, [isLoaded, isSignedIn, getToken]);

  // Handle SSO Callback Route
  const isSsoCallback =
    typeof window !== "undefined" && window.location.pathname === "/sso-callback";

  if (isSsoCallback) {
    return (
      <div className="flex min-h-screen w-screen ambient-gradient items-center justify-center p-4 text-zinc-100">
        <div className="rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 p-8 text-center space-y-4 shadow-2xl max-w-sm w-full">
          <img src="/logo.png" alt="AmbientAI Logo" className="w-14 h-14 mx-auto object-contain drop-shadow-md" />
          <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-300">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
            <span>Completing Google Sign-In...</span>
          </div>
          <AuthenticateWithRedirectCallback
            signUpForceRedirectUrl="/"
            signInForceRedirectUrl="/"
            continueSignUpUrl="/"
          />
        </div>
      </div>
    );
  }

  // App Initializing State
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen w-screen ambient-gradient items-center justify-center p-4 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="AmbientAI Logo" className="w-16 h-16 object-contain animate-pulse drop-shadow-md" />
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
            <span>Initializing AmbientDesk Studio...</span>
          </div>
        </div>
      </div>
    );
  }

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
            boxShadow:
              "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 20px 0 rgba(6, 182, 212, 0.15)",
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
              boxShadow:
                "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 25px rgba(52, 211, 153, 0.18)",
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
              boxShadow:
                "0 20px 45px -10px rgba(0, 0, 0, 0.75), 0 0 25px rgba(244, 63, 94, 0.18)",
            },
            iconTheme: {
              primary: "#fb7185",
              secondary: "#121217",
            },
          },
        }}
      />
      <SignedOut>
        <AuthScreen />
      </SignedOut>
      <SignedIn>
        <MainDashboard
          clerkUser={clerkUser}
          onSignOut={() => signOut({ redirectUrl: "/" })}
        />
      </SignedIn>
    </>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
