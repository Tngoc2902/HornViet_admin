"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Chip, Drawer, ErrorBox, LoadingRows, notify, OrderProgress, Pager, StatusBadge } from "@/components/hsv/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { orderApi, shipmentApi } from "@/lib/api/services";
import { SHIPMENT_STATUS, shipmentLabel, TONE_STYLE } from "@/lib/hsv/shipping";
import { OrderStatus, PaymentMethod, type OrderListItem, type OrderLineSummary, type PagedResult } from "@/lib/api/types";
import { emitOrdersChanged } from "@/lib/hsv/events";
import { useRealtime, useRealtimeRefresh } from "@/hooks/use-realtime";
import { formatDateTime, formatVND, ORDER_STATUS, ORDER_TABS, parseOrderTab, PAYMENT_LABEL } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;
const COLS = "grid-cols-[110px_minmax(0,1fr)_minmax(0,1.8fr)_140px_60px_110px_120px_120px]";

/** Backend cũ chưa trả `items` trong danh sách đơn → lấy từ chi tiết từng đơn trên trang. */
async function withItems(result: PagedResult<OrderListItem>): Promise<PagedResult<OrderListItem>> {
  if (result.items.every((o) => o.items)) return result;
  const items = await Promise.all(
    result.items.map(async (o) => (o.items ? o : { ...o, items: (await orderApi.get(o.id)).items }))
  );
  return { ...result, items };
}

/** Chỉ tên sản phẩm (gộp các biến thể cùng sản phẩm), một dòng. */
function OrderProducts({ lines }: { lines?: OrderLineSummary[] }) {
  if (!lines) return <span className="text-[12.5px] text-faint">…</span>;
  const names = [...new Set(lines.map((l) => l.productName))].join(", ");
  return (
    <span className="truncate text-[13px]" title={names}>
      {names}
    </span>
  );
}

/** Bước tiếp theo hợp lệ: Chờ xử lý → Đang giao → Hoàn thành. */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  [OrderStatus.Pending]: { to: OrderStatus.Shipping, label: "Giao hàng" },
  [OrderStatus.Shipping]: { to: OrderStatus.Completed, label: "Xác nhận hoàn thành" },
};

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const { data: order, error, reload, setData } = useApi(() => orderApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  // Nhân viên khác vừa đổi trạng thái đơn đang mở → tải lại để không thao tác trên dữ liệu cũ.
  useRealtime("OrderStatusChanged", (e) => {
    if (e.orderId === id && !busy) void reload();
  });
  useRealtime("ShipmentChanged", (e) => {
    if (e.orderId === id && !busy) void reload();
  });

  // Thao tác vận đơn (tạo / hủy / làm mới): xong thì tải lại đơn vì tạo vận đơn còn đổi trạng thái đơn.
  const shipAction = async (run: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await run();
      notify(okMessage);
      await reload();
      onChanged();
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };
  const printLabel = async () => {
    try {
      window.open(await shipmentApi.getLabelUrl(id), "_blank", "noopener");
    } catch (e) {
      notify(toApiError(e).message);
    }
  };

  const change = async (to: OrderStatus) => {
    if (!order) return;
    if (to === OrderStatus.Canceled) {
      const ok = await confirm({
        title: `Hủy đơn ${order.code}?`,
        body: `Tồn kho của ${order.items.length} biến thể trong đơn sẽ được hoàn lại.`,
        okLabel: "Hủy đơn",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const updated = await orderApi.updateStatus(order.id, to);
      setData(updated);
      notify(to === OrderStatus.Canceled ? "Đã hủy đơn và hoàn lại tồn kho" : `Đơn ${order.code} → ${ORDER_STATUS[to].label}`);
      onChanged();
    } catch (e) {
      notify(toApiError(e).message);
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const next = order ? NEXT[order.status] : undefined;
  const canCancel = order && (order.status === OrderStatus.Pending || order.status === OrderStatus.Shipping);

  return (
    <Drawer
      open
      width={520}
      onClose={onClose}
      header={
        order ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-serif text-[22px]">Đơn {order.code}</p>
              <p className="mt-0.5 text-[12.5px] text-subtle">{formatDateTime(order.creationTime)}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
        ) : (
          <p className="font-serif text-[22px]">Chi tiết đơn hàng</p>
        )
      }
      footer={
        order && (canCancel || next) ? (
          <>
            {canCancel && (
              <button
                onClick={() => change(OrderStatus.Canceled)}
                disabled={busy}
                className="rounded-lg border border-[#e8c4bd] px-[18px] py-[11px] text-sm font-semibold text-danger disabled:opacity-60"
              >
                Hủy đơn
              </button>
            )}
            <span className="flex-1" />
            {next && (
              <button
                onClick={() => change(next.to)}
                disabled={busy}
                className="rounded-lg bg-navy px-[22px] py-[11px] text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Đang cập nhật…" : next.label}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !order ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="flex flex-col gap-4">
          <OrderProgress status={order.status} />
          <div className="hsv-card p-4">
            <p className="mb-2.5 text-xs font-bold text-muted2">KHÁCH HÀNG &amp; GIAO HÀNG</p>
            {order.userName && <p className="text-sm font-semibold">Tài khoản: {order.userName}</p>}
            <p className="mt-2 text-[13.5px]">
              Người nhận: <b>{order.receiverName}</b> · {order.phoneNumber}
            </p>
            <p className="mt-1 text-[13.5px] leading-normal text-ink-2">{order.shippingAddress}</p>
            <p className="mt-2 text-[13px] text-muted2">Ghi chú: {order.note || "—"}</p>
            <p className="mt-1 text-[13px] text-muted2">{PAYMENT_LABEL[order.paymentMethod]}</p>
            {order.lastStatusChangeTime && (
              <p className="mt-1 text-[13px] text-muted2">Đổi trạng thái lần cuối: {formatDateTime(order.lastStatusChangeTime)}</p>
            )}
          </div>
          <div className="hsv-card p-4">
            <p className="mb-2.5 text-xs font-bold text-muted2">VẬN ĐƠN GIAO HÀNG NHANH</p>
            {order.ghnOrderCode ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold">Mã: {order.ghnOrderCode}</span>
                  {order.ghnStatus && (
                    <span
                      className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                      style={{
                        color: TONE_STYLE[SHIPMENT_STATUS[order.ghnStatus]?.tone ?? "info"].fg,
                        background: TONE_STYLE[SHIPMENT_STATUS[order.ghnStatus]?.tone ?? "info"].bg,
                        borderColor: TONE_STYLE[SHIPMENT_STATUS[order.ghnStatus]?.tone ?? "info"].bd,
                      }}
                    >
                      {shipmentLabel(order.ghnStatus)}
                    </span>
                  )}
                </div>
                {order.ghnStatusTime && <p className="mt-1.5 text-[13px] text-muted2">Cập nhật: {formatDateTime(order.ghnStatusTime)}</p>}
                {order.ghnExpectedDeliveryTime && (
                  <p className="mt-1 text-[13px] text-muted2">Dự kiến giao: {formatDateTime(order.ghnExpectedDeliveryTime)}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={printLabel} className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold">
                    In phiếu gửi
                  </button>
                  <button
                    onClick={() => shipAction(() => shipmentApi.get(order.id, true), "Đã làm mới tình trạng giao hàng")}
                    disabled={busy}
                    className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                  >
                    Làm mới
                  </button>
                  {order.ghnStatus === "ready_to_pick" && (
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Hủy vận đơn?",
                          body: "Vận đơn sẽ bị hủy trên Giao Hàng Nhanh; bạn có thể tạo lại vận đơn mới.",
                          okLabel: "Hủy vận đơn",
                          danger: true,
                        });
                        if (ok) await shipAction(() => shipmentApi.cancel(order.id), "Đã hủy vận đơn");
                      }}
                      disabled={busy}
                      className="rounded-lg border border-[#e8c4bd] px-3.5 py-2 text-[13px] font-semibold text-danger disabled:opacity-60"
                    >
                      Hủy vận đơn
                    </button>
                  )}
                </div>
              </>
            ) : order.status === OrderStatus.Pending || order.status === OrderStatus.Shipping ? (
              <>
                <p className="text-[13px] text-muted2">
                  Chưa có vận đơn. Tạo vận đơn sẽ gửi đơn sang Giao Hàng Nhanh và chuyển đơn sang Đang giao.
                </p>
                <button
                  onClick={() => shipAction(() => shipmentApi.create(order.id), "Đã tạo vận đơn")}
                  disabled={busy}
                  className="mt-3 rounded-lg bg-navy px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Đang xử lý…" : "Tạo vận đơn"}
                </button>
              </>
            ) : (
              <p className="text-[13px] text-muted2">Không có vận đơn.</p>
            )}
          </div>
          <div className="hsv-card p-4">
            <p className="mb-1.5 text-xs font-bold text-muted2">SẢN PHẨM ({order.itemCount})</p>
            {order.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 border-t border-line-2 py-2.5">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold">{i.productName}</span>
                  <span className="block text-xs text-muted2">
                    {i.variantName} · {formatVND(i.unitPrice)} × {i.quantity}
                  </span>
                </span>
                <span className="text-[13.5px] font-semibold">{formatVND(i.lineTotal)}</span>
              </div>
            ))}
            {!!order.shippingFee && (
              <div className="flex items-center justify-between pt-2 text-[13px] text-muted2">
                <span>Phí giao hàng</span>
                <span>{formatVND(order.shippingFee)}</span>
              </div>
            )}
            <div className="mt-0.5 flex items-center justify-between border-t border-line-2 pt-2.5 text-[13px] text-muted2">
              <span>Tổng thanh toán</span>
              <span className="text-base font-bold text-navy">{formatVND(order.payableAmount ?? order.totalAmount)}</span>
            </div>
          </div>
          <p className="text-[12.5px] text-faint">
            Trạng thái chỉ chuyển theo thứ tự Chờ xử lý → Đang giao → Hoàn thành; hủy được khi đơn đang Chờ xử lý hoặc Đang giao và tồn kho được hoàn lại.
          </p>
        </div>
      )}
    </Drawer>
  );
}

export default function AdminOrders() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = parseOrderTab(params.get("status"));
  const openId = Number(params.get("open")) || null;
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const dateError = from && to && from > to ? "Ngày bắt đầu phải trước ngày kết thúc." : "";
  const filters = { keyword: keyword || undefined, fromDate: from || undefined, toDate: to || undefined };
  const list = useApi(
    () =>
      orderApi
        .getAll({ ...filters, status: status === "all" ? undefined : status, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE })
        .then(withItems),
    [status, keyword, from, to, page],
    !dateError
  );
  const counts = useApi(
    () =>
      Promise.all(
        ORDER_TABS.map((t) => orderApi.getAll({ ...filters, status: t.key === "all" ? undefined : t.key, maxResultCount: 1 }).then((r) => r.totalCount))
      ),
    [keyword, from, to],
    !dateError
  );

  const rows = list.data?.items ?? [];

  useRealtimeRefresh(["OrderCreated", "OrderStatusChanged"], () => {
    void list.reload();
    void counts.reload();
  });

  const onChanged = () => {
    void list.reload();
    void counts.reload();
    emitOrdersChanged();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {ORDER_TABS.map((t, i) => (
          <Chip
            key={String(t.key)}
            active={status === t.key}
            onClick={() => {
              setPage(1);
              setParam({ status: t.key === "all" ? null : String(t.key), open: null });
            }}
          >
            {t.label}
            {counts.data && <span className="text-xs opacity-70">{counts.data[i]}</span>}
          </Chip>
        ))}
      </div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Mã đơn, tên người nhận, số điện thoại"
          aria-label="Tìm đơn hàng"
          className="h-10 w-[300px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy"
        />
        <label className="flex items-center gap-2 text-[13px] text-subtle">
          Từ
          <input type="date" value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="h-10 rounded-lg border border-line px-2.5 text-[13px] text-navy outline-none focus:border-navy" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-subtle">
          đến
          <input type="date" value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setPage(1))} className="h-10 rounded-lg border border-line px-2.5 text-[13px] text-navy outline-none focus:border-navy" />
        </label>
        {(q || from || to) && (
          <button
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="text-[13px] font-semibold text-gold"
          >
            Xóa lọc
          </button>
        )}
        {dateError && <span className="text-[12.5px] text-danger">{dateError}</span>}
      </div>

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[1040px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COLS)}>
              <span>Mã đơn</span>
              <span>Người nhận</span>
              <span>Sản phẩm</span>
              <span>Ngày đặt</span>
              <span>Số SP</span>
              <span>Thanh toán</span>
              <span>Trạng thái</span>
              <span className="text-right">Tổng tiền</span>
            </div>
            {!list.data ? (
              <LoadingRows rows={8} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Không có đơn hàng.</p>
            ) : (
              rows.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setParam({ open: String(o.id) })}
                  className={cn("grid w-full items-center gap-3 border-t border-line-2 px-5 py-[13px] text-left hover:bg-surface-2", COLS)}
                >
                  <span className="text-[13px] font-bold">{o.code}</span>
                  <span className="truncate text-[13.5px] font-semibold">{o.receiverName}</span>
                  <OrderProducts lines={o.items} />
                  <span className="text-[12.5px] text-muted2">{formatDateTime(o.creationTime)}</span>
                  <span className="text-[13px]">{o.itemCount}</span>
                  <span className="text-[12.5px] text-muted2">{o.paymentMethod === PaymentMethod.Cod ? "COD" : "Chuyển khoản"}</span>
                  <span>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="text-right text-[13.5px] font-bold">{formatVND(o.totalAmount)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />

      {openId && <OrderDrawer key={openId} id={openId} onClose={() => setParam({ open: null })} onChanged={onChanged} />}
    </div>
  );
}
