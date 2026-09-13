import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  FileText,
  Upload,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useWebSocket } from "../hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { ingestDocument } from "../services/api";

interface ChatWindowProps {
  conversationId: string;
  conversationTitle?: string;
  onRename?: (newTitle: string) => void;
  onDelete?: () => void;
  onMessageSent?: (conversationId: string, promptText: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  conversationTitle,
  onRename,
  onDelete,
  onMessageSent,
}) => {
  const [inputText, setInputText] = useState("");
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [headerTitle, setHeaderTitle] = useState(conversationTitle || "New Chat");

  useEffect(() => {
    setHeaderTitle(conversationTitle || "New Chat");
  }, [conversationTitle]);

  const handleSaveHeaderTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (headerTitle.trim() && onRename) {
      onRename(headerTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const {
    messages,
    isLoadingHistory,
    isConnected,
    isProcessing,
    statusMessage,
    hitlApproval,
    sendMessage,
    sendApproval,
  } = useWebSocket(conversationId);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleResubmitPrompt = (promptText: string) => {
    setInputText(promptText);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    const text = inputText.trim();
    sendMessage(text);
    setInputText("");

    const refTitle = text.length > 35 ? text.slice(0, 35).trim() + "..." : text;
    if (!conversationTitle || conversationTitle === "New Chat" || conversationTitle === "Conversation") {
      setHeaderTitle(refTitle);
    }
    if (onMessageSent) {
      onMessageSent(conversationId, refTitle);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;
    setIsIngesting(true);
    try {
      const res = await ingestDocument(ingestText.trim(), "knowledge-base");
      toast.success(`Ingested ${res.chunk_count || 1} chunks into pgvector!`);
      setShowIngestModal(false);
      setIngestText("");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to ingest document");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Top Header matching previous version UI */}
      <header className="h-14 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-900/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
            {isEditingTitle ? (
              <form onSubmit={handleSaveHeaderTitle} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  autoFocus
                  className="px-2 py-0.5 text-sm bg-zinc-800 border border-cyan-500 rounded text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                  title="Save Title"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-white max-w-[160px] sm:max-w-xs md:max-w-md truncate">
                  {headerTitle}
                </span>
                {onRename && (
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="p-1 text-zinc-400 hover:text-cyan-400 rounded transition-colors cursor-pointer"
                    title="Rename Chat"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="p-1 text-zinc-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              pgvector RAG + WebSockets
            </span>
            <span className="hidden lg:inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              FastAPI • LangGraph
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowIngestModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 shadow-sm"
            title="Ingest Knowledge Document"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Ingest Document</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-900/90 px-2.5 py-1 rounded-full border border-zinc-800 shadow-sm">
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-medium">Live</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-amber-400 font-medium">Syncing...</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Messages with Resubmit & MarkdownRenderer */}
      <MessageList
        messages={messages}
        isLoadingHistory={isLoadingHistory}
        isProcessing={isProcessing}
        statusMessage={statusMessage}
        onResubmitPrompt={handleResubmitPrompt}
      />

      {/* HITL Approval Prompt (if active) */}
      {hitlApproval && (
        <div className="px-6 pb-2">
          <ApprovalPrompt
            prompt={hitlApproval.prompt}
            onApprove={() => sendApproval("approved")}
            onReject={() => sendApproval("rejected")}
            isProcessing={isProcessing}
          />
        </div>
      )}

      {/* Input Bar */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Subtle Capabilities Pill List */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 px-0.5">
            <span className="text-zinc-500 text-[11px] font-medium mr-1">Modes:</span>
            <button
              type="button"
              onClick={() => handleResubmitPrompt("Search the live web for: ")}
              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-cyan-300 border border-zinc-700/60 text-[11px] transition-colors cursor-pointer"
            >
              Web Search
            </button>
            <button
              type="button"
              onClick={() => handleResubmitPrompt("Retrieve internal knowledge regarding ")}
              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-purple-300 border border-zinc-700/60 text-[11px] transition-colors cursor-pointer"
            >
              pgvector RAG
            </button>
            <button
              type="button"
              onClick={() => handleResubmitPrompt("Calculate the formula ")}
              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-emerald-300 border border-zinc-700/60 text-[11px] transition-colors cursor-pointer"
            >
              AST Math
            </button>
            <button
              type="button"
              onClick={() => handleResubmitPrompt("Send notification email to operations@ambientdesk.ai with subject 'Security Alert' and body 'Action executed'")}
              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-amber-300 border border-zinc-700/60 text-[11px] transition-colors cursor-pointer"
            >
              HITL Guardrail
            </button>
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-2xl bg-zinc-900/90 border border-zinc-700/60 px-4 py-2 focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all shadow-inner">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  hitlApproval
                    ? "Action paused: Please respond to approval prompt above..."
                    : isProcessing
                    ? "AmbientAI is executing workflow and reasoning..."
                    : "Ask AmbientDesk anything... e.g. search web, query pgvector knowledge base, calculate AST math"
                }
                disabled={isProcessing || !!hitlApproval}
                className="flex-1 bg-transparent py-1 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() || isProcessing || !!hitlApproval}
              className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium shadow-md shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
              title={isProcessing ? "Agent is processing..." : "Send Message"}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* RAG Ingest Modal */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl glass-panel p-6 border border-white/10 shadow-2xl">
            <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              Ingest Document into pgvector
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Enter any text knowledge to be chunked, embedded via Google Gemini, and stored in pgvector for semantic retrieval.
            </p>

            <form onSubmit={handleIngest}>
              <textarea
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                placeholder="Paste knowledge text here..."
                rows={6}
                required
                className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700/60 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 mb-4 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isIngesting || !ingestText.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isIngesting ? "Embedding & Storing..." : "Ingest Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
