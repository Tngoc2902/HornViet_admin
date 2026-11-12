import { orderApi, productApi, statisticApi, stockReceiptApi } from "@/lib/api/services";
import {
  DeliveryMethod,
  type OrderListItem,
  OrderStatus,
  PaymentMethod,
  type ProductAdminListItem,
  RevenueGroupBy,
  type StockReceipt,
  type TopProduct,
  type VariantCost,
} from "@/lib/api/types";
import { formatShortVND, formatVND, ORDER_STATUS, toDateParam } from "@/lib/hsv/format";

/*
 * Báo cáo (kiểu mục Phân tích › Báo cáo của Shopify). Mỗi báo cáo = một định nghĩa: tên, danh mục, quyền, loại thời gian
 * và hàm `run` tính số liệu từ các API sẵn có rồi trả về một "khung nhìn" chung (ô tóm tắt, biểu đồ, bảng) để trang
 * Báo cáo vẽ và xuất CSV. Không có thông tin cá nhân của khách trong báo cáo.
 */

export type ReportCategory = "Doanh số" | "Lợi nhuận" | "Đơn hàng" | "Hàng tồn kho";
export const REPORT_CATEGORIES: ReportCategory[] = ["Doanh số", "Lợi nhuận", "Đơn hàng", "Hàng tồn kho"];

// ---------------------------------------------------------------- Kỳ báo cáo

export const PERIODS = [
  { key: "7", label: "7 ngày qua" },
  { key: "30", label: "30 ngày qua" },
  { key: "90", label: "90 ngày qua" },
  { key: "month", label: "Tháng này" },
  { key: "year", label: "Năm nay" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export type Group = "day" | "month";

export type Period = { key: PeriodKey; from: Date; to: Date; fromDate: string; toDate: string; group: Group; label: string };

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dd = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Kỳ tính đến hết hôm nay. Không chọn cách nhóm thì kỳ ≤ 92 ngày nhóm theo ngày, dài hơn nhóm theo tháng. */
export function buildPeriod(key: PeriodKey, group?: Group): Period {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from =
    key === "month" ? new Date(to.getFullYear(), to.getMonth(), 1) : key === "year" ? new Date(to.getFullYear(), 0, 1) : addDays(to, -(Number(key) - 1));
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  return {
    key,
    from,
    to,
    fromDate: toDateParam(from),
    toDate: toDateParam(to),
    group: group ?? (days > 92 ? "month" : "day"),
    label: `${dd(from)}/${from.getFullYear()} – ${dd(to)}/${to.getFullYear()}`,
  };
}

type Bucket = { key: string; label: string; title: string };
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Các mốc của kỳ theo ngày ("2026-11-05") hoặc theo tháng ("2026-11"). */
function buckets(p: Period): Bucket[] {
  const out: Bucket[] = [];
  if (p.group === "day") {
    for (let d = p.from; d <= p.to; d = addDays(d, 1))
      out.push({ key: toDateParam(d), label: dd(d), title: `${WEEKDAYS[d.getDay()]}, ${dd(d)}/${d.getFullYear()}` });
  } else {
    for (let d = new Date(p.from.getFullYear(), p.from.getMonth(), 1); d <= p.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const m = String(d.getMonth() + 1).padStart(2, "0");
      out.push({ key: `${d.getFullYear()}-${m}`, label: `T${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`, title: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` });
    }
  }
  return out;
}
const bucketOf = (iso: string, g: Group) => iso.slice(0, g === "day" ? 10 : 7);

// ---------------------------------------------------------------- Khung nhìn chung

export type Cell = string | number | null;
export type Column = { label: string; align?: "right"; format?: (v: Cell) => string };
export type ChartSpec =
  | { type: "line"; label: string; values: (number | null)[]; format: (v: number) => string; axis: (v: number) => string }
  | { type: "column"; label: string; values: number[]; format: (v: number) => string }
  | { type: "bars"; label: string; rows: { key: string; label: string; sub?: string; value: number }[]; format: (v: number) => string }
  | { type: "segments"; groups: { title: string; parts: { key: string; label: string; value: number }[] }[]; format: (v: number) => string };

export type ReportView = {
  summary?: { label: string; value: string }[];
  chart?: ChartSpec;
  /** Nhãn trục X / tiêu đề từng mốc cho biểu đồ theo thời gian. */
  xLabels?: string[];
  xTitles?: string[];
  columns: Column[];
  rows: Cell[][];
  totals?: Cell[];
  note?: string;
};

export type ReportDef = {
  id: string;
  name: string;
  category: ReportCategory;
  description: string;
  /** API của báo cáo chỉ dành cho Quản trị viên. */
  adminOnly: boolean;
  /** series = theo thời gian (chọn kỳ + nhóm ngày / tháng); range = chỉ chọn kỳ; none = số liệu hiện tại. */
  time: "series" | "range" | "none";
  run: (p: Period, ctx: { isAdmin: boolean }) => Promise<ReportView>;
};

// ---------------------------------------------------------------- Định dạng & đọc dữ liệu

const vnd = (v: Cell) => (v == null ? "—" : formatVND(Math.round(Number(v))));
const num = (v: Cell) => (v == null ? "—" : Number(v).toLocaleString("vi-VN"));
const pct = (v: Cell) => (v == null ? "—" : `${(Math.round(Number(v) * 10) / 10).toLocaleString("vi-VN")}%`);
const axisVnd = (v: number) => (v ? formatShortVND(v) : "0");
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ratio = (a: number, b: number) => (b ? (a / b) * 100 : null);

async function revenueByBucket(p: Period) {
  const r = await statisticApi.getRevenue({ fromDate: p.fromDate, toDate: p.toDate, groupBy: p.group === "day" ? RevenueGroupBy.Day : RevenueGroupBy.Month });
  const map = new Map(r.items.map((i) => [bucketOf(i.period, p.group), i]));
  const bs = buckets(p);
  return { report: r, bs, points: bs.map((b) => map.get(b.key)) };
}

/** Đơn đặt trong kỳ: đọc tối đa 1.000 đơn (10 trang × 100). */
const MAX_PAGES = 10;
async function ordersInPeriod(p: Period) {
  const items: OrderListItem[] = [];
  let total = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await orderApi.getAll({ fromDate: p.fromDate, toDate: p.toDate, skipCount: items.length, maxResultCount: 100 });
    total = page.totalCount;
    items.push(...page.items);
    if (!page.items.length || items.length >= total) break;
  }
  return { items, total, truncated: items.length < total };
}
const truncatedNote = (o: { items: unknown[]; total: number; truncated: boolean }) =>
  o.truncated ? `Kỳ này có ${o.total} đơn; báo cáo chỉ tính ${o.items.length} đơn mới nhất.` : undefined;

async function topProducts(p: Period) {
  return (await statisticApi.getTopProducts({ fromDate: p.fromDate, toDate: p.toDate, top: 50 })).items;
}
const topNote = (items: TopProduct[]) =>
  items.length >= 50 ? "Hệ thống trả tối đa 50 sản phẩm bán chạy nhất; sản phẩm bán ít hơn không có trong báo cáo." : undefined;

/** Tồn kho + giá vốn bình quân của mọi biến thể (đọc hết các trang, mỗi trang 100 dòng — giới hạn của API). */
export async function allVariantCosts() {
  const all: VariantCost[] = [];
  for (;;) {
    const r = await stockReceiptApi.getVariantCosts({ skipCount: all.length, maxResultCount: 100 });
    all.push(...r.items);
    if (!r.items.length || all.length >= r.totalCount) return all;
  }
}

/** Phiếu nhập trong kỳ (API trả mới nhất trước: đọc tới khi gặp phiếu cũ hơn đầu kỳ, tối đa 2.000 phiếu). */
async function receiptsInPeriod(p: Period) {
  const out: StockReceipt[] = [];
  let read = 0;
  for (let i = 0; i < 20; i++) {
    const r = await stockReceiptApi.getAll({ skipCount: read, maxResultCount: 100 });
    read += r.items.length;
    let older = false;
    for (const x of r.items) {
      const day = x.creationTime.slice(0, 10);
      if (day < p.fromDate) older = true;
      else if (day <= p.toDate) out.push(x);
    }
    if (older || !r.items.length || read >= r.totalCount) break;
  }
  return out;
}

/**
 * Xếp hạng ABC theo doanh thu trong kỳ. Nhóm A: sản phẩm góp 80% doanh thu đầu; B: 15% tiếp theo; C: phần còn lại.
 * Sản phẩm không có trong `sales` (chưa bán được) không có trong kết quả — nơi gọi coi là nhóm C.
 */
export function abcGrades(sales: Pick<TopProduct, "productId" | "revenue">[]) {
  const revenue = sum(sales, (s) => s.revenue);
  const grade = new Map<number, "A" | "B" | "C">();
  let cumulative = 0;
  for (const s of [...sales].sort((a, b) => b.revenue - a.revenue)) {
    const share = revenue > 0 ? cumulative / revenue : 1;
    grade.set(s.productId, share < 0.8 ? "A" : share < 0.95 ? "B" : "C");
    cumulative += s.revenue;
  }
  return grade;
}

const periodCol: Column = { label: "Kỳ" };

// ---------------------------------------------------------------- Danh sách báo cáo

export const REPORTS: ReportDef[] = [
  {
    id: "doanh-thu-theo-thoi-gian",
    name: "Doanh thu theo thời gian",
    category: "Doanh số",
    description: "Doanh thu, giá vốn và lợi nhuận gộp của các đơn đã hoàn thành theo ngày hoặc tháng.",
    adminOnly: true,
    time: "series",
    run: async (p) => {
      const { report: r, bs, points } = await revenueByBucket(p);
      return {
        summary: [
          { label: "Doanh thu", value: vnd(r.totalRevenue) },
          { label: "Đơn hoàn thành", value: num(r.orderCount) },
          { label: "Giá trị đơn trung bình", value: vnd(r.orderCount ? r.totalRevenue / r.orderCount : null) },
        ],
        chart: { type: "line", label: "Doanh thu", values: points.map((x) => x?.revenue ?? 0), format: (v) => vnd(v), axis: axisVnd },
        xLabels: bs.map((b) => b.label),
        xTitles: bs.map((b) => b.title),
        columns: [periodCol, { label: "Đơn hoàn thành", align: "right", format: num }, { label: "Doanh thu", align: "right", format: vnd }, { label: "Giá vốn", align: "right", format: vnd }, { label: "Lợi nhuận gộp", align: "right", format: vnd }],
        rows: bs.map((b, i) => [b.title, points[i]?.orderCount ?? 0, points[i]?.revenue ?? 0, points[i]?.cost ?? 0, points[i]?.profit ?? 0]),
        totals: ["Tổng", r.orderCount, r.totalRevenue, r.totalCost, r.totalProfit],
        note: r.uncostedQuantity ? `${r.uncostedQuantity} sản phẩm đã bán chưa có giá vốn nên không tính vào giá vốn và lợi nhuận.` : undefined,
      };
    },
  },
  {
    id: "gia-tri-don-trung-binh",
    name: "Giá trị đơn hàng trung bình theo thời gian",
    category: "Doanh số",
    description: "Doanh thu chia cho số đơn đã hoàn thành, theo ngày hoặc tháng.",
    adminOnly: true,
    time: "series",
    run: async (p) => {
      const { report: r, bs, points } = await revenueByBucket(p);
      const aov = points.map((x) => (x && x.orderCount ? x.revenue / x.orderCount : null));
      return {
        summary: [
          { label: "Giá trị đơn trung bình", value: vnd(r.orderCount ? r.totalRevenue / r.orderCount : null) },
          { label: "Đơn hoàn thành", value: num(r.orderCount) },
        ],
        chart: { type: "line", label: "Giá trị đơn trung bình", values: aov, format: (v) => vnd(v), axis: axisVnd },
        xLabels: bs.map((b) => b.label),
        xTitles: bs.map((b) => b.title),
        columns: [periodCol, { label: "Đơn hoàn thành", align: "right", format: num }, { label: "Doanh thu", align: "right", format: vnd }, { label: "Giá trị đơn trung bình", align: "right", format: vnd }],
        rows: bs.map((b, i) => [b.title, points[i]?.orderCount ?? 0, points[i]?.revenue ?? 0, aov[i]]),
        totals: ["Cả kỳ", r.orderCount, r.totalRevenue, r.orderCount ? r.totalRevenue / r.orderCount : null],
      };
    },
  },
  {
    id: "doanh-thu-theo-san-pham",
    name: "Doanh thu theo sản phẩm",
    category: "Doanh số",
    description: "Sản phẩm xếp theo doanh thu trong kỳ (đơn đã hoàn thành).",
    adminOnly: true,
    time: "range",
    run: async (p) => {
      const items = [...(await topProducts(p))].sort((a, b) => b.revenue - a.revenue);
      return {
        summary: [
          { label: "Doanh thu", value: vnd(sum(items, (x) => x.revenue)) },
          { label: "Sản phẩm đã bán", value: num(items.length) },
        ],
        chart: {
          type: "bars",
          label: "Doanh thu theo sản phẩm (10 sản phẩm đầu)",
          rows: items.slice(0, 10).map((x) => ({ key: String(x.productId), label: x.productName, sub: `${x.quantitySold} sp`, value: x.revenue })),
          format: (v) => vnd(v),
        },
        columns: [{ label: "Sản phẩm" }, { label: "Số lượng bán", align: "right", format: num }, { label: "Doanh thu", align: "right", format: vnd }, { label: "Lợi nhuận gộp", align: "right", format: vnd }],
        rows: items.map((x) => [x.productName, x.quantitySold, x.revenue, x.profit]),
        totals: ["Tổng", sum(items, (x) => x.quantitySold), sum(items, (x) => x.revenue), sum(items, (x) => x.profit)],
        note: topNote(items),
      };
    },
  },
  {
    id: "san-pham-ban-chay-theo-so-luong",
    name: "Sản phẩm bán chạy theo số lượng",
    category: "Doanh số",
    description: "Sản phẩm xếp theo số lượng đã bán trong kỳ (đơn đã hoàn thành).",
    adminOnly: true,
    time: "range",
    run: async (p) => {
      const items = [...(await topProducts(p))].sort((a, b) => b.quantitySold - a.quantitySold);
      return {
        summary: [{ label: "Tổng số lượng bán", value: num(sum(items, (x) => x.quantitySold)) }],
        chart: {
          type: "bars",
          label: "Số lượng bán theo sản phẩm (10 sản phẩm đầu)",
          rows: items.slice(0, 10).map((x) => ({ key: String(x.productId), label: x.productName, value: x.quantitySold })),
          format: (v) => `${num(v)} sp`,
        },
        columns: [{ label: "Sản phẩm" }, { label: "Số lượng bán", align: "right", format: num }, { label: "Doanh thu", align: "right", format: vnd }],
        rows: items.map((x) => [x.productName, x.quantitySold, x.revenue]),
        totals: ["Tổng", sum(items, (x) => x.quantitySold), sum(items, (x) => x.revenue)],
        note: topNote(items),
      };
    },
  },
  {
    id: "loi-nhuan-gop-theo-thoi-gian",
    name: "Lợi nhuận gộp theo thời gian",
    category: "Lợi nhuận",
    description: "Lợi nhuận gộp và tỷ suất lợi nhuận theo ngày hoặc tháng.",
    adminOnly: true,
    time: "series",
    run: async (p) => {
      const { report: r, bs, points } = await revenueByBucket(p);
      return {
        summary: [
          { label: "Lợi nhuận gộp", value: vnd(r.totalProfit) },
          { label: "Tỷ suất lợi nhuận", value: pct(r.profitMargin) },
          { label: "Giá vốn hàng bán", value: vnd(r.totalCost) },
        ],
        chart: { type: "line", label: "Lợi nhuận gộp", values: points.map((x) => x?.profit ?? 0), format: (v) => vnd(v), axis: axisVnd },
        xLabels: bs.map((b) => b.label),
        xTitles: bs.map((b) => b.title),
        // Tỷ suất tính như backend: lợi nhuận / doanh thu của phần hàng có giá vốn (= giá vốn + lợi nhuận).
        columns: [periodCol, { label: "Doanh thu", align: "right", format: vnd }, { label: "Giá vốn", align: "right", format: vnd }, { label: "Lợi nhuận gộp", align: "right", format: vnd }, { label: "Tỷ suất lợi nhuận", align: "right", format: pct }],
        rows: bs.map((b, i) => [b.title, points[i]?.revenue ?? 0, points[i]?.cost ?? 0, points[i]?.profit ?? 0, points[i] ? ratio(points[i]!.profit, points[i]!.cost + points[i]!.profit) : null]),
        totals: ["Tổng", r.totalRevenue, r.totalCost, r.totalProfit, r.profitMargin],
        note: r.uncostedQuantity ? `${r.uncostedQuantity} sản phẩm đã bán chưa có giá vốn nên không tính vào giá vốn và lợi nhuận.` : undefined,
      };
    },
  },
  {
    id: "loi-nhuan-gop-theo-san-pham",
    name: "Lợi nhuận gộp theo sản phẩm",
    category: "Lợi nhuận",
    description: "Lợi nhuận gộp và tỷ suất lợi nhuận của từng sản phẩm bán trong kỳ.",
    adminOnly: true,
    time: "range",
    run: async (p) => {
      const items = [...(await topProducts(p))].sort((a, b) => b.profit - a.profit);
      const uncosted = sum(items, (x) => x.uncostedQuantity);
      return {
        summary: [
          { label: "Lợi nhuận gộp", value: vnd(sum(items, (x) => x.profit)) },
          { label: "Tỷ suất lợi nhuận", value: pct(ratio(sum(items, (x) => x.profit), sum(items, (x) => x.revenue))) },
        ],
        chart: {
          type: "bars",
          label: "Lợi nhuận gộp theo sản phẩm (10 sản phẩm đầu)",
          rows: items.slice(0, 10).map((x) => ({ key: String(x.productId), label: x.productName, value: Math.max(0, x.profit) })),
          format: (v) => vnd(v),
        },
        columns: [{ label: "Sản phẩm" }, { label: "Doanh thu", align: "right", format: vnd }, { label: "Lợi nhuận gộp", align: "right", format: vnd }, { label: "Tỷ suất lợi nhuận", align: "right", format: pct }, { label: "SL chưa có giá vốn", align: "right", format: num }],
        rows: items.map((x) => [x.productName, x.revenue, x.profit, ratio(x.profit, x.revenue), x.uncostedQuantity]),
        totals: ["Tổng", sum(items, (x) => x.revenue), sum(items, (x) => x.profit), ratio(sum(items, (x) => x.profit), sum(items, (x) => x.revenue)), uncosted],
        note: [topNote(items), uncosted ? "Phần hàng bán khi chưa có giá vốn không tính vào lợi nhuận, nên tỷ suất của sản phẩm đó thấp hơn thực tế." : undefined].filter(Boolean).join(" ") || undefined,
      };
    },
  },
  {
    id: "don-hang-theo-thoi-gian",
    name: "Đơn hàng theo thời gian",
    category: "Đơn hàng",
    description: "Số đơn khách đặt theo ngày hoặc tháng, kèm số đơn đã hoàn thành và đã hủy.",
    adminOnly: false,
    time: "series",
    run: async (p, { isAdmin }) => {
      const o = await ordersInPeriod(p);
      const bs = buckets(p);
      const idx = new Map(bs.map((b, i) => [b.key, i]));
      const all = bs.map(() => 0);
      const done = bs.map(() => 0);
      const canceled = bs.map(() => 0);
      const amount = bs.map(() => 0);
      for (const x of o.items) {
        const i = idx.get(bucketOf(x.creationTime, p.group));
        if (i === undefined) continue;
        all[i]++;
        amount[i] += x.totalAmount;
        if (x.status === OrderStatus.Completed) done[i]++;
        if (x.status === OrderStatus.Canceled) canceled[i]++;
      }
      // Tổng tiền hàng chỉ hiện cho Quản trị viên (Nhân viên không xem số liệu doanh thu tổng hợp).
      const columns: Column[] = [periodCol, { label: "Đơn đặt", align: "right", format: num }, { label: "Đã hoàn thành", align: "right", format: num }, { label: "Đã hủy", align: "right", format: num }];
      if (isAdmin) columns.push({ label: "Tiền hàng", align: "right", format: vnd });
      return {
        summary: [
          { label: "Đơn đặt", value: num(o.total) },
          { label: "Đã hoàn thành", value: num(sum(done, (x) => x)) },
          { label: "Tỷ lệ hủy", value: pct(ratio(sum(canceled, (x) => x), o.items.length)) },
        ],
        chart: { type: "column", label: "Số đơn đặt", values: all, format: (v) => `${v} đơn` },
        xLabels: bs.map((b) => b.label),
        xTitles: bs.map((b) => b.title),
        columns,
        rows: bs.map((b, i) => [b.title, all[i], done[i], canceled[i], ...(isAdmin ? [amount[i]] : [])]),
        totals: ["Tổng", sum(all, (x) => x), sum(done, (x) => x), sum(canceled, (x) => x), ...(isAdmin ? [sum(amount, (x) => x)] : [])],
        note:
          [truncatedNote(o), isAdmin ? "Tiền hàng tính mọi đơn đặt trong kỳ (kể cả đơn chưa hoàn thành và đã hủy); doanh thu chỉ tính đơn đã hoàn thành." : undefined]
            .filter(Boolean)
            .join(" ") || undefined,
      };
    },
  },
  {
    id: "don-hang-theo-trang-thai",
    name: "Đơn hàng theo trạng thái",
    category: "Đơn hàng",
    description: "Số đơn đặt trong kỳ ở từng trạng thái: chờ xử lý, đang giao, chờ khách nhận, hoàn thành, đã hủy.",
    adminOnly: false,
    time: "range",
    run: async (p) => {
      const statuses = [OrderStatus.Pending, OrderStatus.Shipping, OrderStatus.ReadyForPickup, OrderStatus.Completed, OrderStatus.Canceled];
      const counts = await Promise.all(
        statuses.map((s) => orderApi.getAll({ fromDate: p.fromDate, toDate: p.toDate, status: s, maxResultCount: 1 }).then((r) => r.totalCount))
      );
      const total = sum(counts, (x) => x);
      return {
        summary: [{ label: "Đơn đặt", value: num(total) }],
        chart: { type: "bars", label: "Số đơn theo trạng thái", rows: statuses.map((s, i) => ({ key: String(s), label: ORDER_STATUS[s].label, value: counts[i] })), format: (v) => num(v) },
        columns: [{ label: "Trạng thái" }, { label: "Số đơn", align: "right", format: num }, { label: "Tỷ lệ", align: "right", format: pct }],
        rows: statuses.map((s, i) => [ORDER_STATUS[s].label, counts[i], ratio(counts[i], total)]),
        totals: ["Tổng", total, total ? 100 : null],
      };
    },
  },
  {
    id: "don-hang-theo-hinh-thuc",
    name: "Đơn hàng theo hình thức nhận hàng và thanh toán",
    category: "Đơn hàng",
    description: "Tỷ lệ giao tận nơi / nhận tại cửa hàng và thanh toán khi nhận hàng / chuyển khoản.",
    adminOnly: false,
    time: "range",
    run: async (p) => {
      const o = await ordersInPeriod(p);
      const n = o.items.length;
      const pickup = o.items.filter((x) => x.deliveryMethod === DeliveryMethod.StorePickup).length;
      const bank = o.items.filter((x) => x.paymentMethod === PaymentMethod.BankTransfer).length;
      const rows: Cell[][] = [
        ["Nhận hàng", "Giao tận nơi", n - pickup, ratio(n - pickup, n)],
        ["Nhận hàng", "Nhận tại cửa hàng", pickup, ratio(pickup, n)],
        ["Thanh toán", "Thanh toán khi nhận hàng", n - bank, ratio(n - bank, n)],
        ["Thanh toán", "Chuyển khoản", bank, ratio(bank, n)],
      ];
      return {
        summary: [{ label: "Đơn đặt", value: num(o.total) }],
        chart: {
          type: "segments",
          groups: [
            { title: "Hình thức nhận hàng", parts: [{ key: "ship", label: "Giao tận nơi", value: n - pickup }, { key: "pickup", label: "Nhận tại cửa hàng", value: pickup }] },
            { title: "Thanh toán", parts: [{ key: "cod", label: "Thanh toán khi nhận hàng", value: n - bank }, { key: "bank", label: "Chuyển khoản", value: bank }] },
          ],
          format: (v) => num(v),
        },
        columns: [{ label: "Nhóm" }, { label: "Loại" }, { label: "Số đơn", align: "right", format: num }, { label: "Tỷ lệ", align: "right", format: pct }],
        rows,
        note: truncatedNote(o),
      };
    },
  },
  {
    id: "gia-tri-ton-kho-abc",
    name: "Giá trị hàng tồn kho (phân tích ABC)",
    category: "Hàng tồn kho",
    description: "Giá trị tồn kho hiện tại theo giá vốn bình quân, xếp nhóm A / B / C theo doanh thu của kỳ đã chọn.",
    adminOnly: true,
    time: "range",
    run: async (p) => {
      const [variants, sales] = await Promise.all([allVariantCosts(), topProducts(p)]);
      const grade = abcGrades(sales);
      const rows = variants
        .map((v) => ({ v, g: grade.get(v.productId) ?? "C" }))
        .sort((a, b) => (b.v.stockValue ?? 0) - (a.v.stockValue ?? 0));
      const byGrade = (g: string) => sum(rows.filter((r) => r.g === g), (r) => r.v.stockValue ?? 0);
      const total = sum(rows, (r) => r.v.stockValue ?? 0);
      const uncosted = rows.filter((r) => r.v.stockQuantity > 0 && r.v.averageCost === null).length;
      return {
        summary: [
          { label: "Giá trị tồn kho", value: vnd(total) },
          { label: "Nhóm A", value: vnd(byGrade("A")) },
          { label: "Nhóm B", value: vnd(byGrade("B")) },
          { label: "Nhóm C", value: vnd(byGrade("C")) },
        ],
        chart: {
          type: "segments",
          groups: [{ title: "Giá trị tồn kho theo nhóm", parts: (["A", "B", "C"] as const).map((g) => ({ key: g, label: `Nhóm ${g}`, value: Math.round(byGrade(g)) })) }],
          format: (v) => vnd(v),
        },
        columns: [{ label: "Sản phẩm" }, { label: "Biến thể" }, { label: "Tồn kho", align: "right", format: num }, { label: "Giá vốn BQ", align: "right", format: vnd }, { label: "Giá trị tồn", align: "right", format: vnd }, { label: "Nhóm" }],
        rows: rows.map(({ v, g }) => [v.productName, v.variantName, v.stockQuantity, v.averageCost, v.stockValue, g]),
        totals: ["Tổng", null, sum(rows, (r) => r.v.stockQuantity), null, total, null],
        note: [
          "Nhóm A: sản phẩm góp 80% doanh thu đầu của kỳ; B: 15% tiếp theo; C: phần còn lại và sản phẩm chưa bán được.",
          uncosted ? `${uncosted} biến thể còn hàng chưa có giá vốn nên chưa tính vào giá trị tồn.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    },
  },
  {
    id: "ton-kho-sap-het",
    name: "Sản phẩm sắp hết hàng",
    category: "Hàng tồn kho",
    description: "Sản phẩm có biến thể tồn kho từ 5 trở xuống (số liệu hiện tại).",
    adminOnly: false,
    time: "none",
    run: async () => {
      // Đọc hết danh sách (tối đa 1.000 sản phẩm) rồi mới xếp, để "tồn ít nhất trước" đúng trên toàn bộ.
      const all: ProductAdminListItem[] = [];
      let totalCount = 0;
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await productApi.getAdminList({ lowStockOnly: true, skipCount: all.length, maxResultCount: 100 });
        totalCount = page.totalCount;
        all.push(...page.items);
        if (!page.items.length || all.length >= totalCount) break;
      }
      const items = all.sort((a, b) => a.totalStock - b.totalStock);
      return {
        summary: [
          { label: "Sản phẩm sắp hết", value: num(totalCount) },
          { label: "Hết hàng mọi biến thể", value: num(items.filter((x) => x.totalStock === 0).length) },
        ],
        chart: {
          type: "bars",
          label: "Tồn kho của sản phẩm sắp hết (ít nhất trước)",
          rows: items.slice(0, 10).map((x) => ({ key: String(x.id), label: x.name, value: x.totalStock })),
          format: (v) => `${num(v)} còn`,
        },
        columns: [{ label: "Sản phẩm" }, { label: "Danh mục" }, { label: "Tổng tồn", align: "right", format: num }, { label: "Biến thể", align: "right", format: num }, { label: "Trạng thái" }],
        rows: items.map((x) => [x.name, x.categoryName, x.totalStock, x.variantCount, x.isActive ? "Đang bán" : "Tạm ẩn"]),
        note: totalCount > items.length ? `Có ${totalCount} sản phẩm sắp hết; báo cáo chỉ tính ${items.length} sản phẩm đầu.` : undefined,
      };
    },
  },
  {
    id: "nhap-kho-theo-thoi-gian",
    name: "Nhập kho theo thời gian",
    category: "Hàng tồn kho",
    description: "Số phiếu nhập, số lượng và giá trị hàng nhập theo ngày hoặc tháng.",
    adminOnly: true,
    time: "series",
    run: async (p) => {
      const receipts = await receiptsInPeriod(p);
      const bs = buckets(p);
      const idx = new Map(bs.map((b, i) => [b.key, i]));
      const count = bs.map(() => 0);
      const qty = bs.map(() => 0);
      const value = bs.map(() => 0);
      for (const r of receipts) {
        const i = idx.get(bucketOf(r.creationTime, p.group));
        if (i === undefined) continue;
        count[i]++;
        qty[i] += r.quantity;
        value[i] += r.totalCost;
      }
      return {
        summary: [
          { label: "Phiếu nhập", value: num(receipts.length) },
          { label: "Số lượng nhập", value: num(sum(qty, (x) => x)) },
          { label: "Giá trị nhập", value: vnd(sum(value, (x) => x)) },
        ],
        chart: { type: "column", label: "Số lượng nhập", values: qty, format: (v) => `${num(v)} sp` },
        xLabels: bs.map((b) => b.label),
        xTitles: bs.map((b) => b.title),
        columns: [periodCol, { label: "Phiếu nhập", align: "right", format: num }, { label: "Số lượng", align: "right", format: num }, { label: "Giá trị nhập", align: "right", format: vnd }],
        rows: bs.map((b, i) => [b.title, count[i], qty[i], value[i]]),
        totals: ["Tổng", sum(count, (x) => x), sum(qty, (x) => x), sum(value, (x) => x)],
      };
    },
  },
];

// ---------------------------------------------------------------- Ghim & xem lần cuối (lưu ở trình duyệt, theo tài khoản)

export type ReportPrefs = { pinned: string[]; viewed: Record<string, string> };
const prefsKey = (userId: number) => `hsv-admin-reports:${userId}`;

export function loadReportPrefs(userId: number): ReportPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(prefsKey(userId)) ?? "{}") as Partial<ReportPrefs>;
    return { pinned: Array.isArray(raw.pinned) ? raw.pinned : [], viewed: raw.viewed && typeof raw.viewed === "object" ? raw.viewed : {} };
  } catch {
    return { pinned: [], viewed: {} };
  }
}

export function saveReportPrefs(userId: number, prefs: ReportPrefs) {
  try {
    window.localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* trình duyệt chặn lưu: ghim / xem lần cuối chỉ giữ trong phiên này */
  }
}

/** "Hôm nay lúc 9:05", "Hôm qua lúc 21:36", "Thứ Tư lúc 08:10", hoặc ngày. */
export function viewedLabel(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return `Hôm nay lúc ${time}`;
  if (diff === 1) return `Hôm qua lúc ${time}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS[d.getDay()]} lúc ${time}`;
  return `${dd(d)}/${d.getFullYear()}`;
}

/** Bỏ dấu + chữ thường để gõ "loi nhuan" vẫn tìm ra "Lợi nhuận". */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Xuất bảng ra CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    let s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
    // Chữ bắt đầu bằng = + - @ bị Excel hiểu là công thức → thêm dấu ' phía trước.
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
