import React, { useState } from "react";
import {
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert
} from "lucide-react";
import type { AgentTask } from "../../types";
import { CategoryIcon } from "../common/CategoryIcon";
import { getCategoryTheme } from "../../utils/theme";

interface TaskCardProps {
  task: AgentTask;
  isActive: boolean;
  onSelect: (task: AgentTask) => void;
  onRename: (taskId: string, newTitle: string) => Promise<void>;
  onDeleteRequest: (task: AgentTask) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  isActive,
  onSelect,
  onRename,
  onDeleteRequest,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title || task.prompt);
  const [isSaving, setIsSaving] = useState(false);

  const theme = getCategoryTheme(task.triage_category);

  const handleSaveRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      await onRename(task.id, editTitle.trim());
      setIsEditing(false);
    } catch {
      // Handled by toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(task.title || task.prompt);
    setIsEditing(false);
  };

  const getStatusBadge = () => {
    switch (task.status) {
      case "processing":
        return (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Live
          </span>
        );
      case "awaiting_approval":
        return (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 animate-pulse">
            <ShieldAlert className="w-2.5 h-2.5" />
            Approval
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Done
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <AlertTriangle className="w-2.5 h-2.5" />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
            <Clock className="w-2.5 h-2.5" />
            Queued
          </span>
        );
    }
  };

  return (
    <div
      onClick={() => onSelect(task)}
      className={`group relative p-3 rounded-xl border transition-all duration-150 cursor-pointer select-none text-left ${
        isActive
          ? `${theme.activeSidebar} bg-zinc-900/90 shadow-sm`
          : "bg-zinc-900/30 border-white/[0.05] hover:bg-zinc-900/60 hover:border-white/[0.08]"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <CategoryIcon category={task.triage_category} className="w-3 h-3 shrink-0" />
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate">
            {task.triage_category ? task.triage_category.replace(/_/g, " ") : "agent run"}
          </span>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      {isEditing ? (
        <div
          className="flex items-center gap-1 my-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveRename(e as any);
              if (e.key === "Escape") handleCancelRename(e as any);
            }}
            className="flex-1 bg-zinc-950 border border-cyan-500/50 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleSaveRename}
            disabled={isSaving}
            className="p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer disabled:opacity-50"
            title="Save title"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={handleCancelRename}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 cursor-pointer"
            title="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <h4 className="text-xs font-medium text-zinc-200 line-clamp-2 mb-1 leading-snug group-hover:text-white transition-colors">
          {task.title || task.prompt}
        </h4>
      )}

      <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5 font-mono">
        <span>
          {task.execution_time_ms > 0
            ? `${(task.execution_time_ms / 1000).toFixed(2)}s`
            : "in flight"}
        </span>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditTitle(task.title || task.prompt);
              setIsEditing(true);
            }}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-cyan-300 cursor-pointer transition-colors"
            title="Rename session"
            aria-label="Rename session"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(task);
            }}
            className="p-1 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 cursor-pointer transition-colors"
            title="Delete session"
            aria-label="Delete session"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
