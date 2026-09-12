import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User as UserIcon, Loader2 } from "lucide-react";
import type { Message } from "../types";

interface MessageListProps {
  messages: Message[];
  isProcessing: boolean;
  statusMessage: string | null;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isProcessing,
  statusMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusMessage]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-cyan-400">
            <Bot className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-zinc-300">Start a conversation with AmbientAI</p>
          <p className="text-xs text-zinc-500 max-w-sm mt-1">
            Ask questions, search knowledge via pgvector RAG, or execute tasks guarded by HITL approval.
          </p>
        </div>
      )}

      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-3xl ${
              isUser ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isUser
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                  : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              }`}
            >
              {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                isUser
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 rounded-tl-none prose prose-invert max-w-none"
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        );
      })}

      {/* Thinking / Status Banner */}
      {isProcessing && statusMessage && (
        <div className="flex items-center gap-2.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-full w-fit animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
