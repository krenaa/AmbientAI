import React, { useState, useEffect } from "react";
import { Sparkles, Cpu, Clock } from "lucide-react";

interface ThinkingIndicatorProps {
  currentNodeName?: string;
  isProcessing: boolean;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  currentNodeName,
  isProcessing,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-zinc-900/60 border border-cyan-500/30 backdrop-blur-md shadow-lg shadow-cyan-500/5 animate-pulse">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
        <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: "3s" }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200">
            Agent Reasoning...
          </span>
          <span className="text-[11px] font-mono text-cyan-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {elapsedSeconds}s
          </span>
        </div>
        <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
          <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
          <span>
            {currentNodeName ? `Active node: ${currentNodeName}` : "Triaging input and generating execution graph..."}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
};
