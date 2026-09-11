import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTasks,
  fetchTaskById,
  createTask,
  approveTask,
  renameTask,
  deleteTask,
  fetchCurrentUser,
  fetchAvailableModels,
} from "../api";
import type { AgentTask, ModelsResponse } from "../types";

export const TASK_KEYS = {
  all: ["tasks"] as const,
  list: ["tasks", "list"] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
  user: ["currentUser"] as const,
  models: ["availableModels"] as const,
};

// --- Models Query ---
export function useModelsQuery() {
  return useQuery<ModelsResponse>({
    queryKey: TASK_KEYS.models,
    queryFn: fetchAvailableModels,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// --- User Profile Query ---
export function useCurrentUserQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: TASK_KEYS.user,
    queryFn: fetchCurrentUser,
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// --- Tasks List Query ---
export function useTasksQuery(enabled: boolean = true) {
  return useQuery<AgentTask[]>({
    queryKey: TASK_KEYS.list,
    queryFn: () => fetchTasks(),
    enabled,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// --- Task Detail Query ---
export function useTaskDetailQuery(taskId: string | null, enabled: boolean = true) {
  return useQuery<AgentTask>({
    queryKey: TASK_KEYS.detail(taskId || ""),
    queryFn: () => (taskId ? fetchTaskById(taskId) : Promise.reject("No task ID")),
    enabled: !!taskId && enabled,
    staleTime: 1000 * 10,
  });
}

// --- Task Mutations ---
export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ prompt, taskId, model }: { prompt: string; taskId?: string; model?: string }) =>
      createTask(prompt, taskId, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    },
  });
}

export function useApproveTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, approved }: { taskId: string; approved: boolean }) =>
      approveTask(taskId, approved),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(variables.taskId) });
    },
  });
}

export function useRenameTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      renameTask(taskId, title),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(variables.taskId) });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    },
  });
}
