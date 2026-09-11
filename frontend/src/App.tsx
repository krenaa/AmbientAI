import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTasksQuery,
  useModelsQuery,
  useCreateTaskMutation,
  useRenameTaskMutation,
  useDeleteTaskMutation,
  useApproveTaskMutation,
  useCurrentUserQuery,
  TASK_KEYS,
} from "./hooks/useTasksQuery";
import { login as apiLogin, register as apiRegister, logout as apiLogout, deleteTask as apiDeleteTask } from "./api";
import type { AgentTask, UserProfile } from "./types";
import { useToast } from "./Toast";

// Layout & UI Components
import { AppSplashScreen } from "./components/layout/AppSplashScreen";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatContainer } from "./components/chat/ChatContainer";
import { ChatInput } from "./components/chat/ChatInput";
import { AuthScreen } from "./components/auth/AuthScreen";

// Modals
import { ProfileModal } from "./components/modals/ProfileModal";
import { HitlModal } from "./components/modals/HitlModal";
import { DeleteTaskModal } from "./components/modals/DeleteTaskModal";
import { KnowledgeModal } from "./components/modals/KnowledgeModal";

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Authentication & Profile State
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("ambient_token"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = sessionStorage.getItem("ambient_user");
    return saved ? JSON.parse(saved) : null;
  });

  const { data: userProfileData } = useCurrentUserQuery(!!token);

  useEffect(() => {
    if (userProfileData) {
      setUser(userProfileData);
      sessionStorage.setItem("ambient_user", JSON.stringify(userProfileData));
    }
  }, [userProfileData]);

  // Handle mid-session 401 expiry
  useEffect(() => {
    const handleExpiry = () => {
      setToken(null);
      setUser(null);
      showToast("Session expired. Please sign in again.", "info");
    };
    window.addEventListener("ambient_session_expired", handleExpiry);
    return () => window.removeEventListener("ambient_session_expired", handleExpiry);
  }, [showToast]);

  // Tasks & Models Data via React Query (only fetched when authenticated)
  const { data: tasks = [], isLoading: isLoadingTasks } = useTasksQuery(!!token);
  const { data: modelsData } = useModelsQuery();
  const createTaskMutation = useCreateTaskMutation();
  const renameTaskMutation = useRenameTaskMutation();
  const deleteTaskMutation = useDeleteTaskMutation();
  const approveTaskMutation = useApproveTaskMutation();

  // Active Session & Prompt State
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [currentNodeName, setCurrentNodeName] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Active LLM Model Selection State (persisted)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("ambient_selected_model") || "auto";
  });

  const handleSetSelectedModel = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem("ambient_selected_model", model);
  };

  // Theme Accent Output Color State (persisted)
  const [outputColor, setOutputColor] = useState<string>(() => {
    return localStorage.getItem("ambient_output_color") || "auto";
  });

  const handleSetOutputColor = (color: string) => {
    setOutputColor(color);
    localStorage.setItem("ambient_output_color", color);
  };

  // Modals State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [hitlTask, setHitlTask] = useState<AgentTask | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<AgentTask | null>(null);

  // Derive Active Task
  const activeTask = tasks.find((t: AgentTask) => t.id === activeTaskId) || null;
  const isExecuting = activeTask?.status === "processing" || createTaskMutation.isPending;

  // Real-time WebSocket connection to active task
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!activeTaskId || !token || activeTaskId.startsWith("temp-")) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    // Determine WS URL with sanitization
    let wsBase = "";
    if (import.meta.env.VITE_API_URL) {
      let url = import.meta.env.VITE_API_URL.trim().replace(/\/+$/, "");
      if (!url.endsWith("/api")) {
        url = `${url}/api`;
      }
      wsBase = url.replace(/^http/, "ws");
    } else if (typeof window !== "undefined" && window.location.port === "5173") {
      wsBase = "ws://localhost:8000/api";
    } else {
      const loc = window.location;
      const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${protocol}//${loc.host}/api`;
    }

    const wsUrl = `${wsBase}/ws/tasks/${activeTaskId}/`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "node_update") {
          setCurrentNodeName(msg.node_name || msg.node);
          queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
            old.map((t) => {
              if (t.id === activeTaskId) {
                const logs = t.logs || [];
                return {
                  ...t,
                  logs: [
                    ...logs,
                    {
                      id: Math.random().toString(36).substring(2, 9),
                      node_name: msg.node_name || msg.node,
                      message: msg.message || `Node execution: ${msg.node_name || msg.node}`,
                      metadata: msg.metadata,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                };
              }
              return t;
            })
          );
        } else if (msg.type === "task_update" || msg.type === "token_stream" || msg.type === "task_complete") {
          const updateData = msg.data || msg;
          queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
            old.map((t) => {
              if (t.id === activeTaskId) {
                return {
                  ...t,
                  ...updateData,
                  output: updateData.output !== undefined ? updateData.output : t.output,
                  status: updateData.status !== undefined ? updateData.status : t.status,
                  execution_time_ms:
                    updateData.execution_time_ms !== undefined
                      ? updateData.execution_time_ms
                      : t.execution_time_ms,
                };
              }
              return t;
            })
          );

          if (msg.type === "task_complete") {
            setCurrentNodeName(undefined);
            queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
            showToast("Agent completed workflow execution.", "success");
          }
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
    };

    socket.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [activeTaskId, token, queryClient, showToast]);

  // Auth Handlers
  const handleLogin = async (email: string, pass: string) => {
    const res = await apiLogin(email, pass);
    setToken(res.token);
    setUser(res.user || null);
    queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    showToast("Signed in successfully.", "success");
  };

  const handleRegister = async (email: string, pass: string, fullName: string) => {
    const res = await apiRegister(email, pass, fullName);
    setToken(res.token);
    setUser(res.user || null);
    queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    showToast("Account created successfully.", "success");
  };

  const handleLogout = () => {
    apiLogout();
    setToken(null);
    setUser(null);
    queryClient.clear();
    showToast("Signed out.", "info");
  };

  // Task Actions
  const handleNewSession = () => {
    setActiveTaskId(null);
    setPromptInput("");
    setCurrentNodeName(undefined);
  };

  const handleSubmitPrompt = async (customPrompt?: string) => {
    const targetPrompt = (customPrompt || promptInput).trim();
    if (!targetPrompt || isExecuting) return;

    const currentActiveId = activeTaskId;
    setPromptInput("");

    // Optimistic ID if starting a new session
    const tempId = currentActiveId || `temp-${Date.now()}`;

    if (!currentActiveId) {
      // 1. Instantly create and select an optimistic task so the UI switches to chat view with 0ms lag
      const optimisticTask: AgentTask = {
        id: tempId,
        title: targetPrompt.split("\n")[0].slice(0, 60) || "New Agent Session",
        prompt: targetPrompt,
        status: "processing",
        execution_time_ms: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        logs: [
          {
            id: `log-opt-${Date.now()}`,
            node_name: "user_message",
            message: targetPrompt,
            metadata: {},
            timestamp: new Date().toISOString(),
          },
        ],
      };

      queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) => [
        optimisticTask,
        ...old,
      ]);
      setActiveTaskId(tempId);
    } else {
      // 2. Optimistically update existing task in query cache if continuing conversation
      queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
        old.map((t) => {
          if (t.id === currentActiveId) {
            return {
              ...t,
              prompt: `${t.prompt}\n\n[Follow-up]: ${targetPrompt}`,
              status: "processing" as const,
              error_message: undefined,
              logs: [
                ...(t.logs || []),
                {
                  id: `log-opt-${Date.now()}`,
                  node_name: "user_message",
                  message: targetPrompt,
                  metadata: {},
                  timestamp: new Date().toISOString(),
                },
              ],
            };
          }
          return t;
        })
      );
    }

    try {
      const resultTask = await createTaskMutation.mutateAsync({
        prompt: targetPrompt,
        taskId: currentActiveId && !currentActiveId.startsWith("temp-") ? currentActiveId : undefined,
        model: selectedModel,
      });

      // Replace optimistic temp task with actual persisted server task
      queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
        old.map((t) => (t.id === tempId ? resultTask : t))
      );

      if (!currentActiveId || currentActiveId.startsWith("temp-")) {
        setActiveTaskId(resultTask.id);
      }
      showToast(currentActiveId ? "Agent continuing conversation..." : "Agent session started.", "info");
    } catch (err: any) {
      if (!currentActiveId) {
        queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
          old.filter((t) => t.id !== tempId)
        );
        setActiveTaskId(null);
      }
      showToast(err?.response?.data?.detail || "Failed to launch agent", "error");
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
    }
  };

  const handleRenameTask = async (taskId: string, newTitle: string) => {
    try {
      await renameTaskMutation.mutateAsync({ taskId, title: newTitle });
      showToast("Session renamed.", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to rename session", "error");
    }
  };

  const handleDeleteConfirm = async (taskId: string) => {
    try {
      await deleteTaskMutation.mutateAsync(taskId);
      if (activeTaskId === taskId) {
        setActiveTaskId(null);
      }
      showToast("Session deleted.", "success");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to delete session", "error");
    }
  };

  const handleHitlDecide = async (taskId: string, approved: boolean, feedback?: string) => {
    try {
      await approveTaskMutation.mutateAsync({ taskId, approved });
      if (feedback) {
        console.info(`User feedback for task ${taskId}: ${feedback}`);
      }
      showToast(approved ? "Action authorized and resumed." : "Action rejected by user.", approved ? "success" : "info");
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to submit approval", "error");
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete all session history?")) return;
    try {
      for (const t of tasks) {
        await apiDeleteTask(t.id);
      }
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      setActiveTaskId(null);
      showToast("All sessions cleared.", "info");
    } catch (err: any) {
      showToast("Failed to clear some sessions.", "error");
    }
  };

  // 1. If not authenticated, require Sign In / Sign Up first!
  if (!token) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  // 2. Show App splash screen during initial task load after authentication
  if (isLoadingTasks && tasks.length === 0) {
    return <AppSplashScreen />;
  }

  return (
    <div className="flex h-screen w-screen ambient-gradient text-zinc-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. Left Modular Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tasks={tasks}
        activeTask={activeTask}
        onSelectTask={(task) => setActiveTaskId(task.id)}
        onNewTask={handleNewSession}
        onRenameTask={handleRenameTask}
        onDeleteRequest={(task) => setDeleteTaskTarget(task)}
        onClearAll={handleClearAll}
        isLoading={isLoadingTasks}
      />

      {/* 2. Main Center / Chat Viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeTask={activeTask}
          wsConnected={wsConnected}
          user={user}
          outputColor={outputColor}
          setOutputColor={handleSetOutputColor}
          selectedModel={selectedModel}
          setSelectedModel={handleSetSelectedModel}
          availableModels={modelsData?.models || []}
          onOpenKnowledge={() => setKnowledgeModalOpen(true)}
          onOpenProfile={() => setProfileModalOpen(true)}
          onOpenAuth={() => {}}
          onLogout={handleLogout}
        />

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <ChatContainer
            activeTask={activeTask}
            outputColor={outputColor}
            isStreaming={isExecuting}
            currentNodeName={currentNodeName}
            onOpenHitlModal={(task) => setHitlTask(task)}
            onSelectSuggestedPrompt={(prompt) => {
              setPromptInput(prompt);
              handleSubmitPrompt(prompt);
            }}
          />

          <ChatInput
            prompt={promptInput}
            setPrompt={setPromptInput}
            onSubmit={() => handleSubmitPrompt()}
            isProcessing={isExecuting}
            selectedModel={selectedModel}
            onSelectModel={handleSetSelectedModel}
            availableModels={modelsData?.models || []}
            onStop={() => {
              if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
              }
              setWsConnected(false);
              if (activeTaskId) {
                queryClient.setQueryData<AgentTask[]>(TASK_KEYS.list, (old = []) =>
                  old.map((t) =>
                    t.id === activeTaskId
                      ? {
                          ...t,
                          status: "completed",
                          output: t.output || "Execution stopped by user.",
                        }
                      : t
                  )
                );
              }
              showToast("Execution stopped by user.", "info");
            }}
          />
        </main>
      </div>

      {/* 3. Interactive Modals */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        onLogout={handleLogout}
        onProfileUpdated={(updated) => {
          setUser(updated);
          sessionStorage.setItem("ambient_user", JSON.stringify(updated));
          queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
        }}
      />

      <KnowledgeModal
        isOpen={knowledgeModalOpen}
        onClose={() => setKnowledgeModalOpen(false)}
        onSelectDocumentForPrompt={(filename) => {
          setPromptInput(`According to the uploaded document "${filename}", please explain: `);
        }}
      />

      <HitlModal
        isOpen={!!hitlTask}
        task={hitlTask}
        onClose={() => setHitlTask(null)}
        onDecide={handleHitlDecide}
      />

      <DeleteTaskModal
        isOpen={!!deleteTaskTarget}
        task={deleteTaskTarget}
        onClose={() => setDeleteTaskTarget(null)}
        onConfirmDelete={handleDeleteConfirm}
      />
    </div>
  );
};

export default App;
