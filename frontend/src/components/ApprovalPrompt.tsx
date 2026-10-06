import React from "react";
import { CheckCircle, XCircle, ShieldAlert, Terminal } from "lucide-react";

interface ApprovalPromptProps {
  prompt: string;
  toolName?: string;
  target?: string;
  payload?: Record<string, any>;
  onApprove: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}

export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({
  prompt,
  toolName,
  target,
  payload,
  onApprove,
  onReject,
  isProcessing = false,
}) => {
  // Extract details if not explicitly passed
  let displayTool = toolName;
  let displayTarget = target;
  let displayPayload = payload;

  if (!displayTool && prompt.includes("Action:")) {
    const match = prompt.match(/Action:\s*([^\n]+)/);
    if (match) displayTool = match[1].trim();
  }
  if (!displayTarget && prompt.includes("Target")) {
    const match = prompt.match(/Target[^:]*:\s*([^\n]+)/);
    if (match) displayTarget = match[1].trim();
  }
  if (!displayPayload && prompt.includes("Payload:")) {
    try {
      const jsonStr = prompt.split("Payload:")[1]?.trim();
      if (jsonStr) displayPayload = JSON.parse(jsonStr);
    } catch {}
  }

  return (
    <div className="my-4 p-5 rounded-2xl bg-[#FAF5E8] border border-[#D8C7B4] shadow-xl text-left max-w-xl mx-auto space-y-4 animate-fade-in text-[#261912]">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-[#D8C7B4]/60">
        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-800">
          <ShieldAlert className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#1C120C]">
            Human-in-the-Loop Approval Required
          </h4>
          <p className="text-[11px] text-[#584134]">
            The agent is requesting authorization to execute a state-changing action.
          </p>
        </div>
      </div>

      {/* Action & Target details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-[#584134] tracking-wider">Tool Action</span>
          <div className="font-mono font-bold text-[#B84328] text-xs">
            {displayTool || "External Action"}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-[#584134] tracking-wider">Target / Recipient</span>
          <div className="font-mono font-semibold text-[#183E6C] text-xs truncate">
            {displayTarget || "Team / System"}
          </div>
        </div>
      </div>

      {/* Full Payload Box */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#584134]">
          <Terminal className="w-3.5 h-3.5 text-[#584134]" />
          <span>Full Action Payload:</span>
        </div>
        <pre className="p-3 rounded-xl bg-[#1C120C] text-[#EFE3D3] text-xs font-mono overflow-x-auto max-h-40 scrollbar-thin border border-zinc-800">
          {displayPayload ? JSON.stringify(displayPayload, null, 2) : prompt}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onApprove}
          disabled={isProcessing}
          className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          <span>Approve & Execute</span>
        </button>
        <button
          onClick={onReject}
          disabled={isProcessing}
          className="py-2.5 px-4 rounded-xl bg-[#EFE3D3] hover:bg-rose-100 text-rose-800 hover:text-rose-900 border border-[#D8C7B4] hover:border-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
        >
          <XCircle className="w-4 h-4" />
          <span>Reject</span>
        </button>
      </div>
    </div>
  );
};
