import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  ListFilter,
  Trash2,
  X,
  Bot
} from "lucide-react";
import type { AgentTask } from "../../types";
import { TaskCard } from "./TaskCard";
import { SkeletonTaskCard } from "../common/SkeletonTaskCard";

export type FilterTab = "all" | "executing" | "action" | "completed";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  activeTask: AgentTask | null;
  onSelectTask: (task: AgentTask) => void;
  onNewTask: () => void;
  onRenameTask: (taskId: string, newTitle: string) => Promise<void>;
  onDeleteRequest: (task: AgentTask) => void;
  onClearAll: () => void;
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  tasks,
  activeTask,
  onSelectTask,
  onNewTask,
  onRenameTask,
  onDeleteRequest,
  onClearAll,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const counts = useMemo(() => {
    const executing = tasks.filter((t) => t.status === "processing" || t.status === "pending").length;
    const action = tasks.filter((t) => t.status === "awaiting_approval").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    return {
      all: tasks.length,
      executing,
      action,
      completed,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Tab filter
      if (filterTab === "executing" && t.status !== "processing" && t.status !== "pending") {
        return false;
      }
      if (filterTab === "action" && t.status !== "awaiting_approval") {
        return false;
      }
      if (filterTab === "completed" && t.status !== "completed") {
        return false;
      }

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPrompt = t.prompt.toLowerCase().includes(q);
        const matchesTitle = t.title?.toLowerCase().includes(q);
        const matchesCat = t.triage_category?.toLowerCase().includes(q);
        return matchesPrompt || matchesTitle || matchesCat;
      }

      return true;
    });
  }, [tasks, filterTab, searchQuery]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden cursor-pointer"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-zinc-300" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Agent Sessions
              </span>
            </div>
            <button
              onClick={onClose}
              className="md:hidden p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Solid High-Contrast New Session Button */}
          <button
            onClick={() => {
              onNewTask();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold shadow-sm active:scale-[0.98] transition-all cursor-pointer group"
          >
            <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90 duration-200" />
            <span>New Session</span>
          </button>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search runs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-medium">
            <button
              onClick={() => setFilterTab("all")}
              className={`py-1 rounded-md transition-all cursor-pointer flex flex-col items-center justify-center ${
                filterTab === "all"
                  ? "bg-zinc-800 text-white font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="All Tasks"
            >
              <span>All</span>
              <span className="text-[8px] text-zinc-500">{counts.all}</span>
            </button>
            <button
              onClick={() => setFilterTab("executing")}
              className={`py-1 rounded-md transition-all cursor-pointer flex flex-col items-center justify-center ${
                filterTab === "executing"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-zinc-400 hover:text-cyan-300"
              }`}
              title="Executing Tasks"
            >
              <span>Live</span>
              <span className="text-[8px] text-cyan-400/80">{counts.executing}</span>
            </button>
            <button
              onClick={() => setFilterTab("action")}
              className={`py-1 rounded-md transition-all cursor-pointer flex flex-col items-center justify-center ${
                filterTab === "action"
                  ? "bg-amber-500/20 text-amber-300 font-semibold"
                  : "text-zinc-400 hover:text-amber-300"
              }`}
              title="Needs Approval"
            >
              <span>HITL</span>
              <span className="text-[8px] text-amber-400/80">{counts.action}</span>
            </button>
            <button
              onClick={() => setFilterTab("completed")}
              className={`py-1 rounded-md transition-all cursor-pointer flex flex-col items-center justify-center ${
                filterTab === "completed"
                  ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                  : "text-zinc-400 hover:text-emerald-300"
              }`}
              title="Completed"
            >
              <span>Done</span>
              <span className="text-[8px] text-emerald-400/80">{counts.completed}</span>
            </button>
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
          {isLoading ? (
            <div className="space-y-1.5">
              <SkeletonTaskCard />
              <SkeletonTaskCard />
              <SkeletonTaskCard />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                <ListFilter className="w-4 h-4" />
              </div>
              <p className="text-xs text-zinc-400 font-medium">
                {searchQuery ? "No matching sessions" : "No sessions yet"}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isActive={activeTask?.id === task.id}
                onSelect={(selected) => {
                  onSelectTask(selected);
                  if (window.innerWidth < 768) onClose();
                }}
                onRename={onRenameTask}
                onDeleteRequest={onDeleteRequest}
              />
            ))
          )}
        </div>

        {/* Sidebar Footer */}
        {tasks.length > 0 && (
          <div className="p-2.5 border-t border-zinc-800">
            <button
              onClick={onClearAll}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear History</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
