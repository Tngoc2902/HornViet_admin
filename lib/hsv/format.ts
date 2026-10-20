import { DeliveryMethod, OrderStatus, PaymentMethod, type RoleName } from "@/lib/api/types";
import type { Tones } from "./tones";

/** Trùng AppConsts.LowStockThreshold của backend. */
export const LOW_STOCK_THRESHOLD = 5;

export const BANK_INFO = "Vietcombank · 0451 000 123 456 · CTY TNHH HỒN SỪNG VIỆT";

export function formatVND(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("vi-VN") + "₫";
}

/** 1.250.000 → "1,3tr", 95.000 → "95k" (nhãn cột biểu đồ). */
export function formatShortVND(value: number) {
  if (!value) return "";
  if (value >= 1_000_000) return (Math.round(value / 100_000) / 10).toString().replace(".", ",") + "tr";
  return Math.round(value / 1000) + "k";
}

export function gradient(tones: Tones) {
  return `linear-gradient(150deg, ${tones[0]}, ${tones[1]} 60%, ${tones[2]})`;
}

// Backend trả giờ Việt Nam kèm offset (2026-10-05T16:13:57+07:00) → đọc thẳng phần ngày giờ.
/** → "05/10/2026 16:13" */
export function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${iso.slice(11, 16)}`.trim();
}

/** → "05/10/2026" */
export function formatDate(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/** Tham số lọc ngày gửi dạng yyyy-MM-dd theo giờ địa phương. */
export function toDateParam(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; fg: string; bg: string; bd: string }> = {
  [OrderStatus.Pending]: { label: "Chờ xử lý", fg: "#8a5a12", bg: "#fbf1dc", bd: "#ecd29a" },
  [OrderStatus.Shipping]: { label: "Đang giao", fg: "#1f4f7a", bg: "#e6eef6", bd: "#b9cde2" },
  [OrderStatus.Completed]: { label: "Hoàn thành", fg: "#2f5d3c", bg: "#e7f0e8", bd: "#bcd3c0" },
  [OrderStatus.Canceled]: { label: "Đã hủy", fg: "#6f665b", bg: "#efebe4", bd: "#dcd4c7" },
  [OrderStatus.ReadyForPickup]: { label: "Chờ khách nhận", fg: "#1f4f7a", bg: "#e6eef6", bd: "#b9cde2" },
};

export const ORDER_FLOW: OrderStatus[] = [OrderStatus.Pending, OrderStatus.Shipping, OrderStatus.Completed];
/** Đơn nhận tại cửa hàng: Chờ xử lý → Chờ khách nhận → Hoàn thành. */
export const PICKUP_FLOW: OrderStatus[] = [OrderStatus.Pending, OrderStatus.ReadyForPickup, OrderStatus.Completed];

export const isPickup = (o: { deliveryMethod?: DeliveryMethod }) => o.deliveryMethod === DeliveryMethod.StorePickup;

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  [DeliveryMethod.Shipping]: "Giao tận nơi",
  [DeliveryMethod.StorePickup]: "Nhận tại cửa hàng",
};

/** Nhãn thanh toán theo hình thức nhận: COD của đơn nhận tại cửa hàng là trả tiền lúc khách đến lấy. */
export function paymentLabel(o: { paymentMethod: PaymentMethod; deliveryMethod?: DeliveryMethod }) {
  return isPickup(o) && o.paymentMethod === PaymentMethod.Cod ? "Thanh toán tại cửa hàng" : PAYMENT_LABEL[o.paymentMethod];
}

export type OrderTab = OrderStatus | "all";

export const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: OrderStatus.Pending, label: "Chờ xử lý" },
  { key: OrderStatus.Shipping, label: "Đang giao" },
  { key: OrderStatus.ReadyForPickup, label: "Chờ khách nhận" },
  { key: OrderStatus.Completed, label: "Hoàn thành" },
  { key: OrderStatus.Canceled, label: "Đã hủy" },
];

export function parseOrderTab(v: string | null): OrderTab {
  const n = Number(v);
  return v !== null && v !== "" && [0, 1, 2, 3, 4].includes(n) ? (n as OrderStatus) : "all";
}

export const ROLE_LABEL: Record<RoleName, string> = {
  Customer: "Khách hàng",
  Staff: "Nhân viên",
  Admin: "Quản trị viên",
};

export function roleLabel(roles: RoleName[]) {
  if (roles.includes("Admin")) return ROLE_LABEL.Admin;
  if (roles.includes("Staff")) return ROLE_LABEL.Staff;
  return ROLE_LABEL.Customer;
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.Cod]: "Thanh toán khi nhận hàng (COD)",
  [PaymentMethod.BankTransfer]: "Chuyển khoản ngân hàng",
};

export function initialOf(name: string) {
  return name.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? "?";
}

export function lastName(name: string) {
  return name.trim().split(/\s+/).pop() ?? name;
}
