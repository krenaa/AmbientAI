import React from "react";
import { Sparkles, Loader2 } from "lucide-react";

export const AppSplashScreen: React.FC = () => {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-white select-none">
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1px] shadow-2xl shadow-cyan-500/20 animate-pulse">
            <div className="w-full h-full bg-zinc-950 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" style={{ animationDuration: "6s" }} />
            </div>
          </div>
          <div className="absolute -inset-2 bg-cyan-500/20 rounded-2xl blur-xl -z-10 animate-pulse" />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-300 to-zinc-400 bg-clip-text text-transparent">
            AmbientDesk AI
          </h1>
          <p className="text-xs text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            Initializing neural runtime & pgvector engine...
          </p>
        </div>
      </div>
    </div>
  );
};
