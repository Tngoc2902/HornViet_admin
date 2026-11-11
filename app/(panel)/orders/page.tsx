"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Printer, RefreshCw, ShoppingCart } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Card, Chip, DetailPage, EmptyState, ErrorBox, FormAlert, LoadingRows, notify, OrderProgress, PageHeader, Pager, SearchInput, StatusBadge } from "@/components/hsv/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { orderApi, shipmentApi, shippingApi } from "@/lib/api/services";
import { isShipmentStale, SHIPMENT_STATUS, shipmentLabel, SIMULATION_NEXT, TONE_STYLE } from "@/lib/hsv/shipping";
import { ShipmentProgress } from "@/components/hsv/shipment-progress";
import { DeliveryMethod, OrderStatus, PaymentMethod, type OrderLineSummary } from "@/lib/api/types";
import { emitOrdersChanged } from "@/lib/hsv/events";
import { useRealtime, useRealtimeRefresh } from "@/hooks/use-realtime";
import { DELIVERY_LABEL, formatDateTime, formatVND, isPickup, ORDER_STATUS, ORDER_TABS, parseOrderTab, paymentLabel } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;
const COLS = "grid-cols-[110px_130px_minmax(0,1fr)_minmax(0,1.8fr)_60px_110px_130px_120px]";

/** Chỉ tên sản phẩm (gộp các biến thể cùng sản phẩm), một dòng. */
function OrderProducts({ lines }: { lines?: OrderLineSummary[] }) {
  if (!lines) return <span className="text-faint">…</span>;
  const names = [...new Set(lines.map((l) => l.productName))].join(", ");
  return (
    <span className="truncate text-ink-2" title={names}>
      {names}
    </span>
  );
}

/** Bước tiếp theo hợp lệ: Chờ xử lý → Đang giao → Hoàn thành. */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  [OrderStatus.Pending]: { to: OrderStatus.Shipping, label: "Giao hàng" },
  [OrderStatus.Shipping]: { to: OrderStatus.Completed, label: "Xác nhận hoàn thành" },
};

/** Nhận tại cửa hàng: Chờ xử lý → Chờ khách nhận → Hoàn thành. */
const NEXT_PICKUP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  [OrderStatus.Pending]: { to: OrderStatus.ReadyForPickup, label: "Hàng đã sẵn sàng" },
  [OrderStatus.ReadyForPickup]: { to: OrderStatus.Completed, label: "Khách đã nhận hàng" },
};

const DELIVERY_FILTERS = [
  { key: "all", label: "Mọi hình thức", value: undefined },
  { key: "ship", label: "Giao tận nơi", value: DeliveryMethod.Shipping },
  { key: "pickup", label: "Nhận tại cửa hàng", value: DeliveryMethod.StorePickup },
] as const;

/** Trang chi tiết đơn: sản phẩm + vận đơn ở cột chính, khách hàng / giao hàng / thanh toán ở cột phải. */
function OrderDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const { data: order, error, reload, setData } = useApi(() => orderApi.get(id), [id]);
  const shippingStatus = useApi(() => shippingApi.getStatus(), []);
  const isSandbox = shippingStatus.data?.isSandbox === true;
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

  // Đơn đã có vận đơn: trạng thái chạy theo GHN (webhook / làm mới), nhân viên không tự bấm Giao hàng / Hoàn thành.
  const pickup = !!order && isPickup(order);
  const next = !order ? undefined : pickup ? NEXT_PICKUP[order.status] : !order.ghnOrderCode ? NEXT[order.status] : undefined;
  const shipmentOpen = order && (order.status === OrderStatus.Pending || order.status === OrderStatus.Shipping);
  const shipmentFinal = order?.ghnStatus === "delivered" || order?.ghnStatus === "returned";
  const canCancel =
    order && (order.status === OrderStatus.Pending || order.status === OrderStatus.Shipping || order.status === OrderStatus.ReadyForPickup);
  const shipTone = order?.ghnStatus ? TONE_STYLE[SHIPMENT_STATUS[order.ghnStatus]?.tone ?? "info"] : null;

  return (
    <DetailPage
      parent="Đơn hàng"
      title={order ? `Đơn ${order.code}` : "Chi tiết đơn hàng"}
      badge={order ? <StatusBadge status={order.status} /> : undefined}
      meta={order ? `${formatDateTime(order.creationTime)} · ${DELIVERY_LABEL[order.deliveryMethod ?? DeliveryMethod.Shipping]}` : undefined}
      onBack={onClose}
      backLabel="Quay lại danh sách đơn hàng"
      actions={
        order && (canCancel || next) ? (
          <>
            {canCancel && (
              <button onClick={() => change(OrderStatus.Canceled)} disabled={busy} className="hsv-btn-danger-outline">
                Hủy đơn
              </button>
            )}
            {next && (
              <button onClick={() => change(next.to)} disabled={busy} className="hsv-btn-primary">
                {busy ? "Đang cập nhật…" : next.label}
              </button>
            )}
          </>
        ) : undefined
      }
      aside={
        order && (
          <>
            <Card title="Khách hàng">
              {order.userName && <p className="text-muted2">Tài khoản: {order.userName}</p>}
              <p className={cn("font-medium", order.userName && "mt-1.5")}>{order.receiverName}</p>
              <p className="mt-0.5 text-ink-2">{order.phoneNumber}</p>
            </Card>
            <Card title={pickup ? "Nhận tại cửa hàng" : "Địa chỉ giao hàng"}>
              <p className="leading-5 text-ink-2">{order.shippingAddress}</p>
            </Card>
            <Card title="Thanh toán">
              <p className="text-ink-2">{paymentLabel(order)}</p>
              {order.lastStatusChangeTime && (
                <p className="mt-2 text-xs text-muted2">Đổi trạng thái lần cuối: {formatDateTime(order.lastStatusChangeTime)}</p>
              )}
            </Card>
            <Card title="Ghi chú của khách">
              <p className={cn(order.note ? "text-ink-2" : "text-muted2")}>{order.note || "Không có ghi chú."}</p>
            </Card>
          </>
        )
      }
    >
      {error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !order ? (
        <div className="hsv-card">
          <LoadingRows rows={6} />
        </div>
      ) : (
        <>
          <Card>
            <OrderProgress status={order.status} deliveryMethod={order.deliveryMethod} />
            <p className={cn("text-xs text-muted2", order.status !== OrderStatus.Canceled && "mt-3")}>
              {pickup
                ? "Đơn nhận tại cửa hàng: Chờ xử lý → Chờ khách nhận → Hoàn thành; hủy được trước khi khách nhận hàng và tồn kho được hoàn lại."
                : order.ghnOrderCode
                  ? "Đơn có vận đơn Giao Hàng Nhanh: trạng thái tự cập nhật (GHN lấy hàng → Đang giao, giao thành công → Hoàn thành, hoàn hàng → Đã hủy). Hủy đơn sẽ hủy luôn vận đơn."
                  : "Trạng thái chỉ chuyển theo thứ tự Chờ xử lý → Đang giao → Hoàn thành; hủy được khi đơn đang Chờ xử lý hoặc Đang giao và tồn kho được hoàn lại."}
            </p>
          </Card>

          <Card flush title={`Sản phẩm (${order.itemCount})`}>
            <div className="mt-3 border-t border-line">
              {order.items.map((i) => (
                <div key={i.id} className="hsv-trow flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.productName}</span>
                    <span className="block text-xs text-muted2">{i.variantName}</span>
                  </span>
                  <span className="shrink-0 text-muted2">
                    {formatVND(i.unitPrice)} × {i.quantity}
                  </span>
                  <span className="w-[110px] shrink-0 text-right font-medium">{formatVND(i.lineTotal)}</span>
                </div>
              ))}
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
              <div className="flex items-center justify-between text-muted2">
                <dt>Tiền hàng</dt>
                <dd>{formatVND(order.totalAmount)}</dd>
              </div>
              {!!order.shippingFee && (
                <div className="flex items-center justify-between text-muted2">
                  <dt>Phí giao hàng</dt>
                  <dd>{formatVND(order.shippingFee)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 text-sm font-semibold">
                <dt>Tổng thanh toán</dt>
                <dd>{formatVND(order.payableAmount ?? order.totalAmount)}</dd>
              </div>
            </dl>
          </Card>

          {pickup ? (
            <Card title="Nhận tại cửa hàng">
              <p className="leading-5 text-muted2">
                {order.status === OrderStatus.Pending
                  ? "Khách sẽ đến cửa hàng nhận, không tạo vận đơn. Chuẩn bị hàng xong bấm “Hàng đã sẵn sàng” — khách được báo ngay trên trang Đơn hàng của tôi."
                  : order.status === OrderStatus.ReadyForPickup
                    ? `Hàng đã sẵn sàng, đang chờ khách đến nhận. Khi giao hàng, đối chiếu mã đơn ${order.code} hoặc số điện thoại ${order.phoneNumber}${
                        order.paymentMethod === PaymentMethod.Cod ? `, thu ${formatVND(order.payableAmount ?? order.totalAmount)}` : ""
                      } rồi bấm “Khách đã nhận hàng”.`
                    : "Đơn nhận tại cửa hàng, không có vận đơn."}
              </p>
            </Card>
          ) : (
            <Card title="Vận đơn Giao Hàng Nhanh">
              {order.ghnOrderCode ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Mã vận đơn: {order.ghnOrderCode}</span>
                    {order.ghnStatus && shipTone && !isShipmentStale(order.status, order.ghnStatus) && (
                      <span className="hsv-pill" style={{ color: shipTone.fg, background: shipTone.bg }}>
                        {shipmentLabel(order.ghnStatus)}
                      </span>
                    )}
                  </div>
                  {!isShipmentStale(order.status, order.ghnStatus) && <ShipmentProgress status={order.ghnStatus} />}
                  {isShipmentStale(order.status, order.ghnStatus) ? (
                    <FormAlert
                      tone="warn"
                      className="mt-3"
                      message={`Đơn đã được chuyển trạng thái bằng tay trong khi vận đơn còn "${shipmentLabel(order.ghnStatus)}" — vận đơn không còn được theo dõi. Kiểm tra / hủy vận đơn trên cổng GHN nếu cần.`}
                    />
                  ) : (
                    order.ghnStatusTime && <p className="mt-3 text-xs text-muted2">Cập nhật: {formatDateTime(order.ghnStatusTime)}</p>
                  )}
                  {order.ghnExpectedDeliveryTime && (
                    <p className="mt-1 text-xs text-muted2">Dự kiến giao: {formatDateTime(order.ghnExpectedDeliveryTime)}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={printLabel} className="hsv-btn-secondary">
                      <Printer className="h-4 w-4" />
                      In phiếu gửi
                    </button>
                    <button
                      onClick={() => shipAction(() => shipmentApi.get(order.id, true), "Đã làm mới tình trạng giao hàng")}
                      disabled={busy}
                      className="hsv-btn-secondary"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Làm mới
                    </button>
                    {order.ghnStatus === "ready_to_pick" && shipmentOpen && (
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
                        className="hsv-btn-danger-outline"
                      >
                        Hủy vận đơn
                      </button>
                    )}
                  </div>
                  {isSandbox && shipmentOpen && !shipmentFinal && (SIMULATION_NEXT[order.ghnStatus ?? ""] ?? []).length > 0 && (
                    <div className="mt-4 rounded-lg border border-dashed border-line-3 bg-surface-2 px-3 py-2.5">
                      <p className="hsv-section-label">Môi trường thử GHN — giả lập bước tiếp theo</p>
                      <p className="mt-1 text-xs text-muted2">
                        Sandbox GHN không có shipper thật: vận đơn trên cổng GHN thử nghiệm luôn đứng ở &quot;Chờ lấy hàng&quot;. Giả lập chỉ đổi
                        trạng thái trong hệ thống này, đi lần lượt từng bước như vận đơn thật.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(SIMULATION_NEXT[order.ghnStatus ?? ""] ?? []).map((st) => (
                          <button
                            key={st}
                            onClick={() => shipAction(() => shipmentApi.simulate(order.id, st), `Giả lập: ${shipmentLabel(st)}`)}
                            disabled={busy}
                            className="hsv-btn-secondary hsv-btn-sm"
                          >
                            → {shipmentLabel(st)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : order.status === OrderStatus.Pending || order.status === OrderStatus.Shipping ? (
                <>
                  <p className="text-muted2">Chưa có vận đơn. Tạo vận đơn sẽ gửi đơn sang Giao Hàng Nhanh và chuyển đơn sang Đang giao.</p>
                  <button onClick={() => shipAction(() => shipmentApi.create(order.id), "Đã tạo vận đơn")} disabled={busy} className="hsv-btn-primary mt-3">
                    {busy ? "Đang xử lý…" : "Tạo vận đơn"}
                  </button>
                </>
              ) : (
                <p className="text-muted2">Không có vận đơn.</p>
              )}
            </Card>
          )}
        </>
      )}
    </DetailPage>
  );
}

export default function AdminOrders() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = parseOrderTab(params.get("status"));
  const delivery = DELIVERY_FILTERS.find((f) => f.key === params.get("delivery")) ?? DELIVERY_FILTERS[0];
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
  const filters = { keyword: keyword || undefined, fromDate: from || undefined, toDate: to || undefined, deliveryMethod: delivery.value };
  const list = useApi(
    () =>
      orderApi
        .getAll({ ...filters, status: status === "all" ? undefined : status, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    [status, delivery.key, keyword, from, to, page],
    !dateError
  );
  const counts = useApi(
    () =>
      Promise.all(
        ORDER_TABS.map((t) => orderApi.getAll({ ...filters, status: t.key === "all" ? undefined : t.key, maxResultCount: 1 }).then((r) => r.totalCount))
      ),
    [delivery.key, keyword, from, to],
    !dateError
  );

  const rows = list.data?.items ?? [];
  const filtered = !!keyword || !!from || !!to || delivery.key !== "all" || status !== "all";

  useRealtimeRefresh(["OrderCreated", "OrderStatusChanged"], () => {
    void list.reload();
    void counts.reload();
  });

  const onChanged = () => {
    void list.reload();
    void counts.reload();
    emitOrdersChanged();
  };

  // Đang mở một đơn: trang chi tiết chiếm cả trang; bộ lọc và trang hiện tại của danh sách vẫn được giữ.
  if (openId) return <OrderDetail key={openId} id={openId} onClose={() => setParam({ open: null })} onChanged={onChanged} />;

  return (
    <div>
      <PageHeader title="Đơn hàng" />

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className="hsv-index">
          <div className="hsv-toolbar">
            <div className="flex w-full flex-wrap gap-1 border-b border-line-2 pb-1.5">
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
                  {counts.data && <span className={cn("text-xs", status === t.key ? "text-muted2" : "text-faint")}>{counts.data[i]}</span>}
                </Chip>
              ))}
            </div>
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Mã đơn, tên người nhận, số điện thoại"
              label="Tìm đơn hàng"
              className="sm:max-w-[340px]"
            />
            <select
              value={delivery.key}
              onChange={(e) => {
                setPage(1);
                setParam({ delivery: e.target.value === "all" ? null : e.target.value, open: null });
              }}
              aria-label="Lọc theo hình thức nhận hàng"
              className="hsv-input w-auto min-w-[160px]"
            >
              {DELIVERY_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-muted2">
              Từ
              <input type="date" value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setPage(1))} className={cn("hsv-input w-auto", dateError && "hsv-input-error")} />
            </label>
            <label className="flex items-center gap-2 text-muted2">
              đến
              <input type="date" value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setPage(1))} className={cn("hsv-input w-auto", dateError && "hsv-input-error")} />
            </label>
            {(q || from || to) && (
              <button
                onClick={() => {
                  setQ("");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
                className="hsv-link"
              >
                Xóa lọc
              </button>
            )}
            {dateError && <span className="text-xs font-medium text-danger">{dateError}</span>}
          </div>

          <div className={cn("overflow-x-auto", list.loading && list.data && "opacity-70")}>
            <div className="min-w-[1040px]">
              <div className={cn("hsv-thead grid gap-3", COLS)}>
                <span>Mã đơn</span>
                <span>Ngày đặt</span>
                <span>Người nhận</span>
                <span>Sản phẩm</span>
                <span>Số SP</span>
                <span>Thanh toán</span>
                <span>Trạng thái</span>
                <span className="text-right">Tổng tiền</span>
              </div>
              {!list.data ? (
                dateError ? (
                  <EmptyState icon={ShoppingCart} title="Khoảng ngày chưa hợp lệ" body={dateError} />
                ) : (
                  <LoadingRows rows={8} />
                )
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title={filtered ? "Không có đơn hàng phù hợp" : "Chưa có đơn hàng"}
                  body={filtered ? "Thử đổi trạng thái, từ khóa hoặc khoảng ngày." : "Đơn khách đặt trên cửa hàng sẽ hiện ở đây."}
                />
              ) : (
                rows.map((o) => (
                  <button key={o.id} onClick={() => setParam({ open: String(o.id) })} className={cn("hsv-trow grid w-full items-center gap-3 text-left", COLS)}>
                    <span>
                      <span className="block font-medium">{o.code}</span>
                      {isPickup(o) && <span className="mt-0.5 block text-[11px] font-medium text-muted2">{DELIVERY_LABEL[DeliveryMethod.StorePickup]}</span>}
                    </span>
                    <span className="text-muted2">{formatDateTime(o.creationTime)}</span>
                    <span className="truncate">{o.receiverName}</span>
                    <OrderProducts lines={o.items} />
                    <span>{o.itemCount}</span>
                    <span className="text-muted2">{o.paymentMethod === PaymentMethod.BankTransfer ? "Chuyển khoản" : isPickup(o) ? "Tại cửa hàng" : "COD"}</span>
                    <span>
                      <StatusBadge status={o.status} />
                    </span>
                    <span className="text-right font-medium">{formatVND(o.totalAmount)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}
