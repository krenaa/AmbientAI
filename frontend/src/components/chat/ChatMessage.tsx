import React, { useState } from "react";
import {
  User,
  Copy,
  Check,
  ShieldAlert,
  Clock,
  AlertTriangle,
  ArrowRight,
  Bot
} from "lucide-react";
import type { AgentTask } from "../../types";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { CategoryIcon } from "../common/CategoryIcon";
import { ReasoningTrace } from "./ReasoningTrace";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { getCategoryTheme } from "../../utils/theme";

interface ChatMessageProps {
  task: AgentTask;
  outputColor: string;
  isStreaming?: boolean;
  currentNodeName?: string;
  onOpenHitlModal: (task: AgentTask) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  task,
  outputColor,
  isStreaming = false,
  currentNodeName,
  onOpenHitlModal,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const theme = getCategoryTheme(task.triage_category, outputColor);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Parse multi-turn prompts and outputs
  const promptTurns = task.prompt ? task.prompt.split("\n\n[Follow-up]: ") : [""];
  const outputTurns = task.output ? task.output.split("\n\n[Follow-up]: ") : [];

  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full pb-8">
      {promptTurns.map((turnPrompt, index) => {
        const turnOutput = outputTurns[index];
        const isLatestTurn = index === promptTurns.length - 1;

        return (
          <div key={index} className="space-y-6">
            {/* 1. User Message Bubble */}
            <div className="flex items-start gap-3.5 justify-end">
              <div className="flex flex-col items-end gap-1.5 max-w-[85%] sm:max-w-[75%]">
                <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                  <span>You</span>
                  <button
                    onClick={() => handleCopy(turnPrompt, `prompt-${index}`)}
                    className="hover:text-zinc-200 p-0.5 rounded cursor-pointer transition-colors"
                    title="Copy prompt"
                  >
                    {copiedIndex === `prompt-${index}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <div className="p-4 rounded-2xl rounded-tr-sm bg-zinc-800/90 border border-zinc-700/60 text-white text-sm leading-relaxed shadow-sm">
                  {turnPrompt}
                </div>
              </div>

              <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-6 shadow-sm">
                <User className="w-4 h-4" />
              </div>
            </div>

            {/* 2. Agent Response Bubble */}
            <div className="flex items-start gap-3.5">
              <div className={`w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-1 shadow-sm ${isStreaming && isLatestTurn ? "ring-1 ring-cyan-500/50" : ""}`}>
                <Bot className="w-4 h-4 text-cyan-400" />
              </div>

              <div className="flex-1 min-w-0 space-y-4">
                {/* Meta Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200">Ambient Agent</span>
                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${theme.badgeBg}`}>
                      <CategoryIcon category={task.triage_category} className="w-3 h-3" />
                      <span>{theme.label}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono">
                    {isLatestTurn && task.execution_time_ms > 0 && (
                      <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {(task.execution_time_ms / 1000).toFixed(2)}s
                      </span>
                    )}
                    {turnOutput && (
                      <button
                        onClick={() => handleCopy(turnOutput, `output-${index}`)}
                        className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer transition-colors bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800"
                      >
                        {copiedIndex === `output-${index}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Show Reasoning Trace on Latest Turn */}
                {isLatestTurn && (
                  <ReasoningTrace logs={task.logs} isProcessing={task.status === "processing"} />
                )}

                {/* Show Live Thinking Indicator on Latest Turn if processing */}
                {isLatestTurn && task.status === "processing" && (
                  <ThinkingIndicator currentNodeName={currentNodeName} isProcessing={true} />
                )}

                {/* HITL Awaiting Approval Notice on Latest Turn */}
                {isLatestTurn && task.status === "awaiting_approval" && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Human-in-the-Loop Approval Required</span>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-200/90">
                      {task.approval_prompt || "The agent has generated an action that touches sensitive operations. Please review and authorize execution."}
                    </p>
                    <button
                      onClick={() => onOpenHitlModal(task)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      <span>Review & Authorize</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Output Content Card */}
                {turnOutput && (
                  <div className="p-5 sm:p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-sm relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${theme.accentBar}`} />
                    <div className="prose prose-invert max-w-none text-zinc-200 text-sm leading-relaxed">
                      <MarkdownRenderer content={turnOutput} />
                    </div>
                  </div>
                )}

                {/* Single Friendly Alert Notice on Latest Turn if error occurred */}
                {isLatestTurn && (task.error_message || task.status === "failed") && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2.5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Model Execution Notice</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed font-mono bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                      {task.error_message || "The selected model is unavailable or encountered an error."}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-amber-300/90 pt-1">
                      <span>💡 <strong>Tip:</strong> Please select an active Groq model (e.g. <strong>LLaMA 3.3 70B</strong> or <strong>Gemma 2 9B</strong>) from the model selector and retry.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
