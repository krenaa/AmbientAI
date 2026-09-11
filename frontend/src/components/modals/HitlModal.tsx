import React, { useState } from "react";
import { X, ShieldAlert, CheckCircle2, XCircle, Loader2, MessageSquare } from "lucide-react";
import type { AgentTask } from "../../types";

interface HitlModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: AgentTask | null;
  onDecide: (taskId: string, approved: boolean, feedback?: string) => Promise<void>;
}

export const HitlModal: React.FC<HitlModalProps> = ({
  isOpen,
  onClose,
  task,
  onDecide,
}) => {
  const [feedback, setFeedback] = useState("");
  const [submittingAction, setSubmittingAction] = useState<"approve" | "reject" | null>(null);

  if (!isOpen || !task) return null;

  const isSubmitting = submittingAction !== null;

  const handleAction = async (approved: boolean) => {
    setSubmittingAction(approved ? "approve" : "reject");
    try {
      await onDecide(task.id, approved, feedback.trim() || undefined);
      onClose();
    } catch {
      // Handled in caller toast
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div
        className="fixed inset-0 cursor-pointer"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-3xl bg-zinc-950 border border-amber-500/30 p-6 sm:p-8 shadow-2xl z-10 space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close approval dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Human-in-the-Loop Review
            </h3>
            <p className="text-xs text-amber-400/90 font-medium">
              Sensitive action checkpoint triggered
            </p>
          </div>
        </div>

        {/* Task Details */}
        <div className="space-y-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">
              Prompt
            </span>
            <p className="text-zinc-200">{task.prompt}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
            <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px]">
              Guardrail Condition
            </span>
            <p className="text-amber-200">
              {task.approval_prompt || "This pipeline branch requested explicit human sign-off before proceeding."}
            </p>
          </div>
        </div>

        {/* Feedback Input */}
        <div className="space-y-1.5 text-xs">
          <label className="text-zinc-400 font-medium flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Optional Guidance / Reasoning for Agent</span>
          </label>
          <textarea
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g., Proceed with failover, but make sure to log timestamp to audit trail."
            className="w-full p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 resize-none text-xs"
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleAction(false)}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-rose-500/15 border border-zinc-800 hover:border-rose-500/40 text-rose-300 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            {submittingAction === "reject" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                <span>Rejecting...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Reject Action</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleAction(true)}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {submittingAction === "approve" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve Action</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
