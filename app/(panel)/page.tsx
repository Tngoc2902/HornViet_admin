"use client";

import Link from "next/link";
import { ErrorBox, LoadingRows, Skeleton, StatusBadge } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { orderApi, statisticApi } from "@/lib/api/services";
import { OrderStatus } from "@/lib/api/types";
import { formatDateTime, formatVND, LOW_STOCK_THRESHOLD } from "@/lib/hsv/format";
import { mockDashboard } from "@/lib/hsv/mock-cost";

function Kpi({ href, label, value, note }: { href: string; label: string; value: string; note: string }) {
  return (
    <Link href={href} className="rounded-card border border-line bg-white p-5 transition-colors hover:border-navy">
      <p className="text-[13px] text-muted2">{label}</p>
      <p className="mt-2 text-[28px] font-bold tracking-[-0.01em]">{value}</p>
      <p className="mt-1 text-[12.5px] text-faint">{note}</p>
    </Link>
  );
}

export default function AdminDashboard() {
  const dash = useApi(() => statisticApi.getDashboard().then(mockDashboard), []);
  const recent = useApi(() => orderApi.getAll({ maxResultCount: 5 }), []);
  // Đơn mới, đổi trạng thái, tồn kho thay đổi → số liệu và danh sách tự cập nhật.
  useRealtimeRefresh(["OrderCreated", "OrderStatusChanged", "StockChanged", "ProductChanged"], () => {
    void dash.reload();
    void recent.reload();
  });
  const d = dash.data?.data;
  // monthRevenue = null khi Nhân viên gọi → ẩn ô doanh thu.
  const showRevenue = d ? d.monthRevenue !== null && d.monthRevenue !== undefined : false;
  const low = d?.lowStockVariants ?? [];

  return (
    <div>
      {dash.error && !d ? (
        <ErrorBox error={dash.error} onRetry={dash.reload} className="mb-[18px]" />
      ) : (
        <div className="mb-[18px] grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          {!d ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[126px]" />)
          ) : (
            <>
              <Kpi href={`/orders?status=${OrderStatus.Pending}`} label="Đơn chờ xử lý" value={String(d.pendingOrderCount)} note="Cần xác nhận" />
              <Kpi href={`/orders?status=${OrderStatus.Shipping}`} label="Đơn đang giao" value={String(d.shippingOrderCount)} note="Đang vận chuyển" />
              {showRevenue ? (
                <Kpi
                  href="/statistics"
                  label={`Doanh thu tháng ${new Date().getMonth() + 1}`}
                  value={formatVND(d.monthRevenue)}
                  note={d.monthProfit == null ? `Hôm nay: ${formatVND(d.todayRevenue)}` : `Lợi nhuận${dash.data?.mocked ? " (ảo)" : ""}: ${formatVND(Math.round(d.monthProfit))} · Hôm nay: ${formatVND(d.todayRevenue)}`}
                />
              ) : (
                <Kpi href="/orders" label="Đơn đặt hôm nay" value={String(d.todayOrderCount)} note={`${d.customerCount} khách hàng`} />
              )}
              <Kpi
                href="/products?warn=1"
                label="Biến thể sắp hết"
                value={low.length >= 10 ? "10+" : String(low.length)}
                note={`Tồn kho ≤ ${LOW_STOCK_THRESHOLD}`}
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="hsv-card px-[22px] py-5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[15px] font-bold">Đơn hàng mới nhất</p>
            <Link href="/orders" className="text-[13px] font-semibold text-gold">
              Tất cả đơn →
            </Link>
          </div>
          {recent.error && !recent.data ? (
            <ErrorBox error={recent.error} onRetry={recent.reload} />
          ) : !recent.data ? (
            <LoadingRows rows={5} />
          ) : recent.data.items.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-subtle">Chưa có đơn hàng.</p>
          ) : (
            recent.data.items.map((o) => (
              <Link
                key={o.id}
                href={`/orders?open=${o.id}`}
                className="grid grid-cols-[100px_minmax(0,1fr)_96px] items-center gap-3 border-t border-line-2 py-3 hover:bg-surface-2 sm:grid-cols-[110px_minmax(0,1fr)_110px_110px]"
              >
                <span className="text-[13px] font-bold">{o.code}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px]">{o.receiverName}</span>
                  <span className="block text-xs text-faint">{formatDateTime(o.creationTime)}</span>
                </span>
                <span className="hidden sm:block">
                  <StatusBadge status={o.status} />
                </span>
                <span className="text-right text-[13.5px] font-semibold">{formatVND(o.totalAmount)}</span>
              </Link>
            ))
          )}
        </div>

        <div className="hsv-card px-[22px] py-5">
          <p className="mb-2.5 text-[15px] font-bold">Biến thể sắp hết hàng</p>
          {!d ? (
            <LoadingRows rows={4} />
          ) : low.length === 0 ? (
            <p className="text-[13.5px] text-subtle">Không có biến thể nào dưới ngưỡng.</p>
          ) : (
            low.map((v) => (
              <Link
                key={v.variantId}
                href={`/products?edit=${v.productId}`}
                className="flex w-full items-center gap-3 border-t border-line-2 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{v.productName}</span>
                  <span className="block text-xs text-subtle">{v.variantName}</span>
                </span>
                <span className={`text-[12.5px] font-bold ${v.stockQuantity === 0 ? "text-danger" : "text-warn"}`}>
                  {v.stockQuantity === 0 ? "Hết hàng" : `Còn ${v.stockQuantity}`}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
