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

/**
 * Bước kế tiếp được phép giả lập ở môi trường thử (sandbox GHN không có shipper nên vận đơn không tự đổi trạng thái).
 * Khớp ShipmentAppService.SimulationSteps ở backend: đi lần lượt, không nhảy bước.
 */
export const SIMULATION_NEXT: Record<string, string[]> = {
  ready_to_pick: ["picking"],
  picking: ["picked"],
  picked: ["transporting"],
  transporting: ["delivering"],
  delivering: ["delivered", "delivery_fail"],
  delivery_fail: ["delivering", "waiting_to_return"],
  waiting_to_return: ["returning"],
  returning: ["returned"],
};

/** Các bước chính của vận đơn, theo đúng thứ tự (giống tiến trình trên cổng GHN). */
export const SHIPMENT_FLOW = [
  { key: "ready_to_pick", label: "Chờ lấy hàng" },
  { key: "picking", label: "Đang lấy hàng" },
  { key: "picked", label: "Đã lấy hàng" },
  { key: "transporting", label: "Đang luân chuyển" },
  { key: "delivering", label: "Đang giao hàng" },
  { key: "delivered", label: "Giao thành công" },
] as const;

/** Vị trí của trạng thái GHN trên các bước chính (trạng thái phụ gộp vào bước gần nhất). */
export function shipmentStepIndex(status: string | null | undefined): number {
  switch (status) {
    case "ready_to_pick":
      return 0;
    case "picking":
    case "money_collect_picking":
      return 1;
    case "picked":
      return 2;
    case "storing":
    case "sorting":
    case "transporting":
      return 3;
    case "delivering":
    case "money_collect_delivering":
    case "delivery_fail":
      return 4;
    case "delivered":
      return 5;
    default:
      return -1;
  }
}

/** Nhánh hoàn hàng (sau khi giao thất bại). */
export function isReturnFlow(status: string | null | undefined) {
  return !!status && ["waiting_to_return", "return", "return_transporting", "return_sorting", "returning", "return_fail", "returned"].includes(status);
}

/**
 * Đơn đã Hoàn thành / Đã hủy mà vận đơn chưa ở trạng thái cuối: đơn được cập nhật tay trước khi hệ thống chặn việc này,
 * trạng thái vận đơn không còn được theo dõi — không hiện để tránh mâu thuẫn với trạng thái đơn.
 */
export function isShipmentStale(orderStatus: number, ghnStatus: string | null | undefined) {
  return (orderStatus === 2 || orderStatus === 3) && !!ghnStatus && !["delivered", "returned", "cancel"].includes(ghnStatus);
}
