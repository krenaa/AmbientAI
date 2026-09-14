import React, { useState, useRef, useEffect } from "react";
import {
  X,
  FileText,
  UploadCloud,
  CheckCircle2,
  Search,
  Layers,
  Database,
  Loader2,
  AlertCircle,
  Sparkles,
  Trash2,
  RefreshCw,
  FolderOpen,
  MessageSquare,
} from "lucide-react";
import {
  uploadKnowledgeFile,
  queryKnowledgeBase,
  fetchKnowledgeDocuments,
  deleteKnowledgeDocument,
  clearKnowledgeDocuments,
} from "../../api";
import { useToast } from "../../Toast";

interface KnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  onSelectDocumentForPrompt?: (filename: string) => void;
  onDocumentUploaded?: (filename: string) => void;
}

interface IndexedDoc {
  filename: string;
  chunks_count: number;
  uploaded_at: string;
}

export const KnowledgeModal: React.FC<KnowledgeModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  onSelectDocumentForPrompt,
  onDocumentUploaded,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"upload" | "history" | "search">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Document History State
  const [documents, setDocuments] = useState<IndexedDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Search Tab State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchSearched, setSearchSearched] = useState(false);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetchKnowledgeDocuments();
      if (res && res.documents) {
        setDocuments(res.documents);
      }
    } catch (err: any) {
      console.error("Failed to load knowledge documents:", err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCloseModal = () => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    setSelectedFile(null);
    setUploadResult(null);
    setUploadError(null);
    setSearchQuery("");
    setSearchResults([]);
    setSearchSearched(false);
    setIsSearching(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadError(null);
      setUploadResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setUploadError(null);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await uploadKnowledgeFile(selectedFile, conversationId);
      setUploadResult(res.data);
      showToast(`Successfully indexed '${selectedFile.name}' into vector store!`, "success");
      if (onDocumentUploaded) {
        onDocumentUploaded(selectedFile.name);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDocuments();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to upload document.";
      setUploadError(msg);
      showToast(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (filename: string) => {
    setDeletingFile(filename);
    try {
      const res = await deleteKnowledgeDocument(filename);
      showToast(res.message || `Deleted '${filename}' from vector store`, "success");
      loadDocuments();
      if (selectedSourceFilter === filename) {
        setSelectedSourceFilter("");
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to delete document.";
      showToast(msg, "error");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to clear ALL indexed documents from pgvector?")) {
      return;
    }
    setIsClearingAll(true);
    try {
      const res = await clearKnowledgeDocuments();
      showToast(res.message || "Knowledge base cleared successfully.", "success");
      setDocuments([]);
      setSearchResults([]);
      setSelectedSourceFilter("");
      setUploadResult(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to clear knowledge base.";
      showToast(msg, "error");
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleAskAboutDoc = (filename: string) => {
    if (onSelectDocumentForPrompt) {
      onSelectDocumentForPrompt(filename);
    }
    handleCloseModal();
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    searchAbortControllerRef.current = new AbortController();

    setIsSearching(true);
    setSearchSearched(true);
    try {
      const res = await queryKnowledgeBase(
        searchQuery.trim(),
        4,
        selectedSourceFilter || undefined
      );
      setSearchResults(res.results || []);
    } catch (err: any) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        showToast(err.response?.data?.detail || "Search query failed.", "error");
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#FAF5E8] border border-[#D8C7B4] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#1C120C]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D8C7B4] bg-[#F2E9DC]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#EAE0D2] border border-[#D8C7B4] text-[#B84328]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1C120C] flex items-center gap-2">
                Knowledge Base & PDF RAG
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#EAE0D2] border border-[#D8C7B4] text-[#B84328] font-bold">
                  pgvector
                </span>
              </h2>
              <p className="text-xs text-[#584134]">
                Upload PDFs or documentation to index vector embeddings for agent retrieval.
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1.5 rounded-lg text-[#584134] hover:text-[#1C120C] hover:bg-[#EAE0D2] transition-all cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 pt-3 border-b border-[#D8C7B4] bg-[#EFE3D3]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab("upload");
                setUploadResult(null);
                setUploadError(null);
              }}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "upload"
                  ? "border-[#B84328] text-[#B84328]"
                  : "border-transparent text-[#584134] hover:text-[#1C120C]"
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Document</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                loadDocuments();
              }}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "history"
                  ? "border-[#B84328] text-[#B84328]"
                  : "border-transparent text-[#584134] hover:text-[#1C120C]"
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Document History</span>
              {documents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#FAF5E8] border border-[#D8C7B4] text-[#B84328] font-mono font-bold">
                  {documents.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === "search"
                  ? "border-[#B84328] text-[#B84328]"
                  : "border-transparent text-[#584134] hover:text-[#1C120C]"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Test Semantic Search</span>
            </button>
          </div>
          {documents.length > 0 && activeTab === "history" && (
            <button
              onClick={handleClearAll}
              disabled={isClearingAll}
              className="text-[11px] text-rose-700 hover:text-rose-800 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "upload" && (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? "border-[#B84328] bg-[#F4ECE0]"
                    : "border-[#C59B82] hover:border-[#B84328] bg-[#F4ECE0]/80 hover:bg-[#EAE0D2]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#EAE0D2] border border-[#D8C7B4] flex items-center justify-center text-[#B84328] shadow-sm">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1C120C]">
                      {selectedFile ? (
                        <span className="text-[#B84328] font-bold">{selectedFile.name}</span>
                      ) : (
                        "Click to browse or drag & drop a PDF document"
                      )}
                    </p>
                    <p className="text-xs text-[#584134] mt-1 font-medium">
                      Supports PDF (.pdf), Text (.txt), Markdown (.md)
                    </p>
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] shadow-xs">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[#B84328]" />
                    <div>
                      <p className="text-xs font-bold text-[#1C120C] truncate max-w-xs">{selectedFile.name}</p>
                      <p className="text-[11px] text-[#584134] font-medium">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B84328] hover:bg-[#A53920] disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-[#B84328]/25 transition-all cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span className="text-white font-bold">Indexing Chunks...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                        <span className="text-white font-bold">Embed & Index</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-950 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadResult && (
                <div className="p-4 rounded-xl bg-[#E2F1E8] border border-[#86C9A2] text-[#0E3E22] space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-[#0E3E22]">
                      <CheckCircle2 className="w-4 h-4 text-[#1B7C47]" />
                      <span>Document Indexed Successfully!</span>
                    </div>
                    <button
                      onClick={() => setUploadResult(null)}
                      className="text-xs text-[#1B7C47] hover:text-[#0E3E22] underline cursor-pointer font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-[#0E3E22] pt-1 font-mono font-semibold">
                    <div>Filename: {uploadResult.filename}</div>
                    <div>Vector Chunks: {uploadResult.chunks_count}</div>
                    <div>Characters: {uploadResult.total_characters}</div>
                    <div>Storage: PostgreSQL pgvector</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#584134] font-medium">
                  Manage indexed documents and click <span className="text-[#B84328] font-bold">"Ask Agent"</span> to chat about specific PDF contents.
                </p>
                <button
                  onClick={loadDocuments}
                  disabled={isLoadingDocs}
                  className="p-1.5 rounded-lg text-[#584134] hover:text-[#1C120C] hover:bg-[#EAE0D2] transition-all cursor-pointer"
                  title="Refresh document list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? "animate-spin" : ""}`} />
                </button>
              </div>

              {isLoadingDocs && documents.length === 0 && (
                <div className="flex items-center justify-center py-12 text-[#584134] gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[#B84328]" />
                  <span>Loading indexed documents...</span>
                </div>
              )}

              {!isLoadingDocs && documents.length === 0 && (
                <div className="text-center py-12 border border-dashed border-[#D8C7B4] bg-[#F4ECE0]/50 rounded-2xl p-8 space-y-2">
                  <FolderOpen className="w-8 h-8 mx-auto text-[#7C6355]" />
                  <p className="text-xs font-bold text-[#1C120C]">No documents indexed yet</p>
                  <p className="text-[11px] text-[#584134]">
                    Upload a PDF or text file in the "Upload Document" tab to index knowledge into pgvector.
                  </p>
                </div>
              )}

              {documents.length > 0 && (
                <div className="space-y-2.5">
                  {documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] hover:border-[#B84328]/40 transition-all shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[#EAE0D2] text-[#B84328]">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#1C120C]">{doc.filename}</p>
                          <div className="flex items-center gap-3 text-[11px] text-[#584134] font-mono mt-0.5">
                            <span>{doc.chunks_count} chunks</span>
                            {doc.uploaded_at && (
                              <span>
                                {new Date(doc.uploaded_at).toLocaleDateString()}{" "}
                                {new Date(doc.uploaded_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAskAboutDoc(doc.filename)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF5E8] hover:bg-[#EAE0D2] border border-[#B84328]/50 text-[#B84328] text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                          title={`Ask questions about ${doc.filename}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-[#B84328]" />
                          <span>Ask Agent</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedSourceFilter(doc.filename);
                            setActiveTab("search");
                          }}
                          className="p-1.5 rounded-lg text-[#584134] hover:text-[#1C120C] hover:bg-[#EAE0D2] transition-all cursor-pointer"
                          title={`Filter search to ${doc.filename}`}
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteDocument(doc.filename)}
                          disabled={deletingFile === doc.filename}
                          className="p-1.5 rounded-lg text-[#7C6355] hover:text-rose-700 hover:bg-rose-100 transition-all cursor-pointer disabled:opacity-50"
                          title={`Delete ${doc.filename} from vector store`}
                        >
                          {deletingFile === doc.filename ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "search" && (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (isSearching) {
                        if (searchAbortControllerRef.current) {
                          searchAbortControllerRef.current.abort();
                        }
                        setIsSearching(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="Ask a question or enter keywords to test vector similarity..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-[#D8C7B4] text-[#1C120C] text-xs placeholder:text-[#7C6355] focus:outline-none focus:border-[#B84328] font-medium"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#B84328] hover:bg-[#A53920] disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-[#B84328]/20"
                  >
                    {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Search className="w-3.5 h-3.5 text-white" />}
                    <span className="text-white font-bold">Search</span>
                  </button>
                </div>

                {documents.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-[#584134] font-medium">
                    <span>Filter Source:</span>
                    <select
                      value={selectedSourceFilter}
                      onChange={(e) => setSelectedSourceFilter(e.target.value)}
                      className="bg-white border border-[#D8C7B4] rounded-lg px-2.5 py-1 text-xs text-[#1C120C] focus:outline-none focus:border-[#B84328] font-medium"
                    >
                      <option value="">All Indexed Documents ({documents.length})</option>
                      {documents.map((d, i) => (
                        <option key={i} value={d.filename}>
                          {d.filename} ({d.chunks_count} chunks)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </form>

              {searchResults.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-[#584134] font-mono font-semibold">
                    Found {searchResults.length} matching vector chunks:
                  </p>
                  {searchResults.map((r, i) => (
                    <div key={i} className="p-4 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-1.5 shadow-xs">
                      <div className="flex items-center justify-between text-[11px] text-[#B84328] font-mono font-bold">
                        <span>Source: {r.metadata?.source || "internal_doc"}</span>
                        <span>Chunk #{r.metadata?.chunk_index ?? i}</span>
                      </div>
                      <p className="text-xs text-[#1C120C] leading-relaxed">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {searchSearched && searchResults.length === 0 && !isSearching && (
                <div className="text-center py-8 text-[#7C6355] text-xs font-medium">
                  No matching vector chunks found for this query in the selected scope.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#D8C7B4] bg-[#F2E9DC] flex items-center justify-between text-[11px] text-[#584134] font-medium">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-[#B84328]" />
            <span>Indexed files are automatically available to the agent via `knowledge_base_retrieval`</span>
          </div>
          <button
            onClick={handleCloseModal}
            className="px-3.5 py-1.5 rounded-lg bg-[#EAE0D2] hover:bg-[#D8C7B4] text-[#1C120C] text-xs font-bold border border-[#D8C7B4] transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
