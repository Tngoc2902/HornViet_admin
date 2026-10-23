// Kết nối thời gian thực (WebSocket qua SignalR) tới HornViet.Api, Hub /hubs/notifications.
// Sự kiện server đẩy xuống được phát lại trên window ("hsv:realtime") để mọi trang nghe qua hook useRealtime().
import { HubConnection, HubConnectionBuilder, LogLevel, type ILogger } from "@microsoft/signalr";
import { API_BASE_URL } from "@/lib/api/http";
import type { ChatMessage, ChatStatus, OrderStatus } from "@/lib/api/types";

export const HUB_URL = `${API_BASE_URL}/hubs/notifications`;

/** Tên sự kiện và dữ liệu — khớp INotificationClient / *Message trong HornViet.Api/Realtime/NotificationHub.cs. */
export type RealtimeEvents = {
  OrderCreated: { orderId: number; code: string; itemCount: number; totalAmount: number; creationTime: string };
  OrderStatusChanged: { orderId: number; code: string; status: OrderStatus };
  StockChanged: { productId: number; variants: { variantId: number; stockQuantity: number }[] };
  LowStock: { productId: number; productName: string; variantId: number; variantName: string; stockQuantity: number };
  ProductChanged: { productId: number };
  ShipmentChanged: { orderId: number; code: string; ghnStatus: string | null };
  SessionRevoked: { reason: "locked" | "rolesChanged" | "passwordReset" | "passwordChanged" };
  /** Tin mới của hội thoại đang mở (JoinChat). */
  ChatMessage: { conversationId: number; message: ChatMessage };
  /** Hội thoại hỗ trợ đổi trạng thái / có tin mới (gửi cả nhóm quản trị, không kèm nội dung). */
  ChatConversationChanged: { conversationId: number; status: ChatStatus; staffUnread: number; staffUserId: number | null };
};
export type RealtimeEventName = keyof RealtimeEvents;

export const REALTIME_EVENT_NAMES: RealtimeEventName[] = [
  "OrderCreated",
  "OrderStatusChanged",
  "StockChanged",
  "LowStock",
  "ProductChanged",
  "ShipmentChanged",
  "SessionRevoked",
  "ChatMessage",
  "ChatConversationChanged",
];

type Detail = { [K in RealtimeEventName]: { type: K; payload: RealtimeEvents[K] } }[RealtimeEventName];
const WINDOW_EVENT = "hsv:realtime";

export function emitRealtime<K extends RealtimeEventName>(type: K, payload: RealtimeEvents[K]) {
  window.dispatchEvent(new CustomEvent<Detail>(WINDOW_EVENT, { detail: { type, payload } as Detail }));
}

/** Đăng ký nghe mọi sự kiện thời gian thực; trả về hàm hủy đăng ký. */
export function subscribeRealtime(listener: (detail: Detail) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<Detail>).detail);
  window.addEventListener(WINDOW_EVENT, handler);
  return () => window.removeEventListener(WINDOW_EVENT, handler);
}

// Lỗi kết nối đã được xử lý (tự thử lại, trang vẫn dùng bình thường) nên chỉ ghi console.warn —
// console.error sẽ bật lớp phủ báo lỗi của Next.js ở môi trường dev.
const logger: ILogger = {
  log(level, message) {
    if (level < LogLevel.Warning) return;
    // App chủ động ngắt khi đang bắt tay (đổi phiên, rời trang) — không phải lỗi.
    if (message.includes("stopped during negotiation")) return;
    console.warn(`[realtime] ${message}`);
  },
};

/**
 * Tạo kết nối Hub. Token gửi qua ?access_token= (WebSocket không gửi được header Authorization);
 * không gửi cookie nên backend giữ nguyên cấu hình CORS hiện có.
 * Mất kết nối thì tự nối lại vô hạn: 0s, 2s, 4s, 8s… tối đa 30s giữa hai lần.
 */
export function createHubConnection(getToken: () => string | null): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => getToken() ?? "", withCredentials: false })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (ctx) => (ctx.previousRetryCount === 0 ? 0 : Math.min(30_000, 1000 * 2 ** ctx.previousRetryCount)),
    })
    .configureLogging(logger)
    .build();
}

/** Thông báo khi phiên bị thu hồi từ xa. */
export const SESSION_REVOKED_MESSAGES: Record<RealtimeEvents["SessionRevoked"]["reason"], string> = {
  locked: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
  rolesChanged: "Vai trò tài khoản vừa được thay đổi. Vui lòng đăng nhập lại.",
  passwordReset: "Mật khẩu tài khoản vừa được đặt lại. Vui lòng đăng nhập lại.",
  passwordChanged: "Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.",
};

/** Id toast dùng chung cho các thông báo kết thúc phiên: thông báo đến sau thay thế thông báo trước, không hiện trùng. */
export const SESSION_TOAST_ID = "hsv-session-ended";
