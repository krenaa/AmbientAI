import React from "react";
import { Bot, Sparkles } from "lucide-react";

interface ThinkingIndicatorProps {
  currentNodeName?: string;
  isProcessing: boolean;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  currentNodeName,
  isProcessing,
}) => {
  if (!isProcessing) return null;

  return (
    <div className="flex items-start gap-3 max-w-3xl mr-auto animate-in fade-in duration-200">
      <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4" />
      </div>

      <div className="rounded-2xl rounded-tl-none px-4 py-3 text-sm bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 flex items-center gap-3 shadow-sm">
        <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
        <span className="font-medium text-zinc-300">
          {currentNodeName || "AmbientAI is thinking..."}
        </span>
        <span className="flex items-center gap-1 ml-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      </div>
    </div>
  );
};
