import axios from "axios";
import type { AgentTask } from "./types";

const API_BASE = "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("ambient_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = async (email: string, password: string): Promise<string> => {
  const res = await apiClient.post("/auth/token/", { email, password });
  const token = res.data.access;
  localStorage.setItem("ambient_token", token);
  return token;
};

export const fetchTasks = async (): Promise<AgentTask[]> => {
  const res = await apiClient.get("/tasks/");
  return res.data;
};

export const createTask = async (prompt: string): Promise<AgentTask> => {
  const res = await apiClient.post("/tasks/", { prompt });
  return res.data;
};

export const approveTask = async (taskId: string, approved: boolean): Promise<any> => {
  const res = await apiClient.post(`/tasks/${taskId}/approve/`, { approved });
  return res.data;
};