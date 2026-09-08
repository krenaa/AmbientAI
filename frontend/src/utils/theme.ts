export interface CategoryTheme {
  border: string;
  glow: string;
  badgeBg: string;
  gradient: string;
  accentBar: string;
  label: string;
  iconColor: string;
  activeSidebar: string;
  heroBg: string;
}

export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  web_search: {
    border: "border-sky-500/20 hover:border-sky-500/40",
    glow: "shadow-sky-500/10",
    badgeBg: "bg-sky-500/10 border-sky-500/25 text-sky-300",
    gradient: "from-sky-400 via-blue-300 to-indigo-400",
    accentBar: "from-sky-500 via-blue-500 to-indigo-500",
    label: "Web Intelligence",
    iconColor: "text-sky-400",
    activeSidebar: "border-sky-500/40 bg-sky-500/[0.06] border-l-2 border-l-sky-400",
    heroBg: "from-sky-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  rag_retrieval: {
    border: "border-purple-500/20 hover:border-purple-500/40",
    glow: "shadow-purple-500/10",
    badgeBg: "bg-purple-500/10 border-purple-500/25 text-purple-300",
    gradient: "from-purple-400 via-pink-300 to-indigo-300",
    accentBar: "from-purple-500 via-indigo-500 to-blue-500",
    label: "pgvector Knowledge Base",
    iconColor: "text-purple-400",
    activeSidebar: "border-purple-500/40 bg-purple-500/[0.06] border-l-2 border-l-purple-400",
    heroBg: "from-purple-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  calculation: {
    border: "border-pink-500/20 hover:border-pink-500/40",
    glow: "shadow-pink-500/10",
    badgeBg: "bg-pink-500/10 border-pink-500/25 text-pink-300",
    gradient: "from-pink-400 via-rose-300 to-amber-300",
    accentBar: "from-pink-500 via-rose-500 to-orange-500",
    label: "Deterministic AST Math",
    iconColor: "text-pink-400",
    activeSidebar: "border-pink-500/40 bg-pink-500/[0.06] border-l-2 border-l-pink-400",
    heroBg: "from-pink-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  sensitive_action: {
    border: "border-amber-500/25 hover:border-amber-500/50",
    glow: "shadow-amber-500/10",
    badgeBg: "bg-amber-500/10 border-amber-500/25 text-amber-300",
    gradient: "from-amber-400 via-orange-300 to-yellow-300",
    accentBar: "from-amber-500 via-orange-500 to-yellow-500",
    label: "HITL Guardrail Checkpoint",
    iconColor: "text-amber-400",
    activeSidebar: "border-amber-500/40 bg-amber-500/[0.06] border-l-2 border-l-amber-400",
    heroBg: "from-amber-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  direct_answer: {
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    glow: "shadow-cyan-500/10",
    badgeBg: "bg-cyan-500/10 border-cyan-500/25 text-cyan-300",
    gradient: "from-cyan-400 via-teal-300 to-emerald-400",
    accentBar: "from-cyan-500 via-teal-500 to-emerald-500",
    label: "Autonomous Synthesis",
    iconColor: "text-cyan-400",
    activeSidebar: "border-cyan-500/40 bg-cyan-500/[0.06] border-l-2 border-l-cyan-400",
    heroBg: "from-cyan-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  cyan: {
    border: "border-cyan-500/20 hover:border-cyan-500/40",
    glow: "shadow-cyan-500/10",
    badgeBg: "bg-cyan-500/10 border-cyan-500/25 text-cyan-300",
    gradient: "from-cyan-400 via-sky-300 to-indigo-400",
    accentBar: "from-cyan-500 via-sky-500 to-indigo-500",
    label: "Electric Cyan",
    iconColor: "text-cyan-400",
    activeSidebar: "border-cyan-500/40 bg-cyan-500/[0.06] border-l-2 border-l-cyan-400",
    heroBg: "from-cyan-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  violet: {
    border: "border-violet-500/20 hover:border-violet-500/40",
    glow: "shadow-violet-500/10",
    badgeBg: "bg-violet-500/10 border-violet-500/25 text-violet-300",
    gradient: "from-violet-400 via-fuchsia-300 to-indigo-300",
    accentBar: "from-violet-500 via-fuchsia-500 to-cyan-400",
    label: "Neon Violet",
    iconColor: "text-violet-400",
    activeSidebar: "border-violet-500/40 bg-violet-500/[0.06] border-l-2 border-l-violet-400",
    heroBg: "from-violet-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  amber: {
    border: "border-amber-500/20 hover:border-amber-500/40",
    glow: "shadow-amber-500/10",
    badgeBg: "bg-amber-500/10 border-amber-500/25 text-amber-300",
    gradient: "from-amber-400 via-orange-300 to-yellow-300",
    accentBar: "from-amber-500 via-orange-500 to-yellow-500",
    label: "Sunset Amber",
    iconColor: "text-amber-400",
    activeSidebar: "border-amber-500/40 bg-amber-500/[0.06] border-l-2 border-l-amber-400",
    heroBg: "from-amber-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  rose: {
    border: "border-rose-500/20 hover:border-rose-500/40",
    glow: "shadow-rose-500/10",
    badgeBg: "bg-rose-500/10 border-rose-500/25 text-rose-300",
    gradient: "from-rose-400 via-pink-300 to-amber-300",
    accentBar: "from-rose-500 via-pink-500 to-amber-500",
    label: "Crimson Rose",
    iconColor: "text-rose-400",
    activeSidebar: "border-rose-500/40 bg-rose-500/[0.06] border-l-2 border-l-rose-400",
    heroBg: "from-rose-950/20 via-zinc-900/50 to-zinc-950/80",
  },
  emerald: {
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    glow: "shadow-emerald-500/10",
    badgeBg: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    gradient: "from-emerald-400 via-teal-300 to-cyan-300",
    accentBar: "from-emerald-500 via-teal-500 to-cyan-400",
    label: "Cyber Emerald",
    iconColor: "text-emerald-400",
    activeSidebar: "border-emerald-500/40 bg-emerald-500/[0.06] border-l-2 border-l-emerald-400",
    heroBg: "from-emerald-950/20 via-zinc-900/50 to-zinc-950/80",
  },
};

export const getCategoryTheme = (category?: string, overrideColor?: string): CategoryTheme => {
  const effective = overrideColor && overrideColor !== "auto" ? overrideColor : category;
  if (effective && CATEGORY_THEMES[effective]) {
    return CATEGORY_THEMES[effective];
  }
  return CATEGORY_THEMES["direct_answer"] || CATEGORY_THEMES["cyan"];
};

export const getNodeBadgeStyle = (name: string): { label: string; badge: string; icon: string } => {
  const n = name.toLowerCase();
  if (n.includes("user")) {
    return { label: "User Input", badge: "bg-sky-500/10 text-sky-300 border-sky-500/20", icon: "user" };
  }
  if (n.includes("triage")) {
    return { label: "Intent Triage", badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20", icon: "triage" };
  }
  if (n.includes("research") || n.includes("search")) {
    return { label: "Tavily Web Search", badge: "bg-sky-500/10 text-sky-300 border-sky-500/20", icon: "search" };
  }
  if (n.includes("rag") || n.includes("retrieval") || n.includes("knowledge")) {
    return { label: "pgvector Knowledge Retrieval", badge: "bg-purple-500/10 text-purple-300 border-purple-500/20", icon: "database" };
  }
  if (n.includes("calc") || n.includes("math")) {
    return { label: "Deterministic AST Math", badge: "bg-pink-500/10 text-pink-300 border-pink-500/20", icon: "calc" };
  }
  if (n.includes("guard") || n.includes("hitl") || n.includes("sensit") || n.includes("approval")) {
    return { label: "HITL Security Guardrail", badge: "bg-amber-500/10 text-amber-300 border-amber-500/20", icon: "shield" };
  }
  if (n.includes("complete") || n.includes("direct") || n.includes("answer") || n.includes("response")) {
    return { label: "Neural Synthesis", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", icon: "sparkles" };
  }
  return { label: name.replace(/_/g, " "), badge: "bg-zinc-800 text-zinc-300 border-zinc-700", icon: "cpu" };
};
