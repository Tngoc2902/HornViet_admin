import { ApiError } from "@/lib/api/http";
import { productApi, stockReceiptApi } from "@/lib/api/services";
import type {
  Dashboard,
  PagedResult,
  PageInput,
  RevenueReport,
  StockReceipt,
  StockReceiptInput,
  StockReceiptUpdateInput,
  TopProduct,
  VariantCost,
} from "@/lib/api/types";

/**
 * Dữ liệu ảo cho giá nhập / giá vốn / lợi nhuận khi backend chưa có chức năng nhập kho
 * (backend cũ chưa cập nhật: không trả các trường giá vốn, API StockReceipt trả 404).
 * Chỉ bật khi chạy dev — bản build production không bao giờ hiện số liệu bịa.
 * Phiếu nhập tạo ở chế độ ảo chỉ lưu trong trình duyệt (localStorage), không vào database.
 */
export const MOCK_COST_ENABLED = process.env.NODE_ENV !== "production";

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


/** Giống ProductVariant.MovingAverage ở backend: (tồn × giá cũ + nhập × giá nhập) / (tồn + nhập). */
export function movingAverage(stock: number, average: number | null, qty: number, cost: number) {
  if (stock <= 0 || average === null) return cost;
  return (stock * average + qty * cost) / (stock + qty);
}

/** Backend cũ chưa có API StockReceipt → 404. */
const isMissingApi = (e: unknown) => MOCK_COST_ENABLED && e instanceof ApiError && e.status === 404;

const DAY = 86_400_000;
const STORE_KEY = "hsv-mock-stock-receipts";
/** Id phiếu nhập người dùng tạo ở chế độ ảo; phiếu sinh sẵn có id nhỏ hơn và chỉ để xem. */
const FIRST_LOCAL_ID = 1_000_000;

type LocalReceipt = {
  id: number;
  productVariantId: number;
  quantity: number;
  unitCost: number;
  note: string | null;
  creationTime: string;
  lastModificationTime: string | null;
};

// Dự phòng khi trình duyệt chặn localStorage: phiếu ảo vẫn dùng được tới khi tải lại trang.
let memoryReceipts: LocalReceipt[] | null = null;

function readLocal(): LocalReceipt[] {
  if (memoryReceipts) return memoryReceipts.map((r) => ({ ...r }));
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeLocal(list: LocalReceipt[]) {
  memoryReceipts = list;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* giữ trong bộ nhớ */
  }
}

type MockVariant = { cost: VariantCost; receipts: StockReceipt[] };

/** Biến thể thật (lấy từ API sản phẩm) + 2 phiếu nhập ảo sinh sẵn + phiếu người dùng nhập ở chế độ ảo. */
async function loadMockState(): Promise<MockVariant[]> {
  const products = await productApi.getAdminList({ maxResultCount: 100 });
  const details = await Promise.all(products.items.map((p) => productApi.get(p.id)));
  const now = Date.now();
  const variants = details.flatMap((p) =>
    p.variants.map((v): MockVariant => {
      const firstCost = round((p.price * costRatio(v.id)) / 1000) * 1000;
      const secondCost = round((firstCost * 1.08) / 1000) * 1000;
      const qty = v.stockQuantity + 10;
      const base = {
        productId: p.id,
        productName: p.name,
        productVariantId: v.id,
        variantName: v.displayName,
        quantity: qty,
        creatorUserName: null,
        lastModificationTime: null,
        canEdit: false,
      };
      const receipts: StockReceipt[] = [
        { id: v.id * 10, at: now - 40 * DAY - v.id * 3_600_000, cost: firstCost, note: "Đợt 1 (dữ liệu ảo)" },
        { id: v.id * 10 + 1, at: now - 10 * DAY - v.id * 3_600_000, cost: secondCost, note: "Đợt 2 (dữ liệu ảo)" },
      ].map((r) => ({ ...base, id: r.id, creationTime: new Date(r.at).toISOString(), unitCost: r.cost, totalCost: qty * r.cost, note: r.note }));
      return {
        cost: {
          productVariantId: v.id,
          productId: p.id,
          productName: p.name,
          variantName: v.displayName,
          salePrice: p.price,
          stockQuantity: v.stockQuantity,
          averageCost: round((10 * firstCost + qty * secondCost) / (10 + qty)),
          stockValue: null,
          unitProfit: null,
          lastReceiptTime: receipts[1].creationTime,
        },
        receipts,
      };
    })
  );

  const byId = new Map(variants.map((v) => [v.cost.productVariantId, v]));
  for (const r of readLocal().sort((a, b) => a.id - b.id)) {
    const v = byId.get(r.productVariantId);
    if (!v) continue;
    const c = v.cost;
    c.averageCost = movingAverage(c.stockQuantity, c.averageCost, r.quantity, r.unitCost);
    c.stockQuantity += r.quantity;
    c.lastReceiptTime = r.creationTime;
    v.receipts.push({
      id: r.id,
      creationTime: r.creationTime,
      productId: c.productId,
      productName: c.productName,
      productVariantId: c.productVariantId,
      variantName: c.variantName,
      quantity: r.quantity,
      unitCost: r.unitCost,
      totalCost: r.quantity * r.unitCost,
      note: r.note,
      creatorUserName: null,
      lastModificationTime: r.lastModificationTime,
      canEdit: false,
    });
  }
  for (const { cost: c, receipts } of variants) {
    const last = receipts[receipts.length - 1];
    if (last.id >= FIRST_LOCAL_ID) last.canEdit = true;
    c.stockValue = c.averageCost === null ? null : c.averageCost * c.stockQuantity;
    c.unitProfit = c.averageCost === null ? null : c.salePrice - c.averageCost;
  }
  return variants;
}

const page = <T>(all: T[], q: PageInput): PagedResult<T> => ({
  totalCount: all.length,
  items: all.slice(q.skipCount ?? 0, (q.skipCount ?? 0) + (q.maxResultCount ?? 10)),
});

const matches = (name: string, keyword?: string) => !keyword || name.toLowerCase().includes(keyword.toLowerCase());

/** Chỉ phiếu người dùng nhập ở chế độ ảo, và phải là phiếu mới nhất của biến thể (như backend). */
function findLatestLocal(id: number) {
  const list = readLocal();
  const r = list.find((x) => x.id === id);
  const latest = r && Math.max(...list.filter((x) => x.productVariantId === r.productVariantId).map((x) => x.id));
  if (!r || latest !== id) throw new ApiError(400, "Chỉ sửa / hủy được phiếu nhập mới nhất của biến thể.");
  return { list, r };
}

type VariantCostQuery = PageInput & { keyword?: string };
type ReceiptQuery = PageInput & { productVariantId?: number; keyword?: string };

const mock = {
  getVariantCosts: async (q: VariantCostQuery) =>
    page((await loadMockState()).map((v) => v.cost).filter((v) => matches(v.productName, q.keyword)), q),
  getAll: async (q: ReceiptQuery) =>
    page(
      (await loadMockState())
        .flatMap((v) => v.receipts)
        .filter((r) => matches(r.productName, q.keyword) && (!q.productVariantId || r.productVariantId === q.productVariantId))
        .sort((a, b) => b.creationTime.localeCompare(a.creationTime) || b.id - a.id),
      q
    ),
  create: async (input: StockReceiptInput) => {
    const list = readLocal();
    const id = Math.max(FIRST_LOCAL_ID - 1, ...list.map((r) => r.id)) + 1;
    list.push({ ...input, id, note: input.note ?? null, creationTime: new Date().toISOString(), lastModificationTime: null });
    writeLocal(list);
  },
  update: async (input: StockReceiptUpdateInput) => {
    const { list, r } = findLatestLocal(input.id);
    Object.assign(r, { quantity: input.quantity, unitCost: input.unitCost, note: input.note ?? null, lastModificationTime: new Date().toISOString() });
    writeLocal(list);
  },
  delete: async (id: number) => {
    const { list } = findLatestLocal(id);
    writeLocal(list.filter((x) => x.id !== id));
  },
};

// Chế độ ảo do lần đọc gần nhất quyết định (API đọc không trả 404 nghiệp vụ); thao tác ghi đi theo chế độ đó
// để lỗi 404 thật của Create / Update (VD biến thể vừa bị xóa) không bị chuyển nhầm sang dữ liệu ảo.
let mockMode = false;

async function read<T>(real: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    const data = await real();
    mockMode = false;
    return data;
  } catch (e) {
    if (!isMissingApi(e)) throw e;
    mockMode = true;
    return fallback();
  }
}

/**
 * Nguồn dữ liệu trang Nhập kho: API thật; backend cũ chưa có API nhập kho → dữ liệu ảo (chỉ khi chạy dev),
 * vẫn nhập / sửa / hủy phiếu được và giá vốn bình quân tính lại như backend.
 */
export const inventorySource = {
  getVariantCosts: (q: VariantCostQuery) => read(() => stockReceiptApi.getVariantCosts(q), () => mock.getVariantCosts(q)),
  getAll: (q: ReceiptQuery) => read(() => stockReceiptApi.getAll(q), () => mock.getAll(q)),
  create: async (input: StockReceiptInput) => {
    if (mockMode) await mock.create(input);
    else await stockReceiptApi.create(input);
  },
  update: async (input: StockReceiptUpdateInput) => {
    if (mockMode) await mock.update(input);
    else await stockReceiptApi.update(input);
  },
  delete: async (id: number) => {
    if (mockMode) await mock.delete(id);
    else await stockReceiptApi.delete(id);
  },
};
