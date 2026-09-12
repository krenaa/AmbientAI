import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-hot-toast";
import type { Message, StreamTokenPayload } from "../types";

export interface HITLApprovalState {
  taskId: string;
  prompt: string;
}

export function useWebSocket(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hitlApproval, setHitlApproval] = useState<HITLApprovalState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!conversationId) return;

    // Use environment variable or fallback to localhost:8000
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = apiUrl.replace(/^http/, "ws");
    const wsUrl = `${wsBaseUrl}/ws/chat/${conversationId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      toast.success("Connected to AmbientAI Agent", { id: "ws-status" });
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const payload: StreamTokenPayload = JSON.parse(event.data);

        // Status update
        if (payload.type === "status") {
          setIsProcessing(true);
          setStatusMessage(payload.content || "Processing...");
        }

        // Streaming token
        else if (payload.type === "token" && payload.content) {
          setIsProcessing(true);
          setStatusMessage(null);

          const token = payload.content;
          setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === activeAssistantMessageIdRef.current) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + token },
              ];
            } else {
              const newMsgId = "assistant-" + Date.now();
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
          toast.success("Task completed!", { id: "task-complete" });
        }

        // Error
        else if (payload.type === "error") {
          setIsProcessing(false);
          setStatusMessage(null);
          toast.error(payload.error || "Agent execution error");
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };
  }, [conversationId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error("WebSocket is disconnected. Reconnecting...");
        return;
      }

      const userMsg: Message = {
        id: "user-" + Date.now(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);
      setStatusMessage("Sending...");
      activeAssistantMessageIdRef.current = null;

      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content,
          task_id: "task-" + Date.now(),
        })
      );
    },
    [conversationId]
  );

  const sendApproval = useCallback(
    (decision: "approved" | "rejected") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast.error("WebSocket is disconnected");
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
        toast.success("Action approved! Resuming execution...");
      } else {
        toast("Action rejected by user.", { icon: "🛑" });
      }
    },
    [hitlApproval]
  );

  return {
    messages,
    isConnected,
    isProcessing,
    statusMessage,
    hitlApproval,
    sendMessage,
    sendApproval,
  };
}
