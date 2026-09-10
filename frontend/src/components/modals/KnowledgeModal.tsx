import React, { useState, useRef } from "react";
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
} from "lucide-react";
import { uploadKnowledgeFile, queryKnowledgeBase } from "../../api";
import { useToast } from "../../Toast";

interface KnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KnowledgeModal: React.FC<KnowledgeModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"upload" | "search">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Search Tab State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchSearched, setSearchSearched] = useState(false);

  if (!isOpen) return null;

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
      const res = await uploadKnowledgeFile(selectedFile);
      setUploadResult(res.data);
      showToast(`Successfully indexed '${selectedFile.name}' into vector store!`, "success");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to upload document.";
      setUploadError(msg);
      showToast(msg, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchSearched(true);
    try {
      const res = await queryKnowledgeBase(searchQuery, 4);
      setSearchResults(res.results || []);
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Search query failed.", "error");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Knowledge Base & PDF RAG
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                  pgvector
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Upload PDFs or documentation to index vector embeddings for agent retrieval.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-800 bg-zinc-950/20">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === "upload"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === "search"
                ? "border-purple-400 text-purple-300"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Test Semantic Search</span>
          </button>
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
                    ? "border-purple-500/50 bg-purple-500/5"
                    : "border-zinc-700/60 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-950/70"
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
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center text-purple-400 shadow-sm">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {selectedFile ? (
                        <span className="text-purple-300 font-semibold">{selectedFile.name}</span>
                      ) : (
                        "Click to browse or drag & drop a PDF document"
                      )}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Supports PDF (.pdf), Text (.txt), Markdown (.md)
                    </p>
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-400" />
                    <div>
                      <p className="text-xs font-medium text-white truncate max-w-xs">{selectedFile.name}</p>
                      <p className="text-[11px] text-zinc-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Indexing Chunks...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Embed & Index</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Document Indexed Successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-200/90 pt-1 font-mono">
                    <div>Filename: {uploadResult.filename}</div>
                    <div>Vector Chunks: {uploadResult.chunks_count}</div>
                    <div>Characters: {uploadResult.total_characters}</div>
                    <div>Storage: PostgreSQL pgvector</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "search" && (
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask a question or enter keywords to test vector similarity..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-700/80 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Search</span>
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-zinc-400 font-mono">
                    Found {searchResults.length} matching vector chunks:
                  </p>
                  {searchResults.map((r, i) => (
                    <div key={i} className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-purple-400 font-mono">
                        <span>Source: {r.metadata?.source || "internal_doc"}</span>
                        <span>Chunk #{r.metadata?.chunk_index ?? i}</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {searchSearched && searchResults.length === 0 && !isSearching && (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  No matching vector chunks found for this query.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/50 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Indexed files are automatically available to the agent via `knowledge_base_retrieval`</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
