import React, { useState } from "react";
import { Send, Sparkles, Wifi, WifiOff, FileText, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import { useWebSocket } from "../hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { ingestDocument } from "../services/api";

interface ChatWindowProps {
  conversationId: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId }) => {
  const [inputText, setInputText] = useState("");
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);

  const {
    messages,
    isConnected,
    isProcessing,
    statusMessage,
    hitlApproval,
    sendMessage,
    sendApproval,
  } = useWebSocket(conversationId);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    sendMessage(inputText.trim());
    setInputText("");
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
      {/* Top Header */}
      <header className="h-14 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-900/30 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">LangGraph HITL Core</span>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            pgvector RAG + WebSockets
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowIngestModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700/60"
            title="Ingest Knowledge Document"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ingest Document</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-full border border-zinc-800">
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="text-rose-400 font-medium">Connecting...</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <MessageList
        messages={messages}
        isProcessing={isProcessing}
        statusMessage={statusMessage}
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
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl bg-zinc-900/90 border border-zinc-700/60 px-3 py-1.5 focus-within:border-cyan-500 transition-colors shadow-inner">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                hitlApproval
                  ? "Action paused: Please respond to approval prompt above..."
                  : "Type a prompt (e.g. 'delete temp table' for HITL, or ask anything)..."
              }
              disabled={isProcessing || !!hitlApproval}
              className="flex-1 bg-transparent py-1 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing || !!hitlApproval}
            className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium shadow-md shadow-cyan-500/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
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
