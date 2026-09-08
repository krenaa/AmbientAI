import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Search,
  Database,
  Calculator,
  ShieldAlert,
  Cpu,
  Layers,
  CheckCircle2,
  Code2
} from "lucide-react";
import type { TaskExecutionLog } from "../../types";
import { getNodeBadgeStyle } from "../../utils/theme";

interface ReasoningTraceProps {
  logs?: TaskExecutionLog[];
  isProcessing?: boolean;
}

export const ReasoningTrace: React.FC<ReasoningTraceProps> = ({ logs = [], isProcessing = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  if (!logs || logs.length === 0) return null;

  const getNodeIcon = (iconType: string) => {
    switch (iconType) {
      case "search":
        return <Search className="w-3.5 h-3.5 text-sky-400" />;
      case "database":
        return <Database className="w-3.5 h-3.5 text-purple-400" />;
      case "calc":
        return <Calculator className="w-3.5 h-3.5 text-pink-400" />;
      case "shield":
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
      case "sparkles":
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
      case "triage":
        return <Layers className="w-3.5 h-3.5 text-indigo-400" />;
      default:
        return <Cpu className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-md overflow-hidden transition-all duration-200 shadow-sm">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/40 transition-colors text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-white/[0.08] flex items-center justify-center">
            {isProcessing ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
              </span>
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">
              Agent Thought & Graph Flow
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-white/[0.05]">
              {logs.length} step{logs.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-xs font-medium">
          <span>{isOpen ? "Collapse" : "View steps"}</span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3.5 pt-1 space-y-2 border-t border-white/[0.06] bg-zinc-950/40">
          <div className="relative pl-3 border-l border-zinc-800 space-y-3 ml-2 my-2">
            {logs.map((log, index) => {
              const nodeInfo = getNodeBadgeStyle(log.node_name);
              const logKey = log.id || `${log.node_name}-${index}`;
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
              const isDetailsExpanded = expandedLogId === logKey;

              return (
                <div key={logKey} className="relative group">
                  {/* Step Timeline Indicator */}
                  <div className="absolute -left-[19px] top-1.5 w-3 h-3 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-cyan-400" />
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-zinc-900/60 p-3 space-y-1.5 hover:border-white/[0.12] transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-zinc-800/80 border border-white/[0.06]">
                          {getNodeIcon(nodeInfo.icon)}
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${nodeInfo.badge}`}>
                          {nodeInfo.label}
                        </span>
                      </div>

                      {hasMetadata && (
                        <button
                          onClick={() => setExpandedLogId(isDetailsExpanded ? null : logKey)}
                          className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-cyan-300 font-mono cursor-pointer transition-colors"
                        >
                          <Code2 className="w-3 h-3" />
                          <span>{isDetailsExpanded ? "Hide payload" : "Inspect"}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed pl-0.5">
                      {log.message}
                    </p>

                    {isDetailsExpanded && hasMetadata && (
                      <div className="mt-2 p-2.5 rounded-lg bg-zinc-950/90 border border-white/[0.08] text-[11px] text-zinc-400 font-mono overflow-x-auto">
                        <pre className="text-zinc-300">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
