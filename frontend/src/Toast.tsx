import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Floating Sonner-Style Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between space-x-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-zinc-900/95 text-zinc-100 shadow-emerald-500/10"
                : toast.type === "error"
                ? "border-rose-500/30 bg-zinc-900/95 text-zinc-100 shadow-rose-500/10"
                : "border-zinc-700/60 bg-zinc-900/95 text-zinc-100 shadow-cyan-500/10"
            }`}
          >
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="shrink-0">
                {toast.type === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                {toast.type === "error" && (
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                )}
                {toast.type === "info" && (
                  <Info className="h-4 w-4 text-sky-400" />
                )}
              </div>
              <span className="text-xs font-medium text-zinc-200 leading-snug break-words">
                {toast.message}
              </span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition shrink-0 ml-2"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
};
