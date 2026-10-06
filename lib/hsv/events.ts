/** Phát khi trạng thái đơn hàng thay đổi ở trang quản trị (để làm mới badge, dashboard). */
export const ORDERS_CHANGED = "hsv:orders-changed";

export function emitOrdersChanged() {
  window.dispatchEvent(new Event(ORDERS_CHANGED));
}
