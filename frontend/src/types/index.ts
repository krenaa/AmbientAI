export type TaskStatus =
  | "pending"
  | "processing"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  stats?: UserStats;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  has_pdf?: boolean;
  pdf_name?: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface Task {
  id: string;
  conversation_id: string;
  status: TaskStatus;
  checkpoint_state?: Record<string, any>;
  approval_prompt?: string;
  created_at: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface StreamTokenPayload {
  type: "token" | "status" | "interrupt" | "complete" | "error" | "model_fallback";
  content?: string;
  task_id?: string;
  status?: TaskStatus;
  prompt?: string;
  error?: string;
  failed_model?: string;
  suggested_model?: string;
  suggested_name?: string;
  message?: string;
}

// Transitional types for existing UI components
export type TriageCategory =
  | "direct_answer"
  | "web_search"
  | "rag_retrieval"
  | "calculation"
  | "sensitive_action";

export interface TaskExecutionLog {
  id: string;
  node_name: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface UserStats {
  total_tasks: number;
  completed_tasks: number;
  awaiting_approval?: number;
  total_execution_time_s: number;
  total_conversations?: number;
  total_chunks?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "Admin" | "Member";
  is_staff?: boolean;
  date_joined?: string;
  created_at?: string;
  stats?: UserStats;
}

export interface AgentTask {
  id: string;
  title?: string;
  prompt: string;
  status: TaskStatus;
  triage_category?: TriageCategory;
  output?: string;
  error_message?: string;
  approval_prompt?: string | null;
  execution_time_ms: number;
  created_at: string;
  updated_at: string;
  logs?: TaskExecutionLog[];
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  is_free: boolean;
  is_available: boolean;
  status?: string;
  badge: string;
  is_default?: boolean;
}

export interface ModelsResponse {
  selected_default: string;
  timestamp?: string;
  models: ModelOption[];
}
