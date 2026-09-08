import React, { useState } from "react";
import { Lock, Mail, User as UserIcon, Bot, Loader2, AlertCircle, Sparkles } from "lucide-react";

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, fullName: string) => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onRegister }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await onRegister(email, password, fullName);
      } else {
        await onLogin(email, password);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen ambient-gradient items-center justify-center p-4 sm:p-6 text-zinc-100 select-none">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
            <Bot className="w-6 h-6 text-zinc-100" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              AmbientDesk <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">Studio</span>
            </h1>
            <p className="text-xs text-zinc-400 max-w-sm">
              Autonomous AI agent orchestrator with live web intelligence, pgvector semantic retrieval, and AST math.
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-5 text-left">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                !isRegister
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError(null);
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                isRegister
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {isRegister && (
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="System Administrator"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="admin@ambientdesk.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isRegister ? "Creating Account..." : "Signing In..."}</span>
                </>
              ) : (
                <span>{isRegister ? "Create Account & Access Studio" : "Sign In to Studio"}</span>
              )}
            </button>
          </form>

          {/* Quick Tip */}
          <div className="pt-2 border-t border-zinc-800/80 text-center">
            <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Default Admin: admin@ambientdesk.ai / AdminPass123!</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
