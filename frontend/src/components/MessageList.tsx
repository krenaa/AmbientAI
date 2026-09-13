import React, { useState, useEffect, useRef } from "react";
import { Bot, User as UserIcon, Copy, Check, RotateCcw, Reply } from "lucide-react";
import { toast } from "react-hot-toast";
import type { Message } from "../types";
import { ThinkingIndicator } from "./chat/ThinkingIndicator";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  statusMessage: string | null;
  isLoadingHistory?: boolean;
  onResubmitPrompt?: (prompt: string) => void;
}

const ActionButtons: React.FC<{
  text: string;
  isUser: boolean;
  onResubmit?: (text: string) => void;
}> = ({ text, isUser, onResubmit }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard!", { id: "copy-msg", duration: 1500 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleResubmit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onResubmit) {
      onResubmit(text);
      toast.success(isUser ? "Prompt loaded into input" : "Quoted in input", {
        id: "resubmit-msg",
        duration: 1500,
      });
    }
  };

  return (
    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
      {/* Icon-only Resubmit / Reply */}
      {onResubmit && (
        <button
          type="button"
          onClick={handleResubmit}
          className="p-1 rounded hover:bg-zinc-800/80 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
          title={isUser ? "Resubmit / edit prompt" : "Quote in reply"}
        >
          {isUser ? (
            <RotateCcw className="w-3.5 h-3.5" />
          ) : (
            <Reply className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Icon-only Copy */}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        title={copied ? "Copied!" : "Copy message"}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isProcessing,
  statusMessage,
  isLoadingHistory,
  onResubmitPrompt,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusMessage, isProcessing]);

  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 relative">
      {/* Non-blocking top progress bar while fetching */}
      {isLoadingHistory && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500 animate-pulse z-10" />
      )}

      {isLoadingHistory && messages.length === 0 ? (
        // Fast sleek skeleton cards instead of blocking the entire screen
        <div className="space-y-6 max-w-4xl mx-auto py-8">
          <div className="flex items-start gap-3 justify-end">
            <div className="w-64 h-14 rounded-2xl bg-zinc-800/40 border border-zinc-800 animate-pulse" />
            <div className="w-8 h-8 rounded-xl bg-zinc-800/60 shrink-0" />
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 shrink-0 border border-zinc-800" />
            <div className="flex-1 space-y-3">
              <div className="w-40 h-4 rounded-full bg-zinc-800/50 animate-pulse" />
              <div className="w-full h-20 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
            </div>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-cyan-400 shadow-md">
            <Bot className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-zinc-200">Start an Agent Session</p>
          <p className="text-xs text-zinc-500 max-w-sm mt-1 leading-relaxed">
            Ask questions, retrieve documentation via pgvector RAG, execute multi-step tools, or run HITL guarded actions.
          </p>
        </div>
      ) : null}

      {messages.map((msg, index) => {
        const isUser = msg.role === "user";
        const isLastAssistant = !isUser && index === messages.length - 1;

        // If assistant message is currently empty while processing, show thinking indicator
        if (!isUser && (!msg.content || !msg.content.trim())) {
          return (
            <div key={msg.id} className="max-w-4xl mx-auto mr-auto">
              <ThinkingIndicator
                currentNodeName={statusMessage || "AmbientAI is thinking..."}
                isProcessing={true}
              />
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`max-w-4xl mx-auto flex items-start gap-3.5 group ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {!isUser && (
              <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div className={`flex flex-col ${isUser ? "items-end max-w-[85%] sm:max-w-[75%]" : "flex-1 min-w-0"}`}>
              {/* User Bubble Header */}
              {isUser && (
                <div className="flex items-center gap-2 mb-1.5 text-[11px] text-zinc-500 font-mono">
                  <span>You</span>
                </div>
              )}

              {/* Message Box */}
              <div
                className={`shadow-sm ${
                  isUser
                    ? "p-3.5 rounded-2xl rounded-tr-sm bg-zinc-800/90 border border-zinc-700/60 text-zinc-100 text-sm leading-relaxed"
                    : "p-4 sm:p-5 rounded-2xl rounded-tl-sm bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 text-sm leading-relaxed"
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 pb-2 mb-3 border-b border-zinc-800/80">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        Ambient Agent
                      </span>
                    </div>

                    <div className="relative">
                      <MarkdownRenderer content={msg.content} />
                      {isProcessing && isLastAssistant && (
                        <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-1 align-middle" />
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 mt-3 border-t border-zinc-800/50">
                      <ActionButtons text={msg.content} isUser={false} onResubmit={onResubmitPrompt} />
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons Under User Prompt */}
              {isUser && (
                <div className="flex items-center justify-end gap-2 mt-1 px-1">
                  <ActionButtons text={msg.content} isUser={true} onResubmit={onResubmitPrompt} />
                </div>
              )}
            </div>

            {isUser && (
              <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300 shrink-0 mt-5 shadow-sm">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
          </div>
        );
      })}

      {/* Thinking Indicator before first assistant token arrives */}
      {isProcessing && (lastMessageIsUser || messages.length === 0) && (
        <div className="max-w-4xl mx-auto mr-auto">
          <ThinkingIndicator
            currentNodeName={statusMessage || "AmbientAI is thinking..."}
            isProcessing={isProcessing}
          />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
