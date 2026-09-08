import React from "react";

export const SkeletonTaskCard: React.FC = () => {
  return (
    <div className="p-3.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 relative overflow-hidden space-y-2.5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-zinc-800" />
          <div className="h-3 w-16 bg-zinc-800 rounded" />
        </div>
        <div className="h-4 w-12 bg-zinc-800/80 rounded-full" />
      </div>
      <div className="h-3.5 w-3/4 bg-zinc-800/90 rounded" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-2.5 w-14 bg-zinc-800/50 rounded" />
        <div className="h-2.5 w-10 bg-zinc-800/50 rounded" />
      </div>
    </div>
  );
};
