/** Trạng thái vận đơn Giao Hàng Nhanh → nhãn tiếng Việt và mức độ (màu). */
export type ShipmentTone = "info" | "ok" | "warn" | "bad";

export const SHIPMENT_STATUS: Record<string, { label: string; tone: ShipmentTone }> = {
  ready_to_pick: { label: "Chờ lấy hàng", tone: "info" },
  picking: { label: "Đang lấy hàng", tone: "info" },
  money_collect_picking: { label: "Đang thu tiền người gửi", tone: "info" },
  picked: { label: "Đã lấy hàng", tone: "info" },
  storing: { label: "Hàng nằm ở kho", tone: "info" },
  sorting: { label: "Đang phân loại", tone: "info" },
  transporting: { label: "Đang luân chuyển", tone: "info" },
  delivering: { label: "Đang giao hàng", tone: "info" },
  money_collect_delivering: { label: "Đang thu tiền người nhận", tone: "info" },
  delivered: { label: "Đã giao thành công", tone: "ok" },
  delivery_fail: { label: "Giao thất bại", tone: "warn" },
  waiting_to_return: { label: "Chờ hoàn hàng", tone: "warn" },
  return: { label: "Đang hoàn hàng", tone: "warn" },
  return_transporting: { label: "Đang luân chuyển hoàn", tone: "warn" },
  return_sorting: { label: "Đang phân loại hoàn", tone: "warn" },
  returning: { label: "Đang hoàn hàng về shop", tone: "warn" },
  return_fail: { label: "Hoàn hàng thất bại", tone: "bad" },
  returned: { label: "Đã hoàn hàng", tone: "warn" },
  cancel: { label: "Đã hủy vận đơn", tone: "bad" },
  exception: { label: "Phát sinh ngoại lệ", tone: "bad" },
  lost: { label: "Thất lạc", tone: "bad" },
  damage: { label: "Hư hỏng", tone: "bad" },
};

export function shipmentLabel(status: string | null | undefined) {
  if (!status) return "Chưa có vận đơn";
  return SHIPMENT_STATUS[status]?.label ?? status;
}

export const TONE_STYLE: Record<ShipmentTone, { fg: string; bg: string; bd: string }> = {
  info: { fg: "#1f4f7a", bg: "#e6eef6", bd: "#b9cde2" },
  ok: { fg: "#2f5d3c", bg: "#e7f0e8", bd: "#bcd3c0" },
  warn: { fg: "#8a5a12", bg: "#fbf1dc", bd: "#ecd29a" },
  bad: { fg: "#9b3a2e", bg: "#f8e6e2", bd: "#e8c4bd" },
};
