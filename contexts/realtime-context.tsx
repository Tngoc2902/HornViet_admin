"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { HubConnection, HubConnectionState } from "@microsoft/signalr";
import { notify } from "@/components/hsv/ui";
import { useRealtime } from "@/hooks/use-realtime";
import { tokenStore } from "@/lib/api/http";
import { ChatStatus } from "@/lib/api/types";
import { emitOrdersChanged } from "@/lib/hsv/events";
import { formatVND } from "@/lib/hsv/format";
import {
  createHubConnection,
  emitRealtime,
  REALTIME_EVENT_NAMES,
  SESSION_REVOKED_MESSAGES,
  SESSION_TOAST_ID,
  type RealtimeEvents,
} from "@/lib/realtime";
import { useAuth } from "./auth-context";

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

const RealtimeContext = createContext<RealtimeStatus>("disconnected");
/** Nghe tin nhắn của một hội thoại hỗ trợ (trang Hỗ trợ khách hàng); trả về hàm ngừng nghe. */
const WatchChatContext = createContext<(conversationId: number) => () => void>(() => () => undefined);

/**
 * Giữ một kết nối SignalR khi đã đăng nhập: đơn mới, trạng thái đơn, tồn kho, cảnh báo sắp hết hàng
 * và thu hồi phiên (khóa / đổi vai trò / đặt lại mật khẩu) được đẩy tới ngay, không cần tải lại trang.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const connectionRef = useRef<HubConnection | null>(null);
  // Hội thoại hỗ trợ đang mở — vào lại nhóm chat:{id} sau mỗi lần (tái) kết nối.
  const chatRef = useRef<number | null>(null);
  // Trạng thái đã biết của từng hội thoại: chỉ báo "khách cần hỗ trợ" khi vừa chuyển sang chờ nhân viên.
  const chatStatuses = useRef(new Map<number, ChatStatus>());
  // Đổi tài khoản / đăng nhập lại → kết nối mới với token mới.
  const sessionKey = session ? `${session.userId}:${session.expiresAt}` : null;

  useEffect(() => {
    if (!sessionKey) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connection = createHubConnection(() => tokenStore.get());
    connectionRef.current = connection;
    for (const name of REALTIME_EVENT_NAMES)
      connection.on(name, (payload: RealtimeEvents[typeof name]) => emitRealtime(name, payload));
    const rejoin = () => {
      if (chatRef.current) void connection.invoke("JoinChat", chatRef.current, null).catch(() => undefined);
    };
    connection.onreconnecting(() => setStatus("connecting"));
    connection.onreconnected(() => {
      setStatus("connected");
      rejoin();
    });
    connection.onclose(() => !disposed && setStatus("disconnected"));

    // Lần kết nối đầu thất bại (VD backend chưa chạy) không được withAutomaticReconnect xử lý → tự thử lại.
    const start = async (attempt: number) => {
      setStatus("connecting");
      try {
        await connection.start();
        if (!disposed) {
          setStatus("connected");
          rejoin();
        }
      } catch {
        if (disposed || connection.state !== HubConnectionState.Disconnected) return;
        setStatus("disconnected");
        retry = setTimeout(() => void start(attempt + 1), Math.min(30_000, 2000 * 2 ** attempt));
      }
    };
    // Hoãn sang tick sau: ở dev, React StrictMode gắn → gỡ → gắn lại effect ngay lập tức; lần gỡ hủy timer này
    // nên không mở rồi cắt ngang một kết nối đang bắt tay (negotiate).
    retry = setTimeout(() => void start(0), 0);

    return () => {
      disposed = true;
      clearTimeout(retry);
      setStatus("disconnected");
      if (connectionRef.current === connection) connectionRef.current = null;
      void connection.stop();
    };
  }, [sessionKey]);

  const watchChat = useCallback((conversationId: number) => {
    chatRef.current = conversationId;
    const c = connectionRef.current;
    if (c?.state === HubConnectionState.Connected) void c.invoke("JoinChat", conversationId, null).catch(() => undefined);
    return () => {
      if (chatRef.current !== conversationId) return;
      chatRef.current = null;
      const cur = connectionRef.current;
      if (cur?.state === HubConnectionState.Connected) void cur.invoke("LeaveChat", conversationId).catch(() => undefined);
    };
  }, []);

  useRealtime("SessionRevoked", ({ reason }) => {
    logout();
    notify(SESSION_REVOKED_MESSAGES[reason], SESSION_TOAST_ID);
  });
  useRealtime("OrderCreated", (o) => {
    notify(`Đơn hàng mới ${o.code} · ${o.itemCount} sản phẩm · ${formatVND(o.totalAmount)}`);
    emitOrdersChanged(); // badge "Đơn hàng" và trang Tổng quan
  });
  useRealtime("OrderStatusChanged", () => emitOrdersChanged());
  useRealtime("LowStock", (v) => notify(`Sắp hết hàng: ${v.productName} (${v.variantName}) chỉ còn ${v.stockQuantity}`));
  useRealtime("ChatConversationChanged", (c) => {
    const before = chatStatuses.current.get(c.conversationId);
    chatStatuses.current.set(c.conversationId, c.status);
    if (c.status === ChatStatus.WaitingStaff && before !== ChatStatus.WaitingStaff)
      notify("Có khách cần hỗ trợ — mở mục “Hỗ trợ khách hàng” để trả lời", `chat-waiting-${c.conversationId}`);
  });

  return (
    <RealtimeContext.Provider value={status}>
      <WatchChatContext.Provider value={watchChat}>{children}</WatchChatContext.Provider>
    </RealtimeContext.Provider>
  );
}

/** Nghe tin nhắn thời gian thực của hội thoại đang mở. */
export function useWatchChat(conversationId: number | null | undefined) {
  const watchChat = useContext(WatchChatContext);
  useEffect(() => {
    if (!conversationId) return;
    return watchChat(conversationId);
  }, [conversationId, watchChat]);
}

/** Trạng thái kết nối thời gian thực (hiển thị ở thanh bên). */
export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}
