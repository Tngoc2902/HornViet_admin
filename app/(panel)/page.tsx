"use client";

import Link from "next/link";
import { ArrowRight, PackageCheck, ShoppingCart } from "lucide-react";
import { Badge, Card, EmptyState, ErrorBox, LoadingRows, PageHeader, Skeleton, StatusBadge } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { orderApi, statisticApi } from "@/lib/api/services";
import { OrderStatus } from "@/lib/api/types";
import { formatDateTime, formatVND, LOW_STOCK_THRESHOLD } from "@/lib/hsv/format";

function Kpi({ href, label, value, note }: { href: string; label: string; value: string; note: string }) {
  return (
    <Link href={href} className="hsv-card group p-4 transition-colors hover:border-faint">
      <p className="flex items-center justify-between text-[13px] font-medium text-muted2">
        {label}
        <ArrowRight className="h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.01em]">{value}</p>
      <p className="mt-1 text-xs text-muted2">{note}</p>
    </Link>
  );
}

export default function AdminDashboard() {
  const { session } = useAuth();
  const dash = useApi(() => statisticApi.getDashboard(), []);
  const recent = useApi(() => orderApi.getAll({ maxResultCount: 5 }), []);
  // Đơn mới, đổi trạng thái, tồn kho thay đổi → số liệu và danh sách tự cập nhật.
  useRealtimeRefresh(["OrderCreated", "OrderStatusChanged", "StockChanged", "ProductChanged"], () => {
    void dash.reload();
    void recent.reload();
  });
  const d = dash.data;
  // monthRevenue = null khi Nhân viên gọi → ẩn ô doanh thu.
  const showRevenue = d ? d.monthRevenue !== null && d.monthRevenue !== undefined : false;
  const low = d?.lowStockVariants ?? [];

  return (
    <div>
      <PageHeader title="Tổng quan" subtitle={session ? `Xin chào ${session.name}. Đây là tình hình cửa hàng hôm nay.` : undefined} />

      {dash.error && !d ? (
        <ErrorBox error={dash.error} onRetry={dash.reload} className="mb-4" />
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {!d ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-card" />)
          ) : (
            <>
              <Kpi href={`/orders?status=${OrderStatus.Pending}`} label="Đơn chờ xử lý" value={String(d.pendingOrderCount)} note="Cần xác nhận" />
              <Kpi href={`/orders?status=${OrderStatus.Shipping}`} label="Đơn đang giao" value={String(d.shippingOrderCount)} note={d.readyForPickupOrderCount ? `Đang vận chuyển · ${d.readyForPickupOrderCount} đơn chờ khách nhận tại cửa hàng` : "Đang vận chuyển"} />
              {showRevenue ? (
                <Kpi
                  href="/statistics"
                  label={`Doanh thu tháng ${new Date().getMonth() + 1}`}
                  value={formatVND(d.monthRevenue)}
                  note={d.monthProfit == null ? `Hôm nay: ${formatVND(d.todayRevenue)}` : `Lợi nhuận: ${formatVND(Math.round(d.monthProfit))} · Hôm nay: ${formatVND(d.todayRevenue)}`}
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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          flush
          title="Đơn hàng mới nhất"
          actions={
            <Link href="/orders" className="hsv-link">
              Tất cả đơn
            </Link>
          }
        >
          <div className="mt-3 border-t border-line">
            {recent.error && !recent.data ? (
              <ErrorBox error={recent.error} onRetry={recent.reload} className="m-4" />
            ) : !recent.data ? (
              <LoadingRows rows={5} />
            ) : recent.data.items.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Chưa có đơn hàng" body="Đơn khách đặt trên cửa hàng sẽ hiện ở đây." className="py-9" />
            ) : (
              recent.data.items.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders?open=${o.id}`}
                  className="hsv-trow grid grid-cols-[100px_minmax(0,1fr)_96px] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)_130px_110px]"
                >
                  <span className="font-medium">{o.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{o.receiverName}</span>
                    <span className="block text-xs text-muted2">{formatDateTime(o.creationTime)}</span>
                  </span>
                  <span className="hidden sm:block">
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="text-right font-medium">{formatVND(o.totalAmount)}</span>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card flush title="Biến thể sắp hết hàng">
          <div className="mt-3 border-t border-line">
            {!d ? (
              <LoadingRows rows={4} />
            ) : low.length === 0 ? (
              <EmptyState icon={PackageCheck} title="Tồn kho ổn định" body="Không có biến thể nào dưới ngưỡng." className="py-9" />
            ) : (
              low.map((v) => (
                <Link key={v.variantId} href={`/products?edit=${v.productId}`} className="hsv-trow flex w-full items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.productName}</span>
                    <span className="block text-xs text-muted2">{v.variantName}</span>
                  </span>
                  <Badge tone={v.stockQuantity === 0 ? "danger" : "warn"}>{v.stockQuantity === 0 ? "Hết hàng" : `Còn ${v.stockQuantity}`}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
