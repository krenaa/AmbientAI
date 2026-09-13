import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Paperclip,
  Cpu,
  ChevronDown,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useWebSocket } from "../hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { KnowledgeModal } from "./modals/KnowledgeModal";
import { fetchAvailableModels } from "../api";
import type { ModelOption } from "../types";

interface ChatWindowProps {
  conversationId: string;
  conversationTitle?: string;
  onRename?: (newTitle: string) => void;
  onDelete?: () => void;
  onMessageSent?: (conversationId: string, promptText: string) => void;
  onDocumentUploaded?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationId,
  conversationTitle,
  onRename,
  onDelete,
  onMessageSent,
  onDocumentUploaded,
}) => {
  const [inputText, setInputText] = useState("");
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [headerTitle, setHeaderTitle] = useState(conversationTitle || "New Chat");

  // Dynamic Models State
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("llama-3.3-70b-versatile");
  const [modelsTimestamp, setModelsTimestamp] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHeaderTitle(conversationTitle || "New Chat");
  }, conversationTitle ? [conversationTitle] : []);

  const handleSaveHeaderTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (headerTitle.trim() && onRename) {
      onRename(headerTitle.trim());
    }
    setIsEditingTitle(false);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    if (isModelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isModelDropdownOpen]);

  // Load models from API
  const loadModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const res = await fetchAvailableModels();
      if (res && res.models && res.models.length > 0) {
        setModels(res.models);
        setModelsTimestamp(res.timestamp || new Date().toISOString());
        // If current model not present, fallback to default or first
        setSelectedModel((current) => {
          if (res.models.some((m) => m.id === current)) return current;
          const def = res.models.find((m) => m.is_default) || res.models[0];
          return def.id;
        });
      }
    } catch (err) {
      console.warn("Could not load dynamic models:", err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Handle automated fallback from backend
  const handleModelFallback = useCallback((suggestedModel: string) => {
    setSelectedModel(suggestedModel);
  }, []);

  const {
    messages,
    isLoadingHistory,
    isConnected,
    isProcessing,
    statusMessage,
    hitlApproval,
    sendMessage,
    sendApproval,
  } = useWebSocket(conversationId, handleModelFallback);

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
    sendMessage(text, selectedModel);
    setInputText("");

    const refTitle = text.length > 35 ? text.slice(0, 35).trim() + "..." : text;
    if (!conversationTitle || conversationTitle === "New Chat" || conversationTitle === "Conversation") {
      setHeaderTitle(refTitle);
    }
    if (onMessageSent) {
      onMessageSent(conversationId, refTitle);
    }
  };

  const selectedModelObj = models.find((m) => m.id === selectedModel);

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
                <span className="text-sm font-semibold text-white max-w-[140px] sm:max-w-xs md:max-w-md truncate">
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

          <div className="hidden lg:flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              pgvector RAG + WebSockets
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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

      {/* Input Bar with Model Dropdown & Upload PDF INSIDE message box */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md shrink-0 relative z-30">
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

          <form onSubmit={handleSend} className="space-y-2">
            <div className="rounded-2xl bg-zinc-900/90 border border-zinc-700/60 p-3 focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all shadow-inner">
              {/* Text Input Area */}
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  hitlApproval
                    ? "Action paused: Please respond to approval prompt above..."
                    : isProcessing
                    ? `Generating answer using ${selectedModelObj?.name || selectedModel}...`
                    : `Ask with ${selectedModelObj?.name || selectedModel}... (e.g. search web, pgvector RAG, AST math)`
                }
                disabled={isProcessing || !!hitlApproval}
                className="w-full bg-transparent py-1 text-sm text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />

              {/* Bottom Toolbar inside Message Box */}
              <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-zinc-800/80">
                <div className="flex items-center gap-2 relative">
                  {/* Model Dropdown inside Message Box */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 text-xs font-medium border border-zinc-700/70 shadow-sm transition-all cursor-pointer group"
                      title="Select Active Model (Probed Live)"
                    >
                      <Cpu className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 transition-colors shrink-0" />
                      <span className="font-semibold text-white max-w-[130px] sm:max-w-[200px] truncate">
                        {selectedModelObj?.name || selectedModel}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                          isModelDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Popover Dropdown - opens UPWARDS with z-[100] so it floats on top of messages */}
                    {isModelDropdownOpen && (
                      <div className="absolute bottom-full left-0 mb-2.5 w-80 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-[0_-10px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-[100] p-2 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="text-xs font-bold text-white uppercase tracking-wider">
                                Active Models
                              </span>
                            </div>
                            {modelsTimestamp && (
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                Live as of {new Date(modelsTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadModels();
                            }}
                            disabled={isLoadingModels}
                            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Re-probe Live Availability"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isLoadingModels ? "animate-spin text-cyan-400" : ""}`}
                            />
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto py-1 space-y-1">
                          {models.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-500">
                              {isLoadingModels ? "Probing models..." : "No live models found"}
                            </div>
                          ) : (
                            models.map((m) => {
                              const isSelected = m.id === selectedModel;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedModel(m.id);
                                    setIsModelDropdownOpen(false);
                                    toast.success(`Active Model: ${m.name}`, { id: "model-switch-toast" });
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-cyan-500/15 text-white border border-cyan-500/40"
                                      : "text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
                                  }`}
                                >
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold truncate">{m.name}</span>
                                      {m.is_default && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-medium">
                                          Default
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-zinc-500 truncate font-mono">
                                      {m.provider.toUpperCase()} • {m.id}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      Live
                                    </span>
                                    {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Upload PDF Button inside Message Box */}
                  <button
                    type="button"
                    onClick={() => setShowKnowledgeModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 hover:text-purple-300 text-xs font-medium border border-zinc-700/70 shadow-sm transition-all cursor-pointer"
                    title="Upload and Index PDF / Document"
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                    <span>Upload PDF</span>
                  </button>

                  {/* Paperclip quick attach inside Message Box */}
                  <button
                    type="button"
                    onClick={() => setShowKnowledgeModal(true)}
                    className="p-1.5 text-zinc-400 hover:text-purple-400 rounded-lg hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0"
                    title="Attach PDF or Document to Knowledge Base"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isProcessing || !!hitlApproval}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium shadow-md shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0"
                  title={isProcessing ? "Agent is processing..." : `Send with ${selectedModelObj?.name || selectedModel}`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <>
                      <span className="text-xs font-semibold">Send</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* PDF Document Upload & Knowledge Modal */}
      <KnowledgeModal
        isOpen={showKnowledgeModal}
        onClose={() => setShowKnowledgeModal(false)}
        conversationId={conversationId}
        onSelectDocumentForPrompt={(filename) => {
          setInputText(`Regarding the document "${filename}", please analyze: `);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        onDocumentUploaded={() => {
          if (onDocumentUploaded) {
            onDocumentUploaded();
          }
        }}
      />
    </div>
  );
};
