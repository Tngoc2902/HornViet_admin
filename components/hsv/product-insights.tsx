"use client";

import type { ReactNode } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { statisticApi, stockReceiptApi } from "@/lib/api/services";
import type { VariantCost } from "@/lib/api/types";
import { formatShortVND, formatVND, toDateParam } from "@/lib/hsv/format";

const DAYS = 30;
/** Statistic/GetTopProducts trả tối đa 50 sản phẩm bán chạy nhất. */
const TOP_LIMIT = 50;
/** Trang tối đa của các API danh sách (AppConsts.MaxPageSize ở backend). */
const PAGE = 100;

type Grade = "A" | "B" | "C";

async function loadAllVariantCosts() {
  const all: VariantCost[] = [];
  for (;;) {
    const r = await stockReceiptApi.getVariantCosts({ skipCount: all.length, maxResultCount: PAGE });
    all.push(...r.items);
    if (!r.items.length || all.length >= r.totalCount) return all;
  }
}

/**
 * Chỉ số tồn kho 30 ngày gần nhất, tính từ hai API sẵn có của Quản trị viên:
 * lượng bán theo sản phẩm (đơn đã hoàn thành) và tồn kho / giá vốn hiện tại của từng biến thể.
 */
async function loadInsights() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (DAYS - 1));
  const [sales, variants] = await Promise.all([
    statisticApi.getTopProducts({ fromDate: toDateParam(from), toDate: toDateParam(to), top: TOP_LIMIT }).then((r) => r.items),
    loadAllVariantCosts(),
  ]);

  const sold = sales.reduce((s, p) => s + p.quantitySold, 0);
  const stock = variants.reduce((s, v) => s + v.stockQuantity, 0);

  // Xếp hạng ABC theo doanh thu trong kỳ: nhóm A góp 80% doanh thu đầu, B 15% tiếp theo, C phần còn lại (kể cả sản phẩm chưa bán được).
  const revenue = sales.reduce((s, p) => s + p.revenue, 0);
  const grade = new Map<number, Grade>();
  let cumulative = 0;
  for (const p of [...sales].sort((a, b) => b.revenue - a.revenue)) {
    const share = revenue > 0 ? cumulative / revenue : 1;
    grade.set(p.productId, share < 0.8 ? "A" : share < 0.95 ? "B" : "C");
    cumulative += p.revenue;
  }
  const valueByGrade: Record<Grade, number> = { A: 0, B: 0, C: 0 };
  for (const v of variants) valueByGrade[grade.get(v.productId) ?? "C"] += v.stockValue ?? 0;

  return {
    sold,
    stock,
    /** Lượng bán / (lượng bán + tồn cuối kỳ); null khi chưa có cả hai. */
    sellThrough: sold + stock > 0 ? sold / (sold + stock) : null,
    /** Tồn cuối kỳ / lượng bán mỗi ngày; null khi kỳ này chưa bán được gì. */
    daysLeft: sold > 0 ? stock / (sold / DAYS) : null,
    stockValue: valueByGrade.A + valueByGrade.B + valueByGrade.C,
    valueByGrade,
    /** Biến thể còn hàng nhưng chưa có giá vốn → không được tính vào giá trị tồn. */
    uncosted: variants.filter((v) => v.stockQuantity > 0 && v.averageCost === null).length,
    /** Có thể còn sản phẩm đã bán nằm ngoài 50 dòng API trả về. */
    truncated: sales.length >= TOP_LIMIT,
  };
}

function Metric({ label, value, sub, description, formula, note }: { label: string; value: ReactNode; sub?: ReactNode; description: string; formula: string; note?: string }) {
  return (
    <div className="group relative min-w-[200px] flex-1 px-4 py-1">
      <button type="button" className="cursor-help rounded border-b border-dotted border-faint text-left text-[13px] font-medium leading-5">
        {label}
      </button>
      <div className="mt-0.5 text-[13px] font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted2">{sub}</div>}
      {/* Chú giải: hiện khi rê chuột hoặc khi nhãn đang được chọn bằng bàn phím. */}
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute left-4 top-full z-20 mt-1 w-[300px] rounded-xl bg-brand p-3 text-left text-white opacity-0 shadow-dropdown transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-chrome-text">{description}</p>
        <p className="mt-2 font-mono text-[11px] leading-4 text-[#86e5ab]">{formula}</p>
        {note && <p className="mt-2 text-[11px] leading-4 text-chrome-muted">{note}</p>}
      </div>
    </div>
  );
}

const short = (v: number) => (v > 0 ? formatShortVND(v) : "0");

/** Dải chỉ số phía trên danh sách Sản phẩm. Chỉ dùng cho Quản trị viên (API thống kê và giá vốn là API riêng của Quản trị viên). */
export function ProductInsights() {
  const { data, error, loading, reload } = useApi(loadInsights, []);
  // Đơn hoàn thành / tồn kho thay đổi → tính lại (gom các sự kiện đến dồn dập).
  useRealtimeRefresh(["OrderStatusChanged", "StockChanged"], reload, 1500);

  const completedNote = "Lượng bán chỉ tính trên đơn đã hoàn thành trong 30 ngày gần nhất.";
  const truncatedNote = data?.truncated ? " Kỳ này có từ 50 sản phẩm bán được trở lên nên lượng bán có thể thiếu các sản phẩm bán ít nhất." : "";

  return (
    <div className="mb-3 flex flex-wrap items-start gap-y-2" aria-busy={loading}>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-r border-line pl-1 pr-5 text-xs text-ink-2" title="Kỳ tính: 30 ngày gần nhất">
        <CalendarDays className="h-3.5 w-3.5" />
        {DAYS} ngày
      </div>
      {error && !data ? (
        <p className="flex h-12 items-center gap-2 px-4 text-[13px] text-muted2">
          Không tải được chỉ số: {error.message}
          <button onClick={() => void reload()} className="hsv-btn-icon" aria-label="Tải lại chỉ số">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </p>
      ) : !data ? (
        <div className="flex flex-1 gap-4 px-4 py-1">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 flex-1" />
          ))}
        </div>
      ) : (
        <>
          <Metric
            label="Tỷ lệ bán ra trung bình"
            value={data.sellThrough === null ? "Không có dữ liệu" : `${(Math.round(data.sellThrough * 1000) / 10).toLocaleString("vi-VN")}%`}
            sub={`${data.sold} đã bán · ${data.stock} còn trong kho`}
            description="Tỷ lệ bán hết trong khoảng thời gian đã cho."
            formula="tỷ lệ bán hết = số lượng đã bán / (số lượng đã bán + số lượng tồn kho cuối kỳ)"
            note={completedNote + truncatedNote}
          />
          <Metric
            label="Số ngày tồn kho còn lại"
            value={data.daysLeft === null ? "Không có dữ liệu" : `${Math.round(data.daysLeft).toLocaleString("vi-VN")} ngày`}
            sub={data.daysLeft === null ? "Kỳ này chưa bán được sản phẩm nào" : `Bán trung bình ${(Math.round((data.sold / DAYS) * 10) / 10).toLocaleString("vi-VN")} sản phẩm / ngày`}
            description="Số ngày tồn kho dự kiến còn lại nếu vẫn bán với tốc độ của kỳ này."
            formula="số ngày tồn kho còn lại = số lượng tồn kho cuối kỳ / số lượng đã bán mỗi ngày"
            note={completedNote + truncatedNote}
          />
          <Metric
            label="Giá trị tồn kho (ABC)"
            value={formatVND(Math.round(data.stockValue))}
            sub={`A ${short(data.valueByGrade.A)} · B ${short(data.valueByGrade.B)} · C ${short(data.valueByGrade.C)}`}
            description="Giá trị của tất cả hàng tồn kho hiện tại, dựa trên giá vốn bình quân, chia theo nhóm A / B / C."
            formula="giá trị hàng tồn kho = số lượng tồn kho cuối kỳ × giá vốn bình quân"
            note={`Nhóm A: sản phẩm góp 80% doanh thu đầu của kỳ; B: 15% tiếp theo; C: còn lại và sản phẩm chưa bán được.${
              data.uncosted ? ` ${data.uncosted} biến thể còn hàng chưa có giá vốn nên chưa được tính.` : ""
            }`}
          />
        </>
      )}
    </div>
  );
}
