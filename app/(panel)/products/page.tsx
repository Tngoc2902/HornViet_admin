"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, PencilLine, Plus } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { ProductBulkEditor } from "@/components/hsv/product-bulk-editor";
import { ProductForm } from "@/components/hsv/product-form";
import { ProductInsights } from "@/components/hsv/product-insights";
import { Badge, Checkbox, Chip, EmptyState, ErrorBox, LoadingRows, notify, PageHeader, Pager, ProductImage, SearchInput } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useCatalog } from "@/contexts/catalog-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { toApiError } from "@/lib/api/http";
import { productApi } from "@/lib/api/services";
import type { ProductAdminListItem } from "@/lib/api/types";
import { formatVND } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
/** Số sản phẩm tối đa mở trong một lần chỉnh sửa hàng loạt (cũng là trang lớn nhất API danh sách trả về). */
const MAX_BULK = 100;
const COLS = "grid-cols-[16px_minmax(240px,2.4fr)_100px_minmax(150px,1.1fr)_1fr_1fr_110px_140px]";
const DELETE_NOTE =
  "Sản phẩm được xóa mềm: biến mất khỏi cửa hàng và trang quản trị, được gỡ khỏi giỏ hàng của khách; lịch sử đơn và thống kê giữ nguyên.";

const STATUS = [
  { key: "all", label: "Tất cả", value: undefined },
  { key: "on", label: "Đang bán", value: true },
  { key: "off", label: "Tạm ẩn", value: false },
] as const;
/** Tab của danh sách: ba tab trạng thái + tab "Sắp hết hàng". */
type View = (typeof STATUS)[number]["key"] | "low";

export default function AdminProducts() {
  const { categories } = useCatalog();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [cat, setCat] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<(typeof STATUS)[number]["key"]>("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Chọn nhiều dòng để thao tác hàng loạt (trong trang đang xem); `allMatching` = đã bấm "Chọn tất cả N sản phẩm" khớp bộ lọc.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const editParam = params.get("edit");
  const lowOnly = params.get("warn") === "1";
  // Các sản phẩm đang mở trong trình chỉnh sửa hàng loạt (tối đa MAX_BULK).
  const bulkParam = params.get("bulk") ?? "";
  const bulkIds = useMemo(
    () => [...new Set(bulkParam.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_BULK),
    [bulkParam]
  );

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Tab đang xem. Bốn tab loại trừ nhau (như các chế độ xem của Shopify): "Sắp hết hàng" (?warn=1) là một tab riêng,
  // không phải công tắc bật thêm lên trên tab trạng thái — đang ở tab này thì bộ lọc trạng thái không áp dụng.
  const view: View = lowOnly ? "low" : status;
  const openView = (v: View) => {
    if (v === "low") {
      if (!lowOnly) setParam("warn", "1");
      return;
    }
    setStatus(v);
    if (lowOnly) setParam("warn", null);
  };

  /** Bộ lọc đang áp dụng (dùng chung cho danh sách và cho "Chọn tất cả N sản phẩm"). */
  const listFilter = () => ({
    keyword: keyword || undefined,
    categoryId: cat,
    isActive: lowOnly ? undefined : STATUS.find((s) => s.key === status)?.value,
    lowStockOnly: lowOnly || undefined,
  });

  const list = useApi(
    () => productApi.getAdminList({ ...listFilter(), skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    [keyword, cat, view, page],
    // Bảng chỉnh sửa hàng loạt đang che danh sách → không tải danh sách; đóng bảng thì tự tải lại.
    bulkIds.length === 0
  );
  useRealtimeRefresh(["StockChanged", "ProductChanged"], () => list.reload());
  const rows = list.data?.items ?? [];
  const filtered = !!keyword || cat !== undefined || view !== "all";

  // Đổi bộ lọc hoặc sang trang khác → bỏ chọn: thao tác hàng loạt chỉ áp dụng cho các dòng đang thấy.
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [keyword, cat, view, page]);

  const picked = rows.filter((p) => selected.has(p.id));
  const allPicked = rows.length > 0 && picked.length === rows.length;
  const total = list.data?.totalCount ?? 0;
  const pickedAll = allMatching && allPicked;
  const locked = bulk !== null;

  const toggleOne = (id: number) => {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setAllMatching(false);
    setSelected(allPicked ? new Set() : new Set(rows.map((p) => p.id)));
  };
  const clearSelection = () => {
    setAllMatching(false);
    setSelected(new Set());
  };

  /** Mọi sản phẩm khớp bộ lọc hiện tại (đọc lần lượt từng trang 100 dòng). */
  const fetchMatching = async () => {
    const all: ProductAdminListItem[] = [];
    for (;;) {
      const r = await productApi.getAdminList({ ...listFilter(), skipCount: all.length, maxResultCount: MAX_BULK });
      all.push(...r.items);
      if (!r.items.length || all.length >= r.totalCount) return all;
    }
  };
  /** Sản phẩm mà thao tác hàng loạt áp dụng: các dòng đã tích, hoặc mọi sản phẩm khớp bộ lọc. */
  const bulkTargets = async () => {
    if (!pickedAll) return picked;
    try {
      return await fetchMatching();
    } catch (e) {
      notify(toApiError(e).message);
      return null;
    }
  };

  const openBulkEditor = async () => {
    const targets = await bulkTargets();
    if (!targets?.length) return;
    if (targets.length > MAX_BULK) notify(`Mỗi lần sửa được tối đa ${MAX_BULK} sản phẩm — mở ${MAX_BULK} sản phẩm đầu`);
    clearSelection();
    setParam("bulk", targets.slice(0, MAX_BULK).map((p) => p.id).join(","));
  };

  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const run = async (p: ProductAdminListItem, fn: () => Promise<unknown>, done: string) => {
    setBusyId(p.id);
    try {
      await fn();
      notify(done);
      await list.reload();
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (p: ProductAdminListItem) => {
    const ok = await confirm({
      title: `Xóa “${p.name}”?`,
      body: DELETE_NOTE,
      okLabel: "Xóa sản phẩm",
      danger: true,
    });
    if (ok) await run(p, () => productApi.delete(p.id), "Đã xóa sản phẩm");
  };

  /**
   * Thao tác hàng loạt: gọi lần lượt đúng API của thao tác từng dòng (SetActive / Delete) cho mỗi sản phẩm đã chọn.
   * Sản phẩm nào lỗi thì bỏ qua và báo lại ở cuối, các sản phẩm còn lại vẫn được xử lý.
   */
  const runBulk = async (targets: ProductAdminListItem[], fn: (p: ProductAdminListItem) => Promise<unknown>, done: (n: number) => string, removes = false) => {
    setBulk({ done: 0, total: targets.length });
    let ok = 0;
    const failed: string[] = [];
    for (const p of targets) {
      try {
        await fn(p);
        ok++;
      } catch (e) {
        failed.push(`${p.name}: ${toApiError(e).message}`);
      }
      setBulk({ done: ok + failed.length, total: targets.length });
    }
    setBulk(null);
    const wasAll = pickedAll;
    clearSelection();
    // Xóa hết các dòng của trang đang xem → lùi trang để không đứng ở trang trống (xóa tất cả theo bộ lọc → về trang 1).
    if (removes && page > 1 && (wasAll || ok >= rows.length)) setPage(wasAll ? 1 : page - 1);
    else await list.reload();
    notify(
      failed.length
        ? `${ok ? `${done(ok)}. ` : ""}${failed.length} sản phẩm không thực hiện được:\n${failed.slice(0, 3).join("\n")}${failed.length > 3 ? "\n…" : ""}`
        : done(ok)
    );
  };

  const onBulkActive = async (isActive: boolean) => {
    const pool = await bulkTargets();
    if (!pool) return;
    const targets = pool.filter((p) => p.isActive !== isActive);
    if (!targets.length) return notify(isActive ? "Các sản phẩm đã chọn đều đang bán" : "Các sản phẩm đã chọn đều đang tạm ẩn");
    const ok = await confirm({
      title: isActive ? `Hiện ${targets.length} sản phẩm trên cửa hàng?` : `Tạm ẩn ${targets.length} sản phẩm?`,
      body: isActive ? "Các sản phẩm này sẽ hiển thị lại trên cửa hàng." : "Các sản phẩm này sẽ không hiển thị trên cửa hàng cho đến khi được hiện lại.",
      okLabel: isActive ? "Hiện sản phẩm" : "Tạm ẩn",
    });
    if (!ok) return;
    await runBulk(targets, (p) => productApi.setActive(p.id, isActive), (n) => (isActive ? `${n} sản phẩm đã hiển thị lại` : `Đã tạm ẩn ${n} sản phẩm`));
  };

  const onBulkDelete = async () => {
    const targets = await bulkTargets();
    if (!targets?.length) return;
    const ok = await confirm({
      title: `Xóa ${targets.length} sản phẩm đã chọn?`,
      body: DELETE_NOTE,
      okLabel: `Xóa ${targets.length} sản phẩm`,
      danger: true,
    });
    if (!ok) return;
    await runBulk(targets, (p) => productApi.delete(p.id), (n) => `Đã xóa ${n} sản phẩm`, true);
  };

  // Đang chỉnh sửa hàng loạt (?bulk=1,2,3): bảng sửa chiếm cả trang.
  if (bulkIds.length > 0 && !editParam) {
    return <ProductBulkEditor ids={bulkIds} onClose={() => setParam("bulk", null)} onSaved={() => void list.reload()} />;
  }

  // Đang thêm / sửa: form chiếm cả trang; danh sách vẫn giữ nguyên bộ lọc và trang hiện tại để quay lại.
  if (editParam) {
    return (
      <ProductForm
        key={editParam}
        productId={editParam === "new" ? undefined : Number(editParam)}
        onClose={() => setParam("edit", null)}
        onSaved={() => void list.reload()}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Sản phẩm"
        actions={
          <button onClick={() => setParam("edit", "new")} className="hsv-btn-primary">
            <Plus className="h-4 w-4" />
            Thêm sản phẩm
          </button>
        }
      />

      {/* Chỉ số tồn kho dùng API thống kê + giá vốn — chỉ Quản trị viên gọi được. */}
      {isAdmin && <ProductInsights />}

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className="hsv-index">
          <div className="hsv-toolbar">
            <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-none">
              {STATUS.map((s) => (
                <Chip key={s.key} active={view === s.key} onClick={() => filter(() => openView(s.key))}>
                  {s.label}
                </Chip>
              ))}
              <Chip active={view === "low"} onClick={() => filter(() => openView("low"))}>
                Sắp hết hàng
              </Chip>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
              <SearchInput value={q} onChange={(v) => filter(() => setQ(v))} placeholder="Tìm theo tên sản phẩm" className="sm:w-[260px] sm:flex-none" />
              <select
                value={cat ?? ""}
                onChange={(e) => filter(() => setCat(e.target.value ? Number(e.target.value) : undefined))}
                aria-label="Lọc theo danh mục"
                className="hsv-input w-auto min-w-[150px]"
              >
                <option value="">Mọi danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={cn("overflow-x-auto", list.loading && list.data && "opacity-70")}>
            <div className="min-w-[1030px]">
              {picked.length > 0 ? (
                // Đã chọn dòng: đầu bảng đổi thành thanh thao tác hàng loạt.
                <div className="hsv-thead flex min-h-8 items-center gap-3 py-1" role="toolbar" aria-label="Thao tác hàng loạt">
                  <Checkbox checked={allPicked} indeterminate onChange={toggleAll} disabled={locked} label={allPicked ? "Bỏ chọn tất cả" : "Chọn tất cả sản phẩm trong trang"} />
                  <span className="font-semibold text-ink">{pickedAll ? `Đã chọn tất cả ${total}` : `Đã chọn ${picked.length}`}</span>
                  {/* Như Shopify: tích hết trang này rồi có thể chọn mọi sản phẩm khớp bộ lọc ở các trang khác. */}
                  {!bulk && allPicked && total > rows.length && (
                    <button onClick={() => setAllMatching(!pickedAll)} className="hsv-link text-xs">
                      {pickedAll ? `Chỉ chọn ${rows.length} sản phẩm trong trang này` : `Chọn tất cả ${total} sản phẩm`}
                    </button>
                  )}
                  {bulk ? (
                    <span className="flex items-center gap-1.5 text-muted2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Đang xử lý {bulk.done}/{bulk.total}…
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => void openBulkEditor()} className="hsv-btn-secondary hsv-btn-sm">
                        <PencilLine className="h-3.5 w-3.5" />
                        Chỉnh sửa hàng loạt
                      </button>
                      <button onClick={() => onBulkActive(true)} className="hsv-btn-secondary hsv-btn-sm">
                        Đặt là Đang bán
                      </button>
                      <button onClick={() => onBulkActive(false)} className="hsv-btn-secondary hsv-btn-sm">
                        Đặt là Tạm ẩn
                      </button>
                      <button onClick={onBulkDelete} className="hsv-btn-danger-outline hsv-btn-sm">
                        Xóa sản phẩm
                      </button>
                      <button onClick={clearSelection} className="hsv-link-muted ml-1 text-xs">
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={cn("hsv-thead grid min-h-8 items-center gap-3 py-1", COLS)}>
                  <Checkbox checked={false} onChange={toggleAll} disabled={rows.length === 0} label="Chọn tất cả sản phẩm trong trang" />
                  <span>Sản phẩm ({list.data?.totalCount ?? "…"})</span>
                  <span>Trạng thái</span>
                  <span>Tồn kho</span>
                  <span>Danh mục</span>
                  <span>Nguyên liệu</span>
                  <span className="text-right">Giá</span>
                  <span className="text-right">Thao tác</span>
                </div>
              )}
              {!list.data ? (
                <LoadingRows rows={6} />
              ) : rows.length === 0 ? (
                filtered ? (
                  <EmptyState icon={Package} title="Không có sản phẩm phù hợp" body="Thử đổi từ khóa hoặc bỏ bớt bộ lọc." />
                ) : (
                  <EmptyState
                    icon={Package}
                    title="Chưa có sản phẩm nào"
                    body="Thêm sản phẩm đầu tiên để bắt đầu bán trên cửa hàng."
                    action={
                      <button onClick={() => setParam("edit", "new")} className="hsv-btn-primary">
                        Thêm sản phẩm
                      </button>
                    }
                  />
                )
              ) : (
                rows.map((p) => {
                  const isPicked = selected.has(p.id);
                  const rowBusy = busyId === p.id || locked;
                  return (
                    <div key={p.id} className={cn("hsv-trow grid items-center gap-3", COLS, isPicked && "bg-surface hover:bg-surface", busyId === p.id && "opacity-50")}>
                      <Checkbox checked={isPicked} onChange={() => toggleOne(p.id)} disabled={locked} label={`Chọn ${p.name}`} />
                      <button onClick={() => setParam("edit", String(p.id))} className="flex min-w-0 items-center gap-3 rounded-lg text-left">
                        <ProductImage src={p.mainImage} seed={p.id} className="h-8 w-8 shrink-0 rounded-lg border border-line" />
                        <span className="min-w-0 truncate font-medium hover:underline">{p.name}</span>
                      </button>
                      <span>
                        <Badge tone={p.isActive ? "ok" : "neutral"}>{p.isActive ? "Đang bán" : "Tạm ẩn"}</Badge>
                      </span>
                      <span className="min-w-0 truncate">
                        <span className={cn(p.isLowStock && (p.totalStock === 0 ? "font-medium text-danger" : "font-medium text-warn"))}>
                          {p.totalStock === 0 ? "Hết hàng" : `${p.totalStock} còn hàng`}
                        </span>
                        <span className="text-muted2"> · {p.variantCount} biến thể</span>
                      </span>
                      <span className="truncate text-ink-2">{p.categoryName}</span>
                      <span className="truncate text-ink-2">{p.materialName}</span>
                      <span className="text-right font-medium">{formatVND(p.price)}</span>
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setParam("edit", String(p.id))} className="hsv-link">
                          Sửa
                        </button>
                        <button
                          disabled={rowBusy}
                          onClick={() =>
                            run(p, () => productApi.setActive(p.id, !p.isActive), p.isActive ? "Đã tạm ẩn sản phẩm" : "Sản phẩm đã hiển thị lại")
                          }
                          className="hsv-link-muted"
                        >
                          {p.isActive ? "Ẩn" : "Hiện"}
                        </button>
                        <button disabled={rowBusy} onClick={() => onDelete(p)} className="hsv-link-danger">
                          Xóa
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}
