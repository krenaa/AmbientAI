import React, { useRef, useEffect, useState } from "react";
import {
  StopCircle,
  Search,
  Database,
  Calculator,
  ShieldAlert,
  ArrowUp,
  Cpu,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import type { ModelOption } from "../../types";

interface ChatInputProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  onStop?: () => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: ModelOption[];
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  prompt,
  setPrompt,
  onSubmit,
  isProcessing,
  onStop,
  selectedModel,
  onSelectModel,
  availableModels,
  placeholder = "Ask AmbientDesk anything... e.g. search web, query pgvector knowledge base, calculate AST math",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [prompt]);

  // Close model popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    if (modelMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelMenuOpen]);

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

  const currentModelObj = availableModels.find((m) => m.id === selectedModel);
  const currentModelName = currentModelObj
    ? currentModelObj.name.replace(/^(Groq:\s*|Google:\s*)/, "")
    : selectedModel === "auto"
    ? "Auto Fallback"
    : selectedModel;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 sticky bottom-0 z-20">
      <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 focus-within:border-zinc-700 shadow-2xl transition-all duration-200 space-y-2 p-3">
        {/* Tool Modality Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider pl-1 mr-1">
            Agent Modes:
          </span>
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
          {/* Nexus-RAG Style Model Dropdown in Input Bar */}
          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 border border-zinc-700/60 text-zinc-200 text-xs font-medium transition-all cursor-pointer shadow-sm active:scale-95"
              title="Select Active AI Engine"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-medium text-xs truncate max-w-[140px] sm:max-w-[200px]">
                {currentModelName}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {modelMenuOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-72 p-2 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-50 animate-fadeIn space-y-1">
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 mb-1">
                  <span className="text-zinc-300 font-bold">LIVE AI MODELS</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
                  {availableModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelectModel(m.id);
                        setModelMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer text-left ${
                        selectedModel === m.id
                          ? "bg-zinc-900 border border-cyan-500/40 text-cyan-300 shadow-sm font-semibold"
                          : "text-zinc-300 hover:text-white hover:bg-zinc-900/60"
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate text-xs font-semibold">{m.name}</span>
                        <span className="text-[10px] text-zinc-500">{m.provider} • {m.badge}</span>
                      </div>
                      {selectedModel === m.id && (
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
