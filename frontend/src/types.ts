export type TaskStatus = 
  | "pending" 
  | "processing" 
  | "awaiting_approval" 
  | "completed" 
  | "failed";

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

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "Admin" | "Member";
  is_staff?: boolean;
}

export interface AgentTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  triage_category?: TriageCategory;
  output?: string;
  error_message?: string;
  approval_prompt?: string;
  execution_time_ms: number;
  created_at: string;
  updated_at: string;
  logs?: TaskExecutionLog[];
}