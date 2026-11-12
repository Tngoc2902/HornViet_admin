"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Headset, PackageCheck, PackageX, ShoppingCart, Store, Truck } from "lucide-react";
import { BarList, CHART, ColumnChart, LineChart, SegmentedBar, Sparkline } from "@/components/hsv/charts";
import { Badge, Card, Chip, EmptyState, ErrorBox, FormAlert, LoadingRows, PageHeader, Skeleton, StatusBadge } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { chatSupportApi, orderApi, statisticApi } from "@/lib/api/services";
import { DeliveryMethod, type OrderListItem, OrderStatus, PaymentMethod, RevenueGroupBy, type RevenueReport } from "@/lib/api/types";
import { formatDateTime, formatShortVND, formatVND, LOW_STOCK_THRESHOLD, ORDER_STATUS, toDateParam } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- Khoảng thời gian

const RANGES = [
  { key: "7", label: "7 ngày qua" },
  { key: "30", label: "30 ngày qua" },
  { key: "90", label: "90 ngày qua" },
  { key: "month", label: "Tháng này" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const dd = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Kỳ đang xem (đến hết hôm nay) và kỳ trước liền kề có cùng số ngày để so sánh. */
function buildRange(key: RangeKey) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = key === "month" ? new Date(today.getFullYear(), today.getMonth(), 1) : addDays(today, -(Number(key) - 1));
  const days: Date[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days.length - 1));
  return {
    key,
    days,
    cur: { fromDate: toDateParam(from), toDate: toDateParam(today) },
    prev: { fromDate: toDateParam(prevFrom), toDate: toDateParam(prevTo) },
    prevLabel: `${dd(prevFrom)} – ${dd(prevTo)}`,
  };
}
type Range = ReturnType<typeof buildRange>;

// ---------------------------------------------------------------- Dữ liệu

/** Đọc tối đa 1.000 đơn của kỳ (10 trang × 100) để vẽ theo ngày và tính cơ cấu; số đếm theo trạng thái thì hỏi riêng nên luôn đúng. */
const MAX_ORDER_PAGES = 10;

async function loadOrders(r: Range) {
  const items: OrderListItem[] = [];
  let total = 0;
  for (let p = 0; p < MAX_ORDER_PAGES; p++) {
    const page = await orderApi.getAll({ ...r.cur, skipCount: items.length, maxResultCount: 100 });
    total = page.totalCount;
    items.push(...page.items);
    if (!page.items.length || items.length >= total) break;
  }
  const count = (q: { fromDate: string; toDate: string }, status?: OrderStatus) => orderApi.getAll({ ...q, status, maxResultCount: 1 }).then((x) => x.totalCount);
  const statuses = [OrderStatus.Pending, OrderStatus.Shipping, OrderStatus.ReadyForPickup, OrderStatus.Completed, OrderStatus.Canceled];
  const [byStatus, prevTotal, prevCompleted, prevCanceled] = await Promise.all([
    Promise.all(statuses.map((s) => count(r.cur, s).then((n) => [s, n] as const))),
    count(r.prev),
    count(r.prev, OrderStatus.Completed),
    count(r.prev, OrderStatus.Canceled),
  ]);
  return { items, total, truncated: items.length < total, byStatus: Object.fromEntries(byStatus) as Record<OrderStatus, number>, prevTotal, prevCompleted, prevCanceled };
}

/** % thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không so được). */
const change = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const money = (v: number | null | undefined) => (v == null ? "—" : formatVND(Math.round(v)));
const axisMoney = (v: number) => (v ? formatShortVND(v) : "0");

// ---------------------------------------------------------------- Ô chỉ số

function Delta({ pct, upIsGood = true }: { pct: number | null; upIsGood?: boolean }) {
  if (pct === null) return <span className="text-xs text-muted2">—</span>;
  const rounded = Math.round(pct);
  if (rounded === 0) return <span className="text-xs text-muted2">0%</span>;
  const up = rounded > 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-[#006300]" : "text-danger")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{up ? "tăng" : "giảm"}</span>
      {Math.abs(rounded)}%
    </span>
  );
}

/** Nhãn gạch chấm, rê chuột / chọn bằng bàn phím hiện định nghĩa (như trang phân tích của Shopify). */
function HintLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="group relative inline-block">
      <button type="button" className="cursor-help rounded border-b border-dotted border-faint text-left text-[13px] font-medium text-ink">
        {label}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-20 mt-1 w-[260px] rounded-xl bg-brand p-3 text-xs font-normal text-chrome-text opacity-0 shadow-dropdown transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="mb-0.5 block text-[13px] font-semibold text-white">{label}</span>
        {hint}
      </span>
    </span>
  );
}

function StatTile({
  label,
  hint,
  value,
  delta,
  trend,
  note,
}: {
  label: string;
  hint: string;
  value: string;
  delta?: ReactNode;
  trend?: (number | null)[];
  note?: string;
}) {
  return (
    <div className="hsv-card flex min-h-[124px] flex-col p-4">
      <HintLabel label={label} hint={hint} />
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-xl font-semibold tracking-[-0.01em]">{value}</p>
        {delta}
      </div>
      {note && <p className="mt-0.5 text-xs text-muted2">{note}</p>}
      {trend && trend.length > 1 && (
        <div className="mt-auto pt-2">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Trang

export default function AdminDashboard() {
  const { session, isAdmin } = useAuth();
  const [rangeKey, setRangeKey] = useState<RangeKey>("30");
  const range = useMemo(() => buildRange(rangeKey), [rangeKey]);

  const dash = useApi(() => statisticApi.getDashboard(), []);
  const recent = useApi(() => orderApi.getAll({ maxResultCount: 5 }), []);
  const chat = useApi(() => chatSupportApi.getSummary(), []);
  const orders = useApi(() => loadOrders(range), [range]);
  // Doanh thu, giá vốn, lợi nhuận, sản phẩm bán chạy: API chỉ dành cho Quản trị viên.
  const revenue = useApi(
    () =>
      Promise.all([
        statisticApi.getRevenue({ ...range.cur, groupBy: RevenueGroupBy.Day }),
        statisticApi.getRevenue({ ...range.prev, groupBy: RevenueGroupBy.Day }),
      ]),
    [range],
    isAdmin
  );
  const top = useApi(() => statisticApi.getTopProducts({ ...range.cur, top: 5 }).then((t) => t.items), [range], isAdmin);

  // Đơn mới, đổi trạng thái, tồn kho thay đổi → số liệu tự cập nhật (gom các sự kiện dồn dập).
  useRealtimeRefresh(["OrderCreated", "OrderStatusChanged", "StockChanged", "ProductChanged"], () => {
    void dash.reload();
    void recent.reload();
  });
  useRealtimeRefresh(
    ["OrderCreated", "OrderStatusChanged"],
    () => {
      void orders.reload();
      if (isAdmin) {
        void revenue.reload();
        void top.reload();
      }
    },
    1500
  );
  useRealtimeRefresh(["ChatConversationChanged"], chat.reload, 600);

  const d = dash.data;
  const o = orders.data;
  const [rev, prevRev] = revenue.data ?? [];
  const low = d?.lowStockVariants ?? [];

  // Chuỗi theo ngày.
  const dayKeys = range.days.map(toDateParam);
  const xLabels = range.days.map(dd);
  const xTitles = range.days.map((x) => `${WEEKDAYS[x.getDay()]}, ${dd(x)}/${x.getFullYear()}`);
  const revByDay = (r?: RevenueReport) => {
    const m = new Map((r?.items ?? []).map((p) => [p.period.slice(0, 10), p]));
    return m;
  };
  const curRevMap = revByDay(rev);
  const prevRevMap = revByDay(prevRev);
  const prevDayKeys = range.days.map((x) => toDateParam(addDays(x, -range.days.length)));
  const revenueSeries = dayKeys.map((k) => curRevMap.get(k)?.revenue ?? 0);
  const prevRevenueSeries = prevDayKeys.map((k) => prevRevMap.get(k)?.revenue ?? 0);
  const completedSeries = dayKeys.map((k) => curRevMap.get(k)?.orderCount ?? 0);
  const aovSeries = dayKeys.map((k) => {
    const p = curRevMap.get(k);
    return p && p.orderCount ? p.revenue / p.orderCount : null;
  });

  const orderCounts = useMemo(() => {
    const perDay = new Map<string, number>();
    const completedPerDay = new Map<string, number>();
    let pickup = 0;
    let bank = 0;
    for (const x of o?.items ?? []) {
      const k = x.creationTime.slice(0, 10);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
      if (x.status === OrderStatus.Completed) completedPerDay.set(k, (completedPerDay.get(k) ?? 0) + 1);
      if (x.deliveryMethod === DeliveryMethod.StorePickup) pickup++;
      if (x.paymentMethod === PaymentMethod.BankTransfer) bank++;
    }
    const n = o?.items.length ?? 0;
    return {
      perDay: dayKeys.map((k) => perDay.get(k) ?? 0),
      completedPerDay: dayKeys.map((k) => completedPerDay.get(k) ?? 0),
      pickup,
      shipping: n - pickup,
      bank,
      cod: n - bank,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, rangeKey]);

  const completed = o?.byStatus[OrderStatus.Completed] ?? 0;
  const canceled = o?.byStatus[OrderStatus.Canceled] ?? 0;
  const cancelRate = o && o.total ? (canceled / o.total) * 100 : null;
  const prevCancelRate = o && o.prevTotal ? (o.prevCanceled / o.prevTotal) * 100 : null;
  const aov = rev && rev.orderCount ? rev.totalRevenue / rev.orderCount : null;
  const prevAov = prevRev && prevRev.orderCount ? prevRev.totalRevenue / prevRev.orderCount : null;

  const todayNote = d
    ? `Hôm nay: ${d.todayOrderCount} đơn mới${d.todayRevenue != null ? ` · doanh thu ${formatVND(d.todayRevenue)}` : ""}.`
    : "";

  // Việc cần làm: số việc đang chờ, bấm để tới đúng danh sách.
  const todos: { href: string; label: string; value: number | undefined; icon: typeof ShoppingCart; urgent?: boolean }[] = [
    { href: `/orders?status=${OrderStatus.Pending}`, label: "Đơn chờ xử lý", value: d?.pendingOrderCount, icon: ShoppingCart, urgent: true },
    { href: `/orders?status=${OrderStatus.Shipping}`, label: "Đơn đang giao", value: d?.shippingOrderCount, icon: Truck },
    { href: `/orders?status=${OrderStatus.ReadyForPickup}`, label: "Chờ khách nhận tại cửa hàng", value: d?.readyForPickupOrderCount ?? 0, icon: Store },
    { href: "/support", label: "Khách cần hỗ trợ", value: chat.data ? chat.data.waitingCount + chat.data.mineUnread : undefined, icon: Headset, urgent: true },
    { href: "/products?warn=1", label: `Biến thể tồn ≤ ${LOW_STOCK_THRESHOLD}`, value: d ? (low.length >= 10 ? 10 : low.length) : undefined, icon: PackageX, urgent: true },
  ];

  const refetching = (orders.loading && !!o) || (revenue.loading && !!rev);
  const statusRows = [OrderStatus.Pending, OrderStatus.Shipping, OrderStatus.ReadyForPickup, OrderStatus.Completed, OrderStatus.Canceled].map((s) => ({
    key: String(s),
    label: ORDER_STATUS[s].label,
    value: o?.byStatus[s] ?? 0,
  }));

  return (
    <div>
      <PageHeader title="Tổng quan" subtitle={session ? `Xin chào ${session.name}. ${todayNote}` : undefined} />

      {dash.error && !d ? (
        <ErrorBox error={dash.error} onRetry={dash.reload} className="mb-3" />
      ) : (
        <section aria-label="Việc cần làm" className="hsv-card mb-4 grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {todos.map((t) => {
            const Icon = t.icon;
            const active = (t.value ?? 0) > 0;
            return (
              <Link key={t.href} href={t.href} className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-surface-2">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active && t.urgent ? "bg-warn-soft text-warn" : "bg-surface-active text-muted2")}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-5">
                    {t.value === undefined ? (
                      <span className="inline-block h-4 w-6 animate-pulse rounded bg-surface-active" aria-label="Đang tải" />
                    ) : t.value >= 10 && t.href.includes("warn") ? (
                      "10+"
                    ) : (
                      t.value
                    )}
                  </span>
                  <span className="block text-xs leading-4 text-muted2 lg:truncate">{t.label}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </section>
      )}

      {/* Bộ lọc thời gian: một hàng phía trên, áp cho mọi số liệu và biểu đồ bên dưới. */}
      <div className="hsv-toolbar mb-3">
        <CalendarDays className="ml-1 h-4 w-4 text-muted2" aria-hidden />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <Chip key={r.key} active={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <span className="ml-auto pr-1 text-xs text-muted2">
          {dd(range.days[0])} – {dd(range.days[range.days.length - 1])} · so với {range.prevLabel}
        </span>
      </div>

      {orders.error && !o && <ErrorBox error={orders.error} onRetry={orders.reload} className="mb-3" />}
      {o?.truncated && (
        <FormAlert
          tone="warn"
          className="mb-3"
          message={`Kỳ này có ${o.total} đơn; biểu đồ theo ngày và cơ cấu đơn chỉ tính ${o.items.length} đơn mới nhất. Số đơn theo trạng thái vẫn đầy đủ.`}
        />
      )}

      <div className={cn("transition-opacity", refetching && "opacity-60")}>
        {/* Ô chỉ số */}
        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {isAdmin ? (
            <>
              {!rev || !o ? (
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-card" />)
              ) : (
                <>
                  <StatTile
                    label="Doanh thu"
                    hint="Tổng tiền hàng của các đơn đã hoàn thành, theo ngày đặt, trong kỳ đang xem."
                    value={formatVND(rev.totalRevenue)}
                    delta={<Delta pct={change(rev.totalRevenue, prevRev?.totalRevenue ?? 0)} />}
                    trend={revenueSeries}
                  />
                  <StatTile
                    label="Đơn hàng"
                    hint="Số đơn khách đặt trong kỳ (mọi trạng thái)."
                    value={String(o.total)}
                    delta={<Delta pct={change(o.total, o.prevTotal)} />}
                    trend={orderCounts.perDay}
                  />
                  <StatTile
                    label="Đơn đã hoàn thành"
                    hint="Số đơn đặt trong kỳ đã giao xong / khách đã nhận."
                    value={String(rev.orderCount)}
                    delta={<Delta pct={change(rev.orderCount, prevRev?.orderCount ?? 0)} />}
                    trend={completedSeries}
                  />
                  <StatTile
                    label="Giá trị đơn trung bình"
                    hint="Doanh thu chia cho số đơn đã hoàn thành trong kỳ."
                    value={money(aov)}
                    delta={<Delta pct={aov != null && prevAov ? change(aov, prevAov) : null} />}
                    trend={aovSeries}
                  />
                </>
              )}
            </>
          ) : !o || !d ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-card" />)
          ) : (
            <>
              <StatTile
                label="Đơn hàng"
                hint="Số đơn khách đặt trong kỳ (mọi trạng thái)."
                value={String(o.total)}
                delta={<Delta pct={change(o.total, o.prevTotal)} />}
                trend={orderCounts.perDay}
              />
              <StatTile
                label="Đơn đã hoàn thành"
                hint="Số đơn đặt trong kỳ đã giao xong / khách đã nhận."
                value={String(completed)}
                delta={<Delta pct={change(completed, o.prevCompleted)} />}
                trend={orderCounts.completedPerDay}
              />
              <StatTile
                label="Tỷ lệ hủy đơn"
                hint="Số đơn đã hủy chia cho tổng số đơn đặt trong kỳ."
                value={cancelRate == null ? "—" : `${Math.round(cancelRate * 10) / 10}%`}
                delta={<Delta pct={cancelRate != null && prevCancelRate ? change(cancelRate, prevCancelRate) : null} upIsGood={false} />}
              />
              <StatTile label="Khách hàng" hint="Tổng số tài khoản khách hàng của cửa hàng." value={String(d.customerCount)} note="Tính đến hôm nay" />
            </>
          )}
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-3">
          {/* Doanh thu theo thời gian + phân tích doanh thu (Quản trị viên) */}
          {isAdmin && (
            <>
              <Card title="Doanh thu theo thời gian" className="xl:col-span-2">
                {revenue.error && !rev ? (
                  <ErrorBox error={revenue.error} onRetry={revenue.reload} className="border-0 shadow-none" />
                ) : !rev ? (
                  <Skeleton className="h-[248px]" />
                ) : (
                  <>
                    <p className="-mt-1 mb-2 text-xl font-semibold tracking-[-0.01em]">{formatVND(rev.totalRevenue)}</p>
                    <LineChart
                      label={`Doanh thu theo ngày, ${RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase()}`}
                      series={[
                        { key: "cur", label: `${dd(range.days[0])} – ${dd(range.days[range.days.length - 1])}`, color: CHART.primary, values: revenueSeries },
                        { key: "prev", label: `Kỳ trước (${range.prevLabel})`, color: CHART.previous, values: prevRevenueSeries, dashed: true },
                      ]}
                      xLabels={xLabels}
                      xTitles={xTitles}
                      format={(v) => formatVND(Math.round(v))}
                      formatAxis={axisMoney}
                    />
                  </>
                )}
              </Card>

              <Card
                title="Phân tích doanh thu"
                actions={
                  <Link href="/statistics" className="hsv-link text-xs">
                    Thống kê chi tiết
                  </Link>
                }
              >
                {!rev ? (
                  <LoadingRows rows={6} />
                ) : (
                  <>
                    <table className="w-full text-[13px]">
                      <tbody>
                        {[
                          ["Doanh thu (đơn hoàn thành)", money(rev.totalRevenue), change(rev.totalRevenue, prevRev?.totalRevenue ?? 0), true],
                          ["Giá vốn hàng bán", money(rev.totalCost), change(rev.totalCost, prevRev?.totalCost ?? 0), false],
                          ["Lợi nhuận gộp", money(rev.totalProfit), change(rev.totalProfit, prevRev?.totalProfit ?? 0), true],
                          ["Tỷ suất lợi nhuận", rev.profitMargin == null ? "—" : `${rev.profitMargin.toLocaleString("vi-VN")}%`, null, true],
                          ["Đơn hoàn thành", String(rev.orderCount), change(rev.orderCount, prevRev?.orderCount ?? 0), true],
                          ["Giá trị đơn trung bình", money(aov), aov != null && prevAov ? change(aov, prevAov) : null, true],
                        ].map(([label, value, pct, upIsGood], i) => (
                          <tr key={String(label)} className={cn("border-line-2", i > 0 && "border-t")}>
                            <td className="py-2 pr-2 text-ink-2">{label}</td>
                            <td className="py-2 text-right font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                              {value}
                            </td>
                            <td className="w-14 py-2 text-right">
                              <Delta pct={pct as number | null} upIsGood={upIsGood as boolean} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(rev.uncostedQuantity ?? 0) > 0 && (
                      <p className="mt-2 text-xs text-muted2">{rev.uncostedQuantity} sản phẩm đã bán chưa có giá vốn nên không tính vào giá vốn và lợi nhuận.</p>
                    )}
                  </>
                )}
              </Card>
            </>
          )}

          {/* Đơn hàng theo ngày + theo trạng thái */}
          <Card title="Đơn hàng theo ngày" className="xl:col-span-2">
            {!o ? (
              <Skeleton className="h-[180px]" />
            ) : (
              <>
                <p className="-mt-1 mb-2 text-xl font-semibold tracking-[-0.01em]">{o.total} đơn</p>
                <ColumnChart label="Số đơn đặt mỗi ngày" values={orderCounts.perDay} xLabels={xLabels} xTitles={xTitles} format={(v) => `${v} đơn`} />
              </>
            )}
          </Card>

          <Card
            title="Đơn hàng theo trạng thái"
            actions={
              <Link href="/orders" className="hsv-link text-xs">
                Xem đơn hàng
              </Link>
            }
          >
            {!o ? <LoadingRows rows={5} /> : <BarList label="Số đơn theo trạng thái trong kỳ" rows={statusRows} format={(v) => String(v)} />}
          </Card>

          {/* Cơ cấu, bán chạy, sắp hết */}
          <Card title="Cơ cấu đơn hàng">
            {!o ? (
              <LoadingRows rows={4} />
            ) : o.items.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Chưa có đơn trong kỳ này" className="py-8" />
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted2">Hình thức nhận hàng</p>
                  <SegmentedBar
                    label="Hình thức nhận hàng"
                    parts={[
                      { key: "ship", label: "Giao tận nơi", value: orderCounts.shipping, color: CHART.primary },
                      { key: "pickup", label: "Nhận tại cửa hàng", value: orderCounts.pickup, color: CHART.secondary },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted2">Thanh toán</p>
                  <SegmentedBar
                    label="Phương thức thanh toán"
                    parts={[
                      { key: "cod", label: "Thanh toán khi nhận hàng", value: orderCounts.cod, color: CHART.primary },
                      { key: "bank", label: "Chuyển khoản", value: orderCounts.bank, color: CHART.secondary },
                    ]}
                  />
                </div>
              </div>
            )}
          </Card>

          {isAdmin && (
            <Card
              title="Sản phẩm bán chạy"
              actions={
                <Link href="/statistics" className="hsv-link text-xs">
                  Xem thêm
                </Link>
              }
            >
              {top.error && !top.data ? (
                <ErrorBox error={top.error} onRetry={top.reload} className="border-0 shadow-none" />
              ) : !top.data ? (
                <LoadingRows rows={5} />
              ) : top.data.length === 0 ? (
                <EmptyState icon={PackageCheck} title="Chưa bán được sản phẩm nào trong kỳ" className="py-8" />
              ) : (
                <BarList
                  label="Doanh thu theo sản phẩm bán chạy"
                  rows={top.data.map((t) => ({ key: String(t.productId), label: t.productName, sub: `${t.quantitySold} sp`, value: t.revenue }))}
                  format={(v) => formatVND(v)}
                />
              )}
            </Card>
          )}

          <Card
            flush
            title="Biến thể sắp hết hàng"
            actions={
              <Link href="/products?warn=1" className="hsv-link text-xs">
                Xem tất cả
              </Link>
            }
          >
            <div className="mt-3 border-t border-line">
              {!d ? (
                <LoadingRows rows={4} />
              ) : low.length === 0 ? (
                <EmptyState icon={PackageCheck} title="Tồn kho ổn định" body="Không có biến thể nào dưới ngưỡng." className="py-8" />
              ) : (
                low.slice(0, 6).map((v) => (
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

          {/* Đơn mới nhất */}
          <Card
            flush
            title="Đơn hàng mới nhất"
            className={cn(isAdmin ? "xl:col-span-3" : "xl:col-span-2")}
            actions={
              <Link href="/orders" className="hsv-link text-xs">
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
                recent.data.items.map((x) => (
                  <Link
                    key={x.id}
                    href={`/orders?open=${x.id}`}
                    className="hsv-trow grid grid-cols-[100px_minmax(0,1fr)_96px] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)_140px_130px_110px]"
                  >
                    <span className="font-medium">{x.code}</span>
                    <span className="min-w-0 truncate">{x.receiverName}</span>
                    <span className="hidden text-muted2 sm:block">{formatDateTime(x.creationTime)}</span>
                    <span className="hidden sm:block">
                      <StatusBadge status={x.status} />
                    </span>
                    <span className="text-right font-medium">{formatVND(x.totalAmount)}</span>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
