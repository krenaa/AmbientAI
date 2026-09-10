import React, { useRef, useEffect } from "react";
import {
  StopCircle,
  CornerDownLeft,
  Search,
  Database,
  Calculator,
  ShieldAlert,
  ArrowUp,
  Plus,
  Paperclip
} from "lucide-react";

interface ChatInputProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  onStop?: () => void;
  onOpenKnowledge?: () => void;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  prompt,
  setPrompt,
  onSubmit,
  isProcessing,
  onStop,
  onOpenKnowledge,
  placeholder = "Ask AmbientDesk anything... e.g. search web, query pgvector knowledge base, calculate AST math",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [prompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !isProcessing) {
        onSubmit();
      }
    }
  };

  const handleInsertModality = (prefix: string) => {
    setPrompt(prefix);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 sticky bottom-0 z-20">
      <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 focus-within:border-zinc-700 shadow-2xl transition-all duration-200 space-y-2 p-3">
        {/* Tool Modality Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider pl-1 mr-1">
            Agent Modes:
          </span>
          {onOpenKnowledge && (
            <button
              type="button"
              onClick={onOpenKnowledge}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-all cursor-pointer whitespace-nowrap"
              title="Upload PDF or document to Knowledge Base"
            >
              <Plus className="w-3 h-3 text-purple-400" />
              <span>Upload PDF</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleInsertModality("Search the live web for: ")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
          >
            <Search className="w-3 h-3 text-sky-400" />
            <span>Web Search</span>
          </button>
          <button
            type="button"
            onClick={() => handleInsertModality("Retrieve from knowledge base: ")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
          >
            <Database className="w-3 h-3 text-purple-400" />
            <span>pgvector RAG</span>
          </button>
          <button
            type="button"
            onClick={() => handleInsertModality("Calculate: ")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
          >
            <Calculator className="w-3 h-3 text-pink-400" />
            <span>AST Math</span>
          </button>
          <button
            type="button"
            onClick={() => handleInsertModality("Execute sensitive operation: ")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
          >
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            <span>HITL Guardrail</span>
          </button>
        </div>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isProcessing}
          className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-2 py-1 focus:outline-none resize-none max-h-40 leading-relaxed disabled:opacity-50"
        />

        {/* Action controls row */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            {onOpenKnowledge && (
              <button
                type="button"
                onClick={onOpenKnowledge}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm group"
                title="Add PDF or Document to Knowledge Base"
              >
                <Plus className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
                <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-[11px]">Add PDF</span>
              </button>
            )}
            <span className="hidden sm:flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              Press <kbd className="font-mono bg-zinc-800 px-1 py-0.5 rounded text-zinc-400 text-[10px]">Enter</kbd> to run
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isProcessing ? (
              <button
                onClick={onStop}
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <StopCircle className="w-3.5 h-3.5 animate-pulse" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={onSubmit}
                type="button"
                disabled={!prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
              >
                <span>Run Agent</span>
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
