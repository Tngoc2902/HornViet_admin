"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { ProductForm } from "@/components/hsv/product-form";
import { Badge, Chip, EmptyState, ErrorBox, LoadingRows, notify, PageHeader, Pager, ProductImage, SearchInput } from "@/components/hsv/ui";
import { useCatalog } from "@/contexts/catalog-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { toApiError } from "@/lib/api/http";
import { productApi } from "@/lib/api/services";
import type { ProductAdminListItem } from "@/lib/api/types";
import { formatVND } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const COLS = "grid-cols-[minmax(240px,2.4fr)_100px_minmax(150px,1.1fr)_1fr_1fr_110px_140px]";

const STATUS = [
  { key: "all", label: "Tất cả", value: undefined },
  { key: "on", label: "Đang bán", value: true },
  { key: "off", label: "Tạm ẩn", value: false },
] as const;

export default function AdminProducts() {
  const { categories } = useCatalog();
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

  const editParam = params.get("edit");
  const lowOnly = params.get("warn") === "1";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const list = useApi(
    () =>
      productApi.getAdminList({
        keyword: keyword || undefined,
        categoryId: cat,
        isActive: STATUS.find((s) => s.key === status)?.value,
        lowStockOnly: lowOnly || undefined,
        skipCount: (page - 1) * PAGE_SIZE,
        maxResultCount: PAGE_SIZE,
      }),
    [keyword, cat, status, lowOnly, page]
  );
  useRealtimeRefresh(["StockChanged", "ProductChanged"], () => list.reload());
  const rows = list.data?.items ?? [];
  const filtered = !!keyword || cat !== undefined || status !== "all" || lowOnly;

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
      body: "Sản phẩm được xóa mềm: biến mất khỏi cửa hàng và trang quản trị, được gỡ khỏi giỏ hàng của khách; lịch sử đơn và thống kê giữ nguyên.",
      okLabel: "Xóa sản phẩm",
      danger: true,
    });
    if (ok) await run(p, () => productApi.delete(p.id), "Đã xóa sản phẩm");
  };

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

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className="hsv-index">
          <div className="hsv-toolbar">
            <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-none">
              {STATUS.map((s) => (
                <Chip key={s.key} active={status === s.key} onClick={() => filter(() => setStatus(s.key))}>
                  {s.label}
                </Chip>
              ))}
              <Chip active={lowOnly} onClick={() => filter(() => setParam("warn", lowOnly ? null : "1"))}>
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
            <div className="min-w-[1000px]">
              <div className={cn("hsv-thead grid gap-3", COLS)}>
                <span>Sản phẩm ({list.data?.totalCount ?? "…"})</span>
                <span>Trạng thái</span>
                <span>Tồn kho</span>
                <span>Danh mục</span>
                <span>Nguyên liệu</span>
                <span className="text-right">Giá</span>
                <span className="text-right">Thao tác</span>
              </div>
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
                rows.map((p) => (
                  <div key={p.id} className={cn("hsv-trow grid items-center gap-3", COLS, busyId === p.id && "opacity-50")}>
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
                        disabled={busyId === p.id}
                        onClick={() =>
                          run(p, () => productApi.setActive(p.id, !p.isActive), p.isActive ? "Đã tạm ẩn sản phẩm" : "Sản phẩm đã hiển thị lại")
                        }
                        className="hsv-link-muted"
                      >
                        {p.isActive ? "Ẩn" : "Hiện"}
                      </button>
                      <button disabled={busyId === p.id} onClick={() => onDelete(p)} className="hsv-link-danger">
                        Xóa
                      </button>
                    </div>
                  </div>
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
