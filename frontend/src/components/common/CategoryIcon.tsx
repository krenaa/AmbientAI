import React from "react";
import { Search, Database, Calculator, ShieldAlert, Cpu } from "lucide-react";

interface CategoryIconProps {
  category?: string;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ category, className = "w-4 h-4" }) => {
  switch (category) {
    case "web_search":
      return <Search className={`${className} text-sky-400`} />;
    case "rag_retrieval":
      return <Database className={`${className} text-purple-400`} />;
    case "calculation":
      return <Calculator className={`${className} text-pink-400`} />;
    case "sensitive_action":
      return <ShieldAlert className={`${className} text-amber-400`} />;
    default:
      return <Cpu className={`${className} text-emerald-400`} />;
  }
};
