import axios, { type AxiosError } from "axios";
import type { AgentTask, ModelsResponse } from "./types";

const getApiBase = (): string => {
  let base = (import.meta.env.VITE_API_URL || "").trim();
  if (base) {
    base = base.replace(/\/+$/, "");
    if (!base.endsWith("/api")) {
      base = `${base}/api`;
    }
    return base;
  }
  // If running locally in Vite dev mode (port 5173), target port 8000
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:8000/api";
  }
  return "/api";
};

export const apiClient = axios.create({
  baseURL: getApiBase(),
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Bearer token to all outgoing requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("ambient_token") || sessionStorage.getItem("ambient_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic mid-session expiry handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response && error.response.status === 401) {
      // Clear token automatically so user never has to touch DevTools
      sessionStorage.removeItem("ambient_token");
      localStorage.removeItem("ambient_token");

      // Dispatch event to kick App.tsx back to login cleanly
      window.dispatchEvent(new CustomEvent("ambient_session_expired"));
    }
    return Promise.reject(error);
  }
);

export const register = async (
  email: string,
  password: string,
  fullName?: string
): Promise<{ token: string; user?: any }> => {
  const res = await apiClient.post("/auth/register/", {
    email,
    password,
    full_name: fullName || "",
  });
  const token = res.data.access;
  const user = res.data.user;
  sessionStorage.setItem("ambient_token", token);
  localStorage.setItem("ambient_token", token);
  if (user) {
    sessionStorage.setItem("ambient_user", JSON.stringify(user));
    localStorage.setItem("ambient_user", JSON.stringify(user));
  }
  return { token, user };
};

export const login = async (
  email: string,
  password: string
): Promise<{ token: string; user?: any }> => {
  const res = await apiClient.post("/auth/token/", { email, password });
  const token = res.data.access;
  const user = res.data.user;
  sessionStorage.setItem("ambient_token", token);
  localStorage.setItem("ambient_token", token);
  if (user) {
    sessionStorage.setItem("ambient_user", JSON.stringify(user));
    localStorage.setItem("ambient_user", JSON.stringify(user));
  }
  return { token, user };
};

export const fetchCurrentUser = async () => {
  const res = await apiClient.get("/auth/me");
  sessionStorage.setItem("ambient_user", JSON.stringify(res.data));
  localStorage.setItem("ambient_user", JSON.stringify(res.data));
  return res.data;
};

export const updateProfile = async (data: {
  full_name?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}) => {
  const res = await apiClient.patch("/auth/me", data);
  if (res.data) {
    sessionStorage.setItem("ambient_user", JSON.stringify(res.data));
    localStorage.setItem("ambient_user", JSON.stringify(res.data));
  }
  return res.data;
};

export const logout = (): void => {
  sessionStorage.removeItem("ambient_token");
  sessionStorage.removeItem("ambient_user");
  localStorage.removeItem("ambient_token");
  window.dispatchEvent(new CustomEvent("ambient_session_expired"));
};

export const fetchTasks = async (): Promise<AgentTask[]> => {
  const res = await apiClient.get("/tasks/");
  return res.data;
};

export const fetchTaskById = async (taskId: string): Promise<AgentTask> => {
  const res = await apiClient.get(`/tasks/${taskId}/`);
  return res.data;
};

export const createTask = async (
  prompt: string,
  taskId?: string,
  model?: string
): Promise<AgentTask> => {
  const payload: { prompt: string; task_id?: string; model?: string } = { prompt };
  if (taskId) {
    payload.task_id = taskId;
  }
  if (model && model !== "auto") {
    payload.model = model;
  }
  const res = await apiClient.post("/tasks/", payload);
  return res.data;
};

export const fetchAvailableModels = async (): Promise<ModelsResponse> => {
  try {
    const res = await apiClient.get("/models/");
    return res.data;
  } catch {
    // Fallback default list if offline
    return {
      selected_default: "openai/gpt-oss-20b",
      models: [
        { id: "auto", name: "⚡ Auto Fallback (Resilient Multi-Model)", provider: "Auto", is_free: true, is_available: true, badge: "Auto Failover" },
        { id: "openai/gpt-oss-20b", name: "Groq: GPT-OSS 20B (Ultra Fast)", provider: "Groq", is_free: true, is_available: true, badge: "Free Tier" },
        { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "Google", is_free: true, is_available: true, badge: "Free Tier" },
        { id: "openai/gpt-oss-120b", name: "Groq: GPT-OSS 120B (Reasoning)", provider: "Groq", is_free: true, is_available: true, badge: "Free Tier" },
      ],
    };
  }
};

export const approveTask = async (taskId: string, approved: boolean): Promise<any> => {
  const res = await apiClient.post(`/tasks/${taskId}/approve/`, { approved });
  return res.data;
};

export const renameTask = async (
  taskId: string,
  title: string
): Promise<AgentTask> => {
  try {
    const res = await apiClient.patch(`/tasks/${taskId}/rename/`, { title });
    return res.data;
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      const fallback = await apiClient.patch(`/tasks/${taskId}/`, { title });
      return fallback.data;
    }
    throw err;
  }
};

export const deleteTask = async (taskId: string): Promise<void> => {
  await apiClient.delete(`/tasks/${taskId}/`);
};

export const uploadKnowledgeFile = async (file: File, conversationId?: string): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);
  if (conversationId) {
    formData.append("conversation_id", conversationId);
  }
  const res = await apiClient.post("/knowledge/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
};

export const fetchKnowledgeDocuments = async (): Promise<any> => {
  const res = await apiClient.get("/knowledge/documents");
  return res.data;
};

export const deleteKnowledgeDocument = async (filename: string): Promise<any> => {
  const res = await apiClient.delete(`/knowledge/documents/${encodeURIComponent(filename)}`);
  return res.data;
};

export const clearKnowledgeDocuments = async (): Promise<any> => {
  const res = await apiClient.delete("/knowledge/documents");
  return res.data;
};

export const queryKnowledgeBase = async (
  query: string,
  k: number = 4,
  source?: string
): Promise<any> => {
  const payload: { query: string; k: number; source?: string } = { query, k };
  if (source) payload.source = source;
  const res = await apiClient.post("/knowledge/query", payload);
  return res.data;
};