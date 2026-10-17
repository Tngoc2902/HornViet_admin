"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import { notify } from "@/components/hsv/ui";
import { useRealtime } from "@/hooks/use-realtime";
import { tokenStore } from "@/lib/api/http";
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

/**
 * Giữ một kết nối SignalR khi đã đăng nhập: đơn mới, trạng thái đơn, tồn kho, cảnh báo sắp hết hàng
 * và thu hồi phiên (khóa / đổi vai trò / đặt lại mật khẩu) được đẩy tới ngay, không cần tải lại trang.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  // Đổi tài khoản / đăng nhập lại → kết nối mới với token mới.
  const sessionKey = session ? `${session.userId}:${session.expiresAt}` : null;

  useEffect(() => {
    if (!sessionKey) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connection = createHubConnection(() => tokenStore.get());
    for (const name of REALTIME_EVENT_NAMES)
      connection.on(name, (payload: RealtimeEvents[typeof name]) => emitRealtime(name, payload));
    connection.onreconnecting(() => setStatus("connecting"));
    connection.onreconnected(() => setStatus("connected"));
    connection.onclose(() => !disposed && setStatus("disconnected"));

    // Lần kết nối đầu thất bại (VD backend chưa chạy) không được withAutomaticReconnect xử lý → tự thử lại.
    const start = async (attempt: number) => {
      setStatus("connecting");
      try {
        await connection.start();
        if (!disposed) setStatus("connected");
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
      void connection.stop();
    };
  }, [sessionKey]);

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

  return <RealtimeContext.Provider value={status}>{children}</RealtimeContext.Provider>;
}

/** Trạng thái kết nối thời gian thực (hiển thị ở thanh bên). */
export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}
