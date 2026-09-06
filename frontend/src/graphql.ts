/**
 * AmbientDesk AI — Typed Strawberry GraphQL Client
 *
 * Supports querying the unified /graphql endpoint with automatic JWT Authorization.
 */

const getGraphQLEndpoint = (): string => {
  if (import.meta.env.VITE_GRAPHQL_URL) {
    return import.meta.env.VITE_GRAPHQL_URL;
  }
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:8000/graphql/";
  }
  return "/graphql/";
};

export async function executeGraphQL<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const token = sessionStorage.getItem("ambient_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(getGraphQLEndpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    const errorMsg = result.errors.map((e: any) => e.message).join(", ");
    throw new Error(errorMsg || "GraphQL execution failed");
  }

  return result.data as T;
}

// --- Query Documents ---

export const ME_QUERY = `
  query GetMe {
    me {
      id
      email
      fullName
      role
      isStaff
      dateJoined
      stats {
        totalTasks
        completedTasks
        awaitingApproval
        totalExecutionTimeS
      }
    }
  }
`;

export const TASKS_QUERY = `
  query GetTasks($status: String, $search: String) {
    tasks(status: $status, search: $search) {
      id
      prompt
      status
      triageCategory
      output
      approvalPrompt
      errorMessage
      executionTimeMs
      createdAt
      logs {
        id
        nodeName
        message
        metadata
        timestamp
      }
    }
  }
`;

export const TASK_DETAIL_QUERY = `
  query GetTask($id: String!) {
    task(id: $id) {
      id
      prompt
      status
      triageCategory
      output
      approvalPrompt
      errorMessage
      executionTimeMs
      createdAt
      logs {
        id
        nodeName
        message
        metadata
        timestamp
      }
    }
  }
`;

// --- Mutation Documents ---

export const CREATE_TASK_MUTATION = `
  mutation CreateTask($prompt: String!) {
    createTask(prompt: $prompt) {
      id
      prompt
      status
      createdAt
    }
  }
`;

export const APPROVE_TASK_MUTATION = `
  mutation ApproveTask($taskId: String!, $approved: Boolean!) {
    approveTask(taskId: $taskId, approved: $approved) {
      id
      status
      output
      approvalPrompt
      createdAt
    }
  }
`;

export const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      access
      refresh
      user {
        id
        email
        fullName
        role
        isStaff
      }
    }
  }
`;

export const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!, $fullName: String) {
    register(email: $email, password: $password, fullName: $fullName) {
      access
      refresh
      user {
        id
        email
        fullName
        role
        isStaff
      }
    }
  }
`;

export const UPDATE_PROFILE_MUTATION = `
  mutation UpdateProfile($fullName: String, $currentPassword: String, $newPassword: String) {
    updateProfile(fullName: $fullName, currentPassword: $currentPassword, newPassword: $newPassword) {
      id
      email
      fullName
      role
      stats {
        totalTasks
        completedTasks
        awaitingApproval
        totalExecutionTimeS
      }
    }
  }
`;

// --- Client Functions ---

export const gqlGetMe = () => executeGraphQL<{ me: any }>(ME_QUERY);

export const gqlGetTasks = (status?: string, search?: string) =>
  executeGraphQL<{ tasks: any[] }>(TASKS_QUERY, { status, search });

export const gqlCreateTask = (prompt: string) =>
  executeGraphQL<{ createTask: any }>(CREATE_TASK_MUTATION, { prompt });

export const gqlApproveTask = (taskId: string, approved: boolean) =>
  executeGraphQL<{ approveTask: any }>(APPROVE_TASK_MUTATION, { taskId, approved });
