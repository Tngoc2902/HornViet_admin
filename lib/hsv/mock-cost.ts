import { ApiError } from "@/lib/api/http";
import { productApi } from "@/lib/api/services";
import type { Dashboard, PagedResult, RevenueReport, StockReceipt, TopProduct, VariantCost } from "@/lib/api/types";

/**
 * Dữ liệu ảo cho giá nhập / giá vốn / lợi nhuận khi backend chưa có chức năng nhập kho
 * (backend cũ chưa cập nhật: không trả các trường giá vốn, API StockReceipt trả 404).
 * Chỉ bật khi chạy dev — bản build production không bao giờ hiện số liệu bịa.
 */
export const MOCK_COST_ENABLED = process.env.NODE_ENV !== "production";

export const MOCK_NOTICE = "Dữ liệu ảo: backend chưa trả giá nhập / giá vốn / lợi nhuận nên đang hiển thị số liệu mô phỏng (chỉ khi chạy dev). Khởi động lại backend bản mới để xem số liệu thật.";

/** Tỷ lệ giá vốn / giá bán cố định theo id (55–70%) để số liệu ảo không đổi giữa các lần tải. */
function costRatio(id: number) {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return 0.55 + (x - Math.floor(x)) * 0.15;
}

const MONTH_RATIO = 0.62;
const round = (v: number) => Math.round(v);

export function mockRevenue(r: RevenueReport): { data: RevenueReport; mocked: boolean } {
  if (!MOCK_COST_ENABLED || r.totalCost !== undefined) return { data: r, mocked: false };
  const items = r.items.map((p) => {
    const cost = round(p.revenue * MONTH_RATIO);
    return { ...p, cost, profit: p.revenue - cost, uncostedQuantity: 0 };
  });
  const totalCost = items.reduce((s, p) => s + p.cost, 0);
  const totalProfit = r.totalRevenue - totalCost;
  return {
    data: {
      ...r,
      items,
      totalCost,
      totalProfit,
      profitMargin: r.totalRevenue > 0 ? Math.round((totalProfit / r.totalRevenue) * 1000) / 10 : null,
      uncostedQuantity: 0,
    },
    mocked: true,
  };
}

export function mockTopProducts(items: TopProduct[]): { data: TopProduct[]; mocked: boolean } {
  if (!MOCK_COST_ENABLED || items.every((p) => p.profit !== undefined)) return { data: items, mocked: false };
  return {
    data: items.map((p) => ({ ...p, profit: round(p.revenue * (1 - costRatio(p.productId))), uncostedQuantity: 0 })),
    mocked: true,
  };
}

export function mockDashboard(d: Dashboard): { data: Dashboard; mocked: boolean } {
  if (!MOCK_COST_ENABLED || d.monthProfit !== undefined || d.monthRevenue == null) return { data: d, mocked: false };
  return { data: { ...d, monthProfit: round(d.monthRevenue * (1 - MONTH_RATIO)) }, mocked: true };
}

/** Backend cũ chưa có API StockReceipt → 404. */
export const isMissingApi = (e: unknown) => MOCK_COST_ENABLED && e instanceof ApiError && e.status === 404;

const DAY = 86_400_000;

/** Biến thể thật (lấy từ API sản phẩm) + giá vốn ảo; phiếu nhập ảo sinh từ đó. */
async function loadMockVariants() {
  const products = await productApi.getAdminList({ maxResultCount: 100 });
  const details = await Promise.all(products.items.map((p) => productApi.get(p.id)));
  const now = Date.now();
  return details.flatMap((p) =>
    p.variants.map((v) => {
      const firstCost = round((p.price * costRatio(v.id)) / 1000) * 1000;
      const secondCost = round((firstCost * 1.08) / 1000) * 1000;
      const firstQty = v.stockQuantity + 10;
      const average = round((10 * firstCost + firstQty * secondCost) / (10 + firstQty));
      const receipts: StockReceipt[] = [
        { qty: firstQty, cost: firstCost, at: now - 40 * DAY - v.id * 3_600_000, note: "Đợt 1 (dữ liệu ảo)" },
        { qty: firstQty, cost: secondCost, at: now - 10 * DAY - v.id * 3_600_000, note: "Đợt 2 (dữ liệu ảo)" },
      ].map((r, i) => ({
        id: v.id * 10 + i,
        creationTime: new Date(r.at).toISOString(),
        productId: p.id,
        productName: p.name,
        productVariantId: v.id,
        variantName: v.displayName,
        quantity: r.qty,
        unitCost: r.cost,
        totalCost: r.qty * r.cost,
        note: r.note,
        creatorUserName: null,
        lastModificationTime: null,
        canEdit: false,
      }));
      const cost: VariantCost = {
        productVariantId: v.id,
        productId: p.id,
        productName: p.name,
        variantName: v.displayName,
        salePrice: p.price,
        stockQuantity: v.stockQuantity,
        averageCost: average,
        stockValue: average * v.stockQuantity,
        unitProfit: p.price - average,
        lastReceiptTime: receipts[1].creationTime,
      };
      return { cost, receipts };
    })
  );
}

const page = <T>(all: T[], q: { skipCount?: number; maxResultCount?: number }): PagedResult<T> => ({
  totalCount: all.length,
  items: all.slice(q.skipCount ?? 0, (q.skipCount ?? 0) + (q.maxResultCount ?? 10)),
});

const matches = (name: string, keyword?: string) => !keyword || name.toLowerCase().includes(keyword.toLowerCase());

export async function mockVariantCosts(q: { keyword?: string; skipCount?: number; maxResultCount?: number }) {
  const all = (await loadMockVariants()).map((v) => v.cost).filter((v) => matches(v.productName, q.keyword));
  return page(all, q);
}

export async function mockReceipts(q: { keyword?: string; skipCount?: number; maxResultCount?: number }) {
  const all = (await loadMockVariants())
    .flatMap((v) => v.receipts)
    .filter((r) => matches(r.productName, q.keyword))
    .sort((a, b) => b.creationTime.localeCompare(a.creationTime));
  return page(all, q);
}
