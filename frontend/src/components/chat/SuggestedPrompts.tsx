import React from "react";
import { Search, Database, Calculator, ShieldAlert, Sparkles, ArrowUpRight } from "lucide-react";

interface SuggestedPromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

interface PromptCard {
  title: string;
  category: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  prompt: string;
}

const SUGGESTED_PROMPTS: PromptCard[] = [
  {
    title: "Live Web Intelligence",
    category: "Search & Synthesize",
    badge: "Tavily Search",
    badgeColor: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    icon: <Search className="w-4 h-4 text-sky-400" />,
    prompt: "Search the web for the latest advancements in LangGraph agent workflows and multi-agent coordination in 2025.",
  },
  {
    title: "Knowledge Base RAG",
    category: "Semantic pgvector Retrieval",
    badge: "pgvector RAG",
    badgeColor: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    icon: <Database className="w-4 h-4 text-purple-400" />,
    prompt: "Retrieve enterprise policies regarding cloud infrastructure security and automated human-in-the-loop approvals.",
  },
  {
    title: "Deterministic AST Math",
    category: "Safe Expression Evaluation",
    badge: "AST Engine",
    badgeColor: "border-pink-500/30 bg-pink-500/10 text-pink-400",
    icon: <Calculator className="w-4 h-4 text-pink-400" />,
    prompt: "Calculate compound interest: Principal = $150,000, rate = 5.25% annually compounded monthly for 8 years.",
  },
  {
    title: "Human-in-the-Loop Action",
    category: "Sensitive Guardrail Trigger",
    badge: "HITL Guardrail",
    badgeColor: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
    prompt: "Initiate database disaster recovery failover and rotate production JWT signing keys.",
  },
];

export const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ onSelectPrompt }) => {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 px-1">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <span>Quick Start Prompts</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SUGGESTED_PROMPTS.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onSelectPrompt(item.prompt)}
            className="group relative p-4 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 hover:shadow-xl transition-all duration-200 cursor-pointer text-left select-none flex flex-col justify-between overflow-hidden"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 group-hover:border-zinc-700 transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                    {item.title}
                  </span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                  {item.badge}
                </span>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed group-hover:text-zinc-300 transition-colors">
                "{item.prompt}"
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 text-[11px] text-zinc-500 group-hover:text-cyan-400 transition-colors font-medium">
              <span>{item.category}</span>
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
