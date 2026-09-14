import React from "react";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface ApprovalPromptProps {
  prompt: string;
  onApprove: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}

export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({
  prompt,
  onApprove,
  onReject,
  isProcessing = false,
}) => {
  return (
    <div className="my-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-lg backdrop-blur-md animate-fade-in max-w-xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-300">
            Human-in-the-Loop Approval Required
          </h4>
          <p className="text-sm text-zinc-300 mt-1 leading-relaxed">
            {prompt}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              Approve & Execute
            </button>
            <button
              onClick={onReject}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-300 border border-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
