export type TaskStatus = "pending" | "processing" | "awaiting_approval" | "completed" | "failed";

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
  metadata: Record<string, any>;
  timestamp: string;
}

export interface AgentTask {
  id: string;
  user?: string;
  user_email?: string;
  prompt: string;
  status: TaskStatus;
  triage_category?: TriageCategory;
  output?: string;
  approval_prompt?: string;
  error_message?: string;
  execution_time_ms: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
  logs?: TaskExecutionLog[];
}