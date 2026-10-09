"use client";

import { useState } from "react";
import { Chip, ErrorBox, FormAlert, LoadingRows, Skeleton } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { statisticApi } from "@/lib/api/services";
import { RevenueGroupBy } from "@/lib/api/types";
import { formatShortVND, formatVND, toDateParam } from "@/lib/hsv/format";
import { mockRevenue, mockTopProducts } from "@/lib/hsv/mock-cost";
import { cn } from "@/lib/utils";

type Month = { y: number; m: number };

/** Các khoảng thời gian tính theo ngày hiện tại → fromDate/toDate (yyyy-MM-dd). */
/** Backend cũ (chưa cập nhật) không trả giá vốn/lợi nhuận → dev: dữ liệu ảo (mock-cost), production: hiện "—". */
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
  const [ranges] = useState(() => buildRanges(new Date()));
  const [key, setKey] = useState("6m");
  const [hover, setHover] = useState<number | null>(null);
  const range = ranges.find((r) => r.key === key) ?? ranges[0];

  // Doanh thu chỉ tính trên đơn ở trạng thái "Hoàn thành" (phía server).
  const revenue = useApi(
    () => statisticApi.getRevenue({ fromDate: range.fromDate, toDate: range.toDate, groupBy: RevenueGroupBy.Month }).then(mockRevenue),
    [range.key]
  );
  const top = useApi(
    () => statisticApi.getTopProducts({ fromDate: range.fromDate, toDate: range.toDate, top: 5 }).then((t) => mockTopProducts(t.items)),
    [range.key]
  );

  const r = revenue.data?.data;
  const topItems = top.data?.data;
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-subtle">Khoảng thời gian</span>
        {ranges.map((x) => (
          <Chip key={x.key} active={key === x.key} onClick={() => setKey(x.key)}>
            {x.label}
          </Chip>
        ))}
      </div>

      {revenue.error && !r ? (
        <ErrorBox error={revenue.error} onRetry={revenue.reload} />
      ) : empty ? (
        <div className="rounded-card border border-dashed border-line-3 bg-white px-6 py-20 text-center">
          <p className="text-base font-semibold">Chưa có dữ liệu</p>
          <p className="mt-1.5 text-[13.5px] text-subtle">Không có đơn hoàn thành trong khoảng thời gian này.</p>
        </div>
      ) : (
        <>
          {r && (r.uncostedQuantity ?? 0) > 0 && (
            <div className="mb-3.5">
              <FormAlert
                tone="warn"
                message={`${r.uncostedQuantity} sản phẩm đã bán chưa có giá vốn (bán trước khi có phiếu nhập kho) nên không được tính vào giá vốn và lợi nhuận.`}
              />
            </div>
          )}
          <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
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
                <div key={l} className="hsv-card p-5">
                  <p className="text-[13px] text-subtle">{l}</p>
                  <p className={cn("mt-2 text-[26px] font-bold", l === "Lợi nhuận gộp" && r.totalProfit < 0 && "text-danger")}>{v}</p>
                  {note && <p className="mt-1 text-[12px] text-faint">{note}</p>}
                </div>
              ) : (
                <Skeleton key={i} className="h-[104px]" />
              )
            )}
          </div>

          <div className={cn("grid gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]", revenue.loading && r && "opacity-70")}>
            <div className="hsv-card p-[22px]">
              <p className="mb-5 text-[15px] font-bold">Doanh thu theo tháng</p>
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
                          {(showAllLabels || isMax) && <span className="text-[11.5px] font-semibold text-ink-2">{formatShortVND(b.value)}</span>}
                          <div
                            className={cn("w-full max-w-[56px] rounded-t transition-opacity", isMax && b.value ? "bg-gold" : "bg-[#cdb999]", hover !== null && hover !== i && "opacity-60")}
                            style={{ height: h }}
                          />
                          {hover === i && (
                            <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-navy px-3 py-2 text-xs text-white shadow-dropdown" style={{ bottom: h + 34 }}>
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
                      <span key={b.full} className="flex-1 text-center text-xs text-subtle">
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

            <div className="hsv-card p-[22px]">
              <p className="mb-2.5 text-[15px] font-bold">Sản phẩm bán chạy</p>
              {top.error && !topItems ? (
                <ErrorBox error={top.error} onRetry={top.reload} />
              ) : !topItems ? (
                <LoadingRows rows={5} />
              ) : topItems.length === 0 ? (
                <p className="text-[13.5px] text-subtle">Chưa có dữ liệu.</p>
              ) : (
                topItems.map((b, i) => (
                  <div key={b.productId} className="flex items-center gap-3 border-t border-line-2 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[13px] font-bold text-gold">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{b.productName}</span>
                      <span className="block text-xs text-subtle">{b.quantitySold} sản phẩm</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-bold">{formatVND(b.revenue)}</span>
                      <span className={cn("block text-xs", (b.profit ?? 0) < 0 ? "text-danger" : "text-ok")}>Lãi {money(b.profit)}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
