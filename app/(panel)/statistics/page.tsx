"use client";

import { useState } from "react";
import { BarChart3, FileSpreadsheet, Loader2 } from "lucide-react";
import { Card, Chip, EmptyState, ErrorBox, FormAlert, LoadingRows, notify, PageHeader, Skeleton } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { statisticApi } from "@/lib/api/services";
import { exportBusinessReport } from "@/lib/hsv/export-report";
import { RevenueGroupBy } from "@/lib/api/types";
import { formatShortVND, formatVND, toDateParam } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

type Month = { y: number; m: number };

/** Các khoảng thời gian tính theo ngày hiện tại → fromDate/toDate (yyyy-MM-dd). */
/** Thiếu dữ liệu giá vốn / lợi nhuận thì hiện "—". */
const money = (v: number | null | undefined) => (v == null ? "—" : formatVND(Math.round(v)));

function buildRanges(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const monthsBack = (n: number): Month[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(y, m - 1 - (n - 1 - i), 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  const q = Math.ceil(m / 3);
  const pq = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
  const range = (key: string, label: string, months: Month[]) => {
    const first = months[0];
    const last = months[months.length - 1];
    const end = new Date(last.y, last.m, 0); // ngày cuối tháng
    return {
      key,
      label,
      months,
      fromDate: toDateParam(new Date(first.y, first.m - 1, 1)),
      toDate: toDateParam(end > now ? now : end),
    };
  };
  return [
    range("6m", "6 tháng gần nhất", monthsBack(6)),
    range("pq", `Quý ${pq.q}/${pq.y}`, [1, 2, 3].map((i) => ({ y: pq.y, m: (pq.q - 1) * 3 + i }))),
    range("y", `Năm ${y}`, Array.from({ length: m }, (_, i) => ({ y, m: i + 1 }))),
    range("y-1", `Năm ${y - 1}`, Array.from({ length: 12 }, (_, i) => ({ y: y - 1, m: i + 1 }))),
  ];
}

export default function AdminStatistics() {
  const { session } = useAuth();
  const [ranges] = useState(() => buildRanges(new Date()));
  const [key, setKey] = useState("6m");
  const [hover, setHover] = useState<number | null>(null);
  const range = ranges.find((r) => r.key === key) ?? ranges[0];

  // Doanh thu chỉ tính trên đơn ở trạng thái "Hoàn thành" (phía server).
  const revenue = useApi(
    () => statisticApi.getRevenue({ fromDate: range.fromDate, toDate: range.toDate, groupBy: RevenueGroupBy.Month }),
    [range.key]
  );
  const top = useApi(
    () => statisticApi.getTopProducts({ fromDate: range.fromDate, toDate: range.toDate, top: 5 }).then((t) => t.items),
    [range.key]
  );

  const r = revenue.data;
  const topItems = top.data;

  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      await exportBusinessReport(range, session?.name ?? "Quản trị viên");
      notify("Đã xuất báo cáo Excel");
    } catch (e) {
      notify(`Không xuất được báo cáo: ${toApiError(e).message}`);
    } finally {
      setExporting(false);
    }
  };
  // items chỉ có kỳ phát sinh doanh thu → tự điền 0 cho tháng trống.
  const byMonth = new Map((r?.items ?? []).map((p) => [p.period.slice(0, 7), p]));
  const buckets = range.months.map(({ y, m }) => {
    const p = byMonth.get(`${y}-${String(m).padStart(2, "0")}`);
    return { label: `T${m}`, full: `Tháng ${m}/${y}`, value: p?.revenue ?? 0, count: p?.orderCount ?? 0, profit: p ? p.profit : 0 };
  });
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const showAllLabels = buckets.length <= 6;
  const empty = r && r.orderCount === 0;

  return (
    <div>
      <PageHeader
        title="Thống kê"
        subtitle="Doanh thu chỉ tính trên đơn đã hoàn thành."
        actions={
          <button type="button" onClick={onExport} disabled={exporting || !r} className="hsv-btn-secondary">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </button>
        }
      />
      <div className="hsv-toolbar">
        <span className="pl-1 text-xs text-muted2">Khoảng thời gian</span>
        <div className="flex flex-wrap gap-1">
          {ranges.map((x) => (
            <Chip key={x.key} active={key === x.key} onClick={() => setKey(x.key)}>
              {x.label}
            </Chip>
          ))}
        </div>
      </div>

      {revenue.error && !r ? (
        <ErrorBox error={revenue.error} onRetry={revenue.reload} />
      ) : empty ? (
        <div className="hsv-card">
          <EmptyState icon={BarChart3} title="Chưa có dữ liệu" body="Không có đơn hoàn thành trong khoảng thời gian này." className="py-16" />
        </div>
      ) : (
        <>
          {r && (r.uncostedQuantity ?? 0) > 0 && (
            <FormAlert
              tone="warn"
              className="mb-3"
              message={`${r.uncostedQuantity} sản phẩm đã bán chưa có giá vốn (bán trước khi có phiếu nhập kho) nên không được tính vào giá vốn và lợi nhuận.`}
            />
          )}
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(r
              ? [
                  ["Doanh thu", formatVND(r.totalRevenue), `${r.orderCount} đơn hoàn thành`],
                  ["Giá vốn hàng bán", money(r.totalCost), ""],
                  ["Lợi nhuận gộp", money(r.totalProfit), ""],
                  ["Tỷ suất lợi nhuận", r.profitMargin == null ? "—" : `${r.profitMargin.toLocaleString("vi-VN")}%`, ""],
                ]
              : [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]]
            ).map(([l, v, note], i) =>
              r ? (
                <div key={l} className="hsv-card p-4">
                  <p className="text-xs font-medium text-muted2">{l}</p>
                  <p className={cn("mt-1 text-xl font-semibold tracking-[-0.01em]", l === "Lợi nhuận gộp" && r.totalProfit < 0 && "text-danger")}>{v}</p>
                  <p className="mt-0.5 min-h-4 text-xs text-muted2">{note}</p>
                </div>
              ) : (
                <Skeleton key={i} className="h-[92px] rounded-card" />
              )
            )}
          </div>

          <div className={cn("grid items-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]", revenue.loading && r && "opacity-70")}>
            <div className="hsv-card p-4">
              <p className="hsv-card-title mb-5">Doanh thu theo tháng</p>
              {!r ? (
                <Skeleton className="h-[240px]" />
              ) : (
                <>
                  <div className="relative flex h-[240px] items-end gap-0.5 border-b border-line" role="img" aria-label={`Biểu đồ doanh thu ${range.label}`}>
                    {buckets.map((b, i) => {
                      const isMax = b.value === max;
                      const h = b.value ? Math.max(6, Math.round((b.value / max) * 190)) : 2;
                      return (
                        <div
                          key={b.full}
                          className="relative flex h-full flex-1 flex-col items-center justify-end gap-2"
                          onMouseEnter={() => setHover(i)}
                          onMouseLeave={() => setHover(null)}
                        >
                          {(showAllLabels || isMax) && <span className="text-[11px] font-medium text-ink-2">{formatShortVND(b.value)}</span>}
                          <div
                            className={cn("w-full max-w-[56px] rounded-t-md transition-opacity", isMax && b.value ? "bg-brand" : "bg-[#b5b5b5]", hover !== null && hover !== i && "opacity-60")}
                            style={{ height: h }}
                          />
                          {hover === i && (
                            <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-brand px-3 py-2 text-xs text-white shadow-dropdown" style={{ bottom: h + 34 }}>
                              <p className="font-semibold">{b.full}</p>
                              <p className="mt-0.5">
                                {formatVND(b.value)} · {b.count} đơn
                              </p>
                              <p className="mt-0.5">Lợi nhuận: {money(b.profit)}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-0.5">
                    {buckets.map((b) => (
                      <span key={b.full} className="flex-1 text-center text-xs text-muted2">
                        {b.label}
                      </span>
                    ))}
                  </div>
                  <table className="sr-only">
                    <caption>Doanh thu theo tháng – {range.label}</caption>
                    <thead>
                      <tr>
                        <th>Tháng</th>
                        <th>Doanh thu</th>
                        <th>Số đơn</th>
                        <th>Lợi nhuận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buckets.map((b) => (
                        <tr key={b.full}>
                          <td>{b.full}</td>
                          <td>{formatVND(b.value)}</td>
                          <td>{b.count}</td>
                          <td>{money(b.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            <Card flush title="Sản phẩm bán chạy">
              <div className="mt-3 border-t border-line">
                {top.error && !topItems ? (
                  <ErrorBox error={top.error} onRetry={top.reload} className="m-4" />
                ) : !topItems ? (
                  <LoadingRows rows={5} />
                ) : topItems.length === 0 ? (
                  <EmptyState icon={BarChart3} title="Chưa có dữ liệu" className="py-9" />
                ) : (
                  topItems.map((b, i) => (
                    <div key={b.productId} className="hsv-trow flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-active text-xs font-semibold text-ink-2">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{b.productName}</span>
                        <span className="block text-xs text-muted2">{b.quantitySold} sản phẩm</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-medium">{formatVND(b.revenue)}</span>
                        <span className={cn("block text-xs", (b.profit ?? 0) < 0 ? "text-danger" : "text-ok")}>Lãi {money(b.profit)}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
