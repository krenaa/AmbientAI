import {
  Menu,
  Palette,
  CheckCircle2,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Database,
} from "lucide-react";
import type { AgentTask, UserProfile } from "../../types";
import { CategoryIcon } from "../common/CategoryIcon";
import { getCategoryTheme } from "../../utils/theme";
import { AmbientLogo } from "../common/AmbientLogo";

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeTask: AgentTask | null;
  wsConnected: boolean;
  user: UserProfile | null;
  outputColor: string;
  setOutputColor: (color: string) => void;
  onOpenKnowledge: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  setSidebarOpen,
  activeTask,
  wsConnected,
  user,
  outputColor,
  setOutputColor,
  onOpenKnowledge,
  onOpenProfile,
  onOpenAuth,
  onLogout,
}) => {
  const activeTheme = getCategoryTheme(activeTask?.triage_category, outputColor);
  const isAdmin = user?.is_staff || user?.role === "Admin";

  return (
    <header className="h-13 border-b border-zinc-800 bg-zinc-950 px-4 sm:px-6 flex items-center justify-between z-30 sticky top-0 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="md:hidden p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
          title="Toggle Navigation"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <AmbientLogo className="w-6 h-6 shrink-0 shadow-sm" />
          <div>
            <span className="font-semibold text-xs tracking-tight text-white flex items-center gap-1.5">
              AmbientDesk <span className="hidden sm:inline-block text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">Agent Studio</span>
            </span>
          </div>
        </div>

        {activeTask && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-zinc-800">
            <span className="text-[11px] text-zinc-400 font-mono">Routing:</span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${activeTheme.badgeBg} transition-all`}>
              <CategoryIcon category={activeTask.triage_category} className="w-3 h-3" />
              <span>{activeTheme.label}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Knowledge Base / PDF RAG Button */}
        <button
          onClick={onOpenKnowledge}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 text-zinc-300 hover:text-purple-300 text-xs font-medium transition-all cursor-pointer shadow-sm group"
          title="Upload PDFs & Manage Knowledge Base"
        >
          <Database className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline text-[11px]">Knowledge RAG</span>
        </button>

        {/* Output Accent Palette Selector */}
        <div className="hidden sm:block relative group">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm"
            title="Theme Accent"
          >
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline capitalize text-[11px]">
              {outputColor === "auto" ? "Dynamic" : outputColor}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-zinc-200 transition-transform group-hover:rotate-180" />
          </button>

          <div className="absolute right-0 top-full mt-1.5 w-40 p-1.5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl opacity-0 translate-y-1 invisible group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible transition-all duration-150 z-50">
            <div className="text-[10px] font-semibold text-zinc-400 px-2 py-1 uppercase tracking-wider">
              Output Accent
            </div>
            {[
              { id: "auto", name: "Dynamic (Triage)", color: "bg-zinc-400" },
              { id: "cyan", name: "Electric Cyan", color: "bg-cyan-400" },
              { id: "violet", name: "Neon Violet", color: "bg-violet-400" },
              { id: "emerald", name: "Cyber Emerald", color: "bg-emerald-400" },
              { id: "amber", name: "Sunset Amber", color: "bg-amber-400" },
              { id: "rose", name: "Crimson Rose", color: "bg-rose-400" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setOutputColor(c.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  outputColor === c.id
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${c.color}`} />
                  <span>{c.name}</span>
                </div>
                {outputColor === c.id && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Live Sync Status */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border select-none transition-colors ${
            wsConnected
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-zinc-800 border-zinc-700 text-zinc-400"
          }`}
          title={wsConnected ? "WebSocket Live Stream Active" : "Waiting for active session stream"}
        >
          <span className="relative flex h-2 w-2">
            {wsConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                wsConnected ? "bg-emerald-500" : "bg-zinc-500"
              }`}
            />
          </span>
          <span className="hidden sm:inline font-mono text-[10px]">
            {wsConnected ? "Live Neural Stream" : "Ready"}
          </span>
        </div>

        {/* Profile / Auth Button */}
        {user ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm"
              title={isAdmin ? "System Administration & Profile" : "User Profile & Settings"}
            >
              <div className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 font-bold text-[9px]">
                {user.full_name ? user.full_name[0].toUpperCase() : user.email[0].toUpperCase()}
              </div>
              <span className="hidden sm:inline font-medium truncate max-w-[130px] text-[11px]">
                {isAdmin ? "System Administration" : user.full_name || user.email.split("@")[0]}
              </span>
            </button>
            <button
              onClick={onLogout}
              className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 transition-all cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <UserIcon className="w-3 h-3" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
