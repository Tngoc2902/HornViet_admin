// Xuất "Báo cáo kinh doanh" ra file Excel (.xlsx) từ trang Thống kê.
// exceljs được import động khi bấm nút để không làm nặng bundle của trang.
// Không ghi thông tin cá nhân của khách (tên, SĐT, địa chỉ) vào file.

import type { Borders, Cell, Fill, Worksheet } from "exceljs";
import { orderApi, statisticApi, stockReceiptApi } from "@/lib/api/services";
import { OrderStatus, RevenueGroupBy, type OrderListItem, type RevenueReport, type VariantCost } from "@/lib/api/types";
import { ORDER_STATUS, PAYMENT_LABEL } from "./format";
import { mockRevenue, mockTopProducts } from "./mock-cost";

const NAVY = "FF0F2A4A";
const GOLD = "FFB08D57";
const GOLD_SOFT = "FFF6EFE2";
const LINE = "FFE6E9EE";
const MONEY = '#,##0" ₫"';
const PCT = "0.0%";

const thin = { style: "thin" as const, color: { argb: LINE } };
const BORDER: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** "2026-10-05T16:13:57+07:00" → Date giữ nguyên giờ Việt Nam (exceljs ghi Date theo UTC). */
function excelDate(iso: string) {
  const [d, t = "00:00:00"] = iso.slice(0, 19).split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, mi, s] = t.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, day, h, mi, s || 0));
}

async function fetchAll<T>(load: (skipCount: number) => Promise<{ totalCount: number; items: T[] }>) {
  const out: T[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = await load(skip);
    out.push(...page.items);
    if (out.length >= page.totalCount || page.items.length === 0) return out;
  }
}

/** Tiêu đề + dòng mô tả ở đầu mỗi sheet; trả về số dòng bắt đầu của bảng. */
function sheetTitle(ws: Worksheet, title: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Arial", size: 15, bold: true, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF6B7686" } };
  ws.getRow(1).height = 24;
  return 4;
}

type Col = { header: string; key: string; width: number; fmt?: string; align?: "left" | "center" | "right" };

/** Bảng có tiêu đề cột nền navy, viền mảnh, cố định dòng tiêu đề, bật lọc. */
function table(ws: Worksheet, startRow: number, cols: Col[], rows: Record<string, unknown>[], opts: { totals?: Record<string, "sum" | string>; freeze?: boolean } = {}) {
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const head = ws.getRow(startRow);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(NAVY);
    cell.alignment = { vertical: "middle", horizontal: c.align ?? (c.fmt ? "right" : "left"), wrapText: true };
    cell.border = BORDER;
  });
  head.height = 22;

  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = (r[c.key] ?? null) as Cell["value"];
      cell.font = { name: "Arial", size: 10 };
      cell.border = BORDER;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { vertical: "middle", horizontal: c.align ?? (c.fmt ? "right" : "left") };
      if (ri % 2 === 1) cell.fill = fill("FFF7F9FB");
    });
  });

  const first = startRow + 1;
  const last = startRow + rows.length;
  if (opts.totals && rows.length) {
    const row = ws.getRow(last + 1);
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const spec = opts.totals![c.key];
      const letter = ws.getColumn(ci + 1).letter;
      if (spec === "sum") cell.value = { formula: `SUM(${letter}${first}:${letter}${last})` };
      else if (spec?.startsWith("=")) cell.value = { formula: spec.slice(1).split("{r}").join(String(last + 1)) };
      else if (spec) cell.value = spec;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY } };
      cell.fill = fill(GOLD_SOFT);
      cell.border = BORDER;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { horizontal: c.align ?? (c.fmt ? "right" : "left") };
    });
  }

  if (opts.freeze !== false) ws.views = [{ state: "frozen", ySplit: startRow }];
  if (rows.length) ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: last, column: cols.length } };
  return last + (opts.totals ? 1 : 0);
}

export type ReportRange = { label: string; fromDate: string; toDate: string; months: { y: number; m: number }[] };

export async function exportBusinessReport(range: ReportRange, exportedBy: string) {
  const { default: ExcelJS } = await import("exceljs");

  // Dữ liệu: các lời gọi giống trang Thống kê + đơn hàng & tồn kho để lập bảng chi tiết.
  const q = { fromDate: range.fromDate, toDate: range.toDate };
  const [monthly, daily, top, orders, costs] = await Promise.all([
    statisticApi.getRevenue({ ...q, groupBy: RevenueGroupBy.Month }).then((r) => mockRevenue(r).data),
    statisticApi.getRevenue({ ...q, groupBy: RevenueGroupBy.Day }).then((r) => mockRevenue(r).data),
    statisticApi.getTopProducts({ ...q, top: 50 }).then((t) => mockTopProducts(t.items).data),
    fetchAll<OrderListItem>((skipCount) => orderApi.getAll({ ...q, skipCount, maxResultCount: 100 })),
    fetchAll<VariantCost>((skipCount) => stockReceiptApi.getVariantCosts({ skipCount, maxResultCount: 100 })).catch(() => null),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hồn Sừng Việt";
  wb.created = new Date();
  const period = `Kỳ báo cáo: ${range.label} (${fmtDay(range.fromDate)} – ${fmtDay(range.toDate)})`;

  sheetOverview(wb.addWorksheet("Tổng quan"), monthly, orders, period, exportedBy);
  sheetMonthly(wb.addWorksheet("Doanh thu theo tháng"), monthly, range, period);
  sheetDaily(wb.addWorksheet("Doanh thu theo ngày"), daily, period);

  const wsTop = wb.addWorksheet("Sản phẩm bán chạy");
  const topStart = sheetTitle(wsTop, "SẢN PHẨM BÁN CHẠY", `${period} · tính trên đơn hoàn thành`, 6);
  table(
    wsTop,
    topStart,
    [
      { header: "Hạng", key: "rank", width: 8, align: "center" },
      { header: "Sản phẩm", key: "name", width: 38 },
      { header: "Số lượng bán", key: "qty", width: 14, fmt: "#,##0" },
      { header: "Doanh thu", key: "revenue", width: 18, fmt: MONEY },
      { header: "Lợi nhuận gộp", key: "profit", width: 18, fmt: MONEY },
      { header: "Tỷ suất", key: "margin", width: 11, fmt: PCT },
    ],
    top.map((p, i) => ({
      rank: i + 1,
      name: p.productName,
      qty: p.quantitySold,
      revenue: p.revenue,
      profit: p.profit,
      margin: p.revenue ? p.profit / p.revenue : null,
    })),
    { totals: { name: "Tổng cộng", qty: "sum", revenue: "sum", profit: "sum", margin: "=IFERROR(E{r}/D{r},0)" } }
  );

  const wsOrders = wb.addWorksheet("Đơn hàng");
  const ordStart = sheetTitle(wsOrders, "DANH SÁCH ĐƠN HÀNG", `${period} · tất cả trạng thái`, 7);
  table(
    wsOrders,
    ordStart,
    [
      { header: "Mã đơn", key: "code", width: 14 },
      { header: "Ngày đặt", key: "date", width: 18, fmt: "dd/mm/yyyy hh:mm", align: "center" },
      { header: "Trạng thái", key: "status", width: 14 },
      { header: "Thanh toán", key: "pay", width: 30 },
      { header: "Số sản phẩm", key: "items", width: 13, fmt: "#,##0" },
      { header: "Sản phẩm", key: "products", width: 48 },
      { header: "Tổng tiền", key: "total", width: 16, fmt: MONEY },
    ],
    [...orders]
      .sort((a, b) => a.creationTime.localeCompare(b.creationTime))
      .map((o) => ({
        code: o.code,
        date: excelDate(o.creationTime),
        status: ORDER_STATUS[o.status].label,
        pay: PAYMENT_LABEL[o.paymentMethod],
        items: o.itemCount,
        products: (o.items ?? []).map((i) => `${i.productName} (${i.variantName}) ×${i.quantity}`).join("; "),
        total: o.totalAmount,
      })),
    { totals: { code: "Tổng cộng", items: "sum", total: "sum" } }
  );

  if (costs) {
    const wsStock = wb.addWorksheet("Tồn kho & giá vốn");
    const stStart = sheetTitle(wsStock, "TỒN KHO & GIÁ VỐN", `Số liệu tại thời điểm xuất (${new Date().toLocaleString("vi-VN")})`, 8);
    table(
      wsStock,
      stStart,
      [
        { header: "Sản phẩm", key: "name", width: 34 },
        { header: "Biến thể", key: "variant", width: 18 },
        { header: "Tồn kho", key: "stock", width: 10, fmt: "#,##0" },
        { header: "Giá bán", key: "price", width: 15, fmt: MONEY },
        { header: "Giá vốn BQ", key: "cost", width: 15, fmt: MONEY },
        { header: "Lãi / sp", key: "unit", width: 15, fmt: MONEY },
        { header: "Giá trị tồn", key: "value", width: 17, fmt: MONEY },
        { header: "Nhập gần nhất", key: "last", width: 18, fmt: "dd/mm/yyyy hh:mm", align: "center" },
      ],
      [...costs]
        .sort((a, b) => a.productName.localeCompare(b.productName, "vi") || a.variantName.localeCompare(b.variantName, "vi"))
        .map((v) => ({
          name: v.productName,
          variant: v.variantName,
          stock: v.stockQuantity,
          price: v.salePrice,
          cost: v.averageCost,
          unit: v.unitProfit,
          value: v.stockValue,
          last: v.lastReceiptTime ? excelDate(v.lastReceiptTime) : null,
        })),
      { totals: { name: "Tổng cộng", stock: "sum", value: "sum" } }
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bao-cao-hon-sung-viet_${range.fromDate}_${range.toDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fmtDay = (d: string) => d.split("-").reverse().join("/");

function sheetOverview(ws: Worksheet, r: RevenueReport, orders: OrderListItem[], period: string, exportedBy: string) {
  sheetTitle(ws, "BÁO CÁO KINH DOANH — HỒN SỪNG VIỆT", period, 4);
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 22;

  const info: [string, string][] = [
    ["Ngày xuất", new Date().toLocaleString("vi-VN")],
    ["Người xuất", exportedBy],
  ];
  info.forEach(([k, v], i) => {
    const row = ws.getRow(3 + i);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    row.getCell(1).font = { name: "Arial", size: 10, color: { argb: "FF6B7686" } };
    row.getCell(2).font = { name: "Arial", size: 10 };
  });

  // Chỉ số chính
  const canceled = orders.filter((o) => o.status === OrderStatus.Canceled).length;
  const kpis: [string, number | null, string?][] = [
    ["Doanh thu (đơn hoàn thành)", r.totalRevenue, MONEY],
    ["Số đơn hoàn thành", r.orderCount, "#,##0"],
    ["Giá trị đơn trung bình", r.orderCount ? r.totalRevenue / r.orderCount : 0, MONEY],
    ["Giá vốn hàng bán", r.totalCost, MONEY],
    ["Lợi nhuận gộp", r.totalProfit, MONEY],
    ["Tỷ suất lợi nhuận", r.profitMargin == null ? null : r.profitMargin / 100, PCT],
    ["Tổng số đơn phát sinh", orders.length, "#,##0"],
    ["Tỷ lệ hủy đơn", orders.length ? canceled / orders.length : 0, PCT],
  ];
  if (r.uncostedQuantity > 0) kpis.push(["Sản phẩm đã bán chưa có giá vốn", r.uncostedQuantity, "#,##0"]);

  let row = 6;
  const sec = (title: string) => {
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = title;
    c.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(GOLD);
    ws.getRow(row).height = 20;
    row++;
  };
  sec("CHỈ SỐ CHÍNH");
  for (const [label, value, fmt] of kpis) {
    const rr = ws.getRow(row++);
    rr.getCell(1).value = label;
    rr.getCell(2).value = value ?? "—";
    rr.getCell(1).font = { name: "Arial", size: 10.5 };
    rr.getCell(2).font = { name: "Arial", size: 10.5, bold: true, color: { argb: NAVY } };
    if (fmt && value != null) rr.getCell(2).numFmt = fmt;
    rr.getCell(2).alignment = { horizontal: "right" };
    [1, 2].forEach((ci) => (rr.getCell(ci).border = BORDER));
  }

  // Đơn hàng theo trạng thái
  row++;
  sec("ĐƠN HÀNG THEO TRẠNG THÁI");
  const head = ws.getRow(row++);
  ["Trạng thái", "Số đơn", "Tỷ lệ", "Giá trị"].forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = fill(NAVY);
    c.border = BORDER;
    c.alignment = { horizontal: i ? "right" : "left" };
  });
  for (const st of [OrderStatus.Pending, OrderStatus.Shipping, OrderStatus.ReadyForPickup, OrderStatus.Completed, OrderStatus.Canceled]) {
    const list = orders.filter((o) => o.status === st);
    const rr = ws.getRow(row++);
    const vals: (string | number)[] = [ORDER_STATUS[st].label, list.length, orders.length ? list.length / orders.length : 0, list.reduce((s, o) => s + o.totalAmount, 0)];
    vals.forEach((v, i) => {
      const c = rr.getCell(i + 1);
      c.value = v;
      c.font = { name: "Arial", size: 10 };
      c.border = BORDER;
      c.numFmt = ["@", "#,##0", PCT, MONEY][i];
      c.alignment = { horizontal: i ? "right" : "left" };
    });
  }

  row++;
  const note = ws.getCell(row, 1);
  ws.mergeCells(row, 1, row, 4);
  note.value = "Doanh thu, giá vốn và lợi nhuận chỉ tính trên đơn ở trạng thái “Hoàn thành”. Giá vốn = giá vốn bình quân tại thời điểm đặt hàng.";
  note.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF6B7686" } };
  note.alignment = { wrapText: true };
  ws.getRow(row).height = 30;
}

function sheetMonthly(ws: Worksheet, r: RevenueReport, range: ReportRange, period: string) {
  const start = sheetTitle(ws, "DOANH THU THEO THÁNG", `${period} · tính trên đơn hoàn thành`, 6);
  // API chỉ trả tháng có phát sinh → điền đủ các tháng trong kỳ (tháng trống = 0).
  const byMonth = new Map(r.items.map((p) => [p.period.slice(0, 7), p]));
  const rows = range.months.map(({ y, m }) => {
    const p = byMonth.get(`${y}-${String(m).padStart(2, "0")}`);
    const revenue = p?.revenue ?? 0;
    return { month: `Tháng ${m}/${y}`, orders: p?.orderCount ?? 0, revenue, cost: p?.cost ?? 0, profit: p?.profit ?? 0, margin: revenue ? (p?.profit ?? 0) / revenue : null };
  });
  table(
    ws,
    start,
    [
      { header: "Tháng", key: "month", width: 16 },
      { header: "Số đơn", key: "orders", width: 10, fmt: "#,##0" },
      { header: "Doanh thu", key: "revenue", width: 18, fmt: MONEY },
      { header: "Giá vốn", key: "cost", width: 18, fmt: MONEY },
      { header: "Lợi nhuận gộp", key: "profit", width: 18, fmt: MONEY },
      { header: "Tỷ suất", key: "margin", width: 11, fmt: PCT },
    ],
    rows,
    { totals: { month: "Tổng cộng", orders: "sum", revenue: "sum", cost: "sum", profit: "sum", margin: "=IFERROR(E{r}/C{r},0)" } }
  );
}

function sheetDaily(ws: Worksheet, r: RevenueReport, period: string) {
  const start = sheetTitle(ws, "DOANH THU THEO NGÀY", `${period} · chỉ liệt kê ngày có đơn hoàn thành`, 6);
  table(
    ws,
    start,
    [
      { header: "Ngày", key: "day", width: 14, fmt: "dd/mm/yyyy", align: "center" },
      { header: "Số đơn", key: "orders", width: 10, fmt: "#,##0" },
      { header: "Doanh thu", key: "revenue", width: 18, fmt: MONEY },
      { header: "Giá vốn", key: "cost", width: 18, fmt: MONEY },
      { header: "Lợi nhuận gộp", key: "profit", width: 18, fmt: MONEY },
      { header: "Tỷ suất", key: "margin", width: 11, fmt: PCT },
    ],
    r.items.map((p) => ({
      day: excelDate(p.period),
      orders: p.orderCount,
      revenue: p.revenue,
      cost: p.cost,
      profit: p.profit,
      margin: p.revenue ? p.profit / p.revenue : null,
    })),
    { totals: { day: "Tổng cộng", orders: "sum", revenue: "sum", cost: "sum", profit: "sum", margin: "=IFERROR(E{r}/C{r},0)" } }
  );
  // Ô "Tổng cộng" ở cột ngày là chữ → bỏ định dạng ngày.
  ws.getCell(start + r.items.length + 1, 1).numFmt = "@";
}
