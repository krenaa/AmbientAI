import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-hot-toast";
import type { Message, StreamTokenPayload } from "../types";
import { API_BASE_URL, getMessages } from "../services/api";

export interface HITLApprovalState {
  taskId: string;
  prompt: string;
}

// Module-level in-memory cache + session storage for instant 0ms switching
const messagesCache = new Map<string, Message[]>();
const CACHE_PREFIX = "ambient_chat_cache_";

export function getCachedMessages(convId: string): Message[] {
  if (messagesCache.has(convId)) {
    return messagesCache.get(convId)!;
  }
  try {
    const stored = sessionStorage.getItem(CACHE_PREFIX + convId);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        messagesCache.set(convId, parsed);
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function setCachedMessages(convId: string, msgs: Message[]) {
  messagesCache.set(convId, msgs);
  try {
    sessionStorage.setItem(CACHE_PREFIX + convId, JSON.stringify(msgs));
  } catch {}
}

export async function prefetchConversationMessages(convId: string): Promise<void> {
  if (messagesCache.has(convId)) return;
  try {
    const history = await getMessages(convId);
    if (history && Array.isArray(history)) {
      setCachedMessages(convId, history);
    }
  } catch {}
}

export function useWebSocket(
  conversationId: string,
  onModelFallback?: (suggestedModel: string) => void
) {
  const [messages, setMessages] = useState<Message[]>(() => {
    return getCachedMessages(conversationId);
  });
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(() => {
    return !messagesCache.has(conversationId) && getCachedMessages(conversationId).length === 0;
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hitlApproval, setHitlApproval] = useState<HITLApprovalState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onModelFallbackRef = useRef(onModelFallback);
  onModelFallbackRef.current = onModelFallback;

  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const updateMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setMessages((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCachedMessages(conversationId, next);
        return next;
      });
    },
    [conversationId]
  );

  // Load past messages when conversationId changes
  useEffect(() => {
    let isMounted = true;
    if (!conversationId) return;

    // If already in cache, ensure state is set immediately
    const cached = messagesCache.get(conversationId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      setIsLoadingHistory(false);
    } else {
      setIsLoadingHistory(true);
    }

    getMessages(conversationId)
      .then((history) => {
        if (isMounted && history && Array.isArray(history)) {
          updateMessages(history);
        }
      })
      .catch((err) => {
        console.debug("No historical messages found or error loading history:", err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [conversationId, updateMessages]);

  const connect = useCallback(() => {
    // Use normalized base URL with auth token query param
    const token = localStorage.getItem("ambient_token");
    const wsBaseUrl = API_BASE_URL.replace(/^http/, "ws");
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const wsUrl = `${wsBaseUrl}/ws/chat/${conversationId}${tokenParam}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Safe initial load: only if empty and not actively generating tokens
      if (!isProcessingRef.current && (!messagesRef.current || messagesRef.current.length === 0)) {
        getMessages(conversationId)
          .then((history) => {
            if (history && Array.isArray(history) && !isProcessingRef.current) {
              updateMessages(history);
            }
          })
          .catch(() => {});
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsProcessing(false);
      setStatusMessage(null);
      // Reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setIsConnected(false);
      setIsProcessing(false);
      setStatusMessage(null);
    };

    ws.onmessage = (event) => {
      try {
        const payload: StreamTokenPayload = JSON.parse(event.data);

        // Status update
        if (payload.type === "status") {
          setIsProcessing(true);
          setStatusMessage(payload.content || "AmbientAI is thinking...");
        }

        // Streaming token
        else if (payload.type === "token" && payload.content) {
          setIsProcessing(true);
          setStatusMessage(null);

          const token = payload.content;
          updateMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            // If the last message is an assistant message, ALWAYS append to it to prevent split boxes
            if (lastMsg && lastMsg.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + token },
              ];
            } else {
              const newMsgId = "assistant-" + (payload.task_id || Date.now());
              activeAssistantMessageIdRef.current = newMsgId;
              return [
                ...prev,
                {
                  id: newMsgId,
                  conversation_id: conversationId,
                  role: "assistant",
                  content: token,
                  created_at: new Date().toISOString(),
                },
              ];
            }
          });
        }

        // HITL Interrupt pause
        else if (payload.type === "interrupt") {
          setIsProcessing(false);
          setStatusMessage(null);
          const promptText = payload.prompt || "Human approval required.";
          setHitlApproval({
            taskId: payload.task_id || "task-" + Date.now(),
            prompt: promptText,
          });
          toast("Action paused — Human approval needed!", {
            icon: "⚠️",
            duration: 6000,
          });
        }

        // Task Completed
        else if (payload.type === "complete") {
          setIsProcessing(false);
          setStatusMessage(null);
          activeAssistantMessageIdRef.current = null;
          toast.success("Response generated successfully", { id: "task-complete" });
        }

        // Model Fallback / Error Suggestion
        else if (payload.type === "model_fallback") {
          const fallbackMsg = payload.message || `Switched to fallback model: ${payload.suggested_name || payload.suggested_model}`;
          toast(fallbackMsg, { icon: "⚡", duration: 5000, id: "model-fallback" });
          if (onModelFallbackRef.current && payload.suggested_model) {
            onModelFallbackRef.current(payload.suggested_model);
          }
        }

        // Error
        else if (payload.type === "error") {
          setIsProcessing(false);
          setStatusMessage(null);
          toast.error(payload.error || "Agent execution error", { id: "agent-error" });
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };
  }, [conversationId, updateMessages]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (content: string, model?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error("WebSocket disconnected • Reconnecting...", { id: "ws-status" });
        return;
      }

      const userMsg: Message = {
        id: "user-" + Date.now(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };

      updateMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);
      setStatusMessage("AmbientAI is thinking...");
      activeAssistantMessageIdRef.current = null;

      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content,
          model,
          task_id: "task-" + Date.now(),
        })
      );
    },
    [conversationId, updateMessages]
  );

  const sendApproval = useCallback(
    (decision: "approved" | "rejected") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error("WebSocket disconnected", { id: "ws-status" });
        return;
      }

      const taskId = hitlApproval?.taskId || "task-resumed";
      setHitlApproval(null);
      setIsProcessing(true);
      setStatusMessage(`Resuming with ${decision}...`);

      wsRef.current.send(
        JSON.stringify({
          type: "approval_response",
          decision,
          task_id: taskId,
        })
      );

      if (decision === "approved") {
        toast.success("Security Action Approved • Resuming workflow...", { id: "hitl-action" });
      } else {
        toast("Action Rejected by user • Execution halted", { icon: "🛑", id: "hitl-action" });
      }
    },
    [hitlApproval]
  );

  const stopGenerating = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: "stop" }));
      } catch (err) {
        console.error("Failed to send stop signal:", err);
      }
    }
    setIsProcessing(false);
    setStatusMessage(null);
    toast("Generation stopped", { icon: "🛑", id: "stop-generating" });
  }, []);

  return {
    messages,
    isLoadingHistory,
    isConnected,
    isProcessing,
    statusMessage,
    hitlApproval,
    sendMessage,
    sendApproval,
    stopGenerating,
  };
}
