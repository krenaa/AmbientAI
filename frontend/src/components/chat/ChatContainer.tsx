import React, { useRef, useEffect } from "react";
import { Sparkles, ShieldCheck, Zap, Layers } from "lucide-react";
import type { AgentTask } from "../../types";
import { ChatMessage } from "./ChatMessage";
import { SuggestedPrompts } from "./SuggestedPrompts";

interface ChatContainerProps {
  activeTask: AgentTask | null;
  outputColor: string;
  isStreaming: boolean;
  currentNodeName?: string;
  onOpenHitlModal: (task: AgentTask) => void;
  onSelectSuggestedPrompt: (prompt: string) => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  activeTask,
  outputColor,
  isStreaming,
  currentNodeName,
  onOpenHitlModal,
  onSelectSuggestedPrompt,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when streaming or task changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeTask?.output, activeTask?.logs?.length, activeTask?.status]);

  if (!activeTask) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-3xl my-auto py-6 space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>FastAPI • LangGraph • pgvector Runtime</span>
          </div>

          <div className="space-y-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Autonomous Agent Studio
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-lg mx-auto">
              Dynamic intent routing between live web search, pgvector semantic retrieval, deterministic AST math, and human-in-the-loop governance.
            </p>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Real-time Streaming</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>pgvector RAG</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>HITL Guardrails</span>
            </div>
          </div>

          <div className="pt-4">
            <SuggestedPrompts onSelectPrompt={onSelectSuggestedPrompt} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin">
      <ChatMessage
        task={activeTask}
        outputColor={outputColor}
        isStreaming={isStreaming}
        currentNodeName={currentNodeName}
        onOpenHitlModal={onOpenHitlModal}
      />
      <div ref={bottomRef} className="h-6" />
    </div>
  );
};
