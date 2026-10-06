import axios from "axios";
import type { AuthResponse, Conversation, Message, Task } from "../types";

const rawUrl = (import.meta.env.VITE_API_URL || "http://localhost:8000").trim();
export const API_BASE_URL = rawUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let authTokenGetter: (() => Promise<string | null>) | null = null;

export const setAuthTokenGetter = (getter: () => Promise<string | null>) => {
  authTokenGetter = getter;
};

export const getAuthToken = async (): Promise<string | null> => {
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter();
      if (token) return token;
    } catch (e) {
      console.warn("Failed to retrieve Clerk token:", e);
    }
  }
  return localStorage.getItem("ambient_token") || sessionStorage.getItem("ambient_token");
};


apiClient.interceptors.request.use(async (config) => {
  let token: string | null = null;
  if (authTokenGetter) {
    try {
      token = await authTokenGetter();
    } catch (e) {
      console.warn("Failed to retrieve Clerk token:", e);
    }
  }
  if (!token) {
    token = localStorage.getItem("ambient_token") || sessionStorage.getItem("ambient_token");
  }
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const checkHealth = async (): Promise<{ status: string; service: string }> => {
  const res = await apiClient.get("/api/health");
  return res.data;
};

export const registerUser = async (
  email: string,
  password: string,
  fullName?: string
): Promise<AuthResponse> => {
  const res = await apiClient.post("/api/auth/register", {
    email,
    password,
    full_name: fullName || "",
  });
  return res.data;
};

export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
  const res = await apiClient.post("/api/auth/login", { email, password });
  return res.data;
};

export const getConversations = async (): Promise<Conversation[]> => {
  const res = await apiClient.get("/api/conversations");
  return res.data;
};

export const createConversation = async (title: string): Promise<Conversation> => {
  const res = await apiClient.post("/api/conversations", { title });
  return res.data;
};

export const updateConversation = async (
  id: string,
  title: string
): Promise<Conversation> => {
  const res = await apiClient.patch(`/api/conversations/${id}`, { title });
  return res.data;
};

export const deleteConversation = async (
  id: string
): Promise<{ success: boolean; id: string }> => {
  const res = await apiClient.delete(`/api/conversations/${id}`);
  return res.data;
};

export const getMessages = async (conversationId: string): Promise<Message[]> => {
  const res = await apiClient.get(`/api/conversations/${conversationId}/messages`);
  return res.data;
};

export const ingestDocument = async (
  content: string,
  source: string = "manual"
): Promise<{ success: boolean; chunk_count: number }> => {
  const res = await apiClient.post("/api/retrieval/ingest", { content, source });
  return res.data;
};

export const resumeTaskApproval = async (
  taskId: string,
  decision: "approved" | "rejected"
): Promise<{ status: string; task: Task }> => {
  const res = await apiClient.post(`/api/tasks/${taskId}/approval`, { decision });
  return res.data;
};
