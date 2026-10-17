"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { ProductFormDrawer } from "@/components/hsv/product-form-drawer";
import { Chip, ErrorBox, LoadingRows, notify, Pager, ProductImage } from "@/components/hsv/ui";
import { useCatalog } from "@/contexts/catalog-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { toApiError } from "@/lib/api/http";
import { productApi } from "@/lib/api/services";
import type { ProductAdminListItem } from "@/lib/api/types";
import { formatVND } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const COLS = "grid-cols-[minmax(220px,2.2fr)_1fr_1fr_110px_90px_70px_100px_140px]";

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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên sản phẩm"
          aria-label="Tìm theo tên sản phẩm"
          className="h-10 w-[260px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy"
        />
        <div className="flex gap-1.5">
          {STATUS.map((s) => (
            <Chip key={s.key} active={status === s.key} onClick={() => filter(() => setStatus(s.key))} className="px-3 py-[7px] text-[12.5px]">
              {s.label}
            </Chip>
          ))}
          <Chip active={lowOnly} onClick={() => filter(() => setParam("warn", lowOnly ? null : "1"))} className="px-3 py-[7px] text-[12.5px]">
            Sắp hết hàng
          </Chip>
        </div>
        <button onClick={() => setParam("edit", "new")} className="ml-auto rounded-lg bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white">
          + Thêm sản phẩm
        </button>
      </div>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        <Chip active={cat === undefined} onClick={() => filter(() => setCat(undefined))} className="px-3 py-[7px] text-[12.5px]">
          Mọi danh mục
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={cat === c.id} onClick={() => filter(() => setCat(c.id))} className="px-3 py-[7px] text-[12.5px]">
            {c.name}
          </Chip>
        ))}
      </div>

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[1040px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COLS)}>
              <span>Sản phẩm ({list.data?.totalCount ?? "…"})</span>
              <span>Danh mục</span>
              <span>Nguyên liệu</span>
              <span>Giá</span>
              <span>Biến thể</span>
              <span>Tồn</span>
              <span>Trạng thái</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!list.data ? (
              <LoadingRows rows={6} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Không có sản phẩm phù hợp.</p>
            ) : (
              rows.map((p) => (
                <div key={p.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-3", COLS, busyId === p.id && "opacity-50")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage src={p.mainImage} seed={p.id} className="h-[46px] w-[38px] shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold leading-tight">{p.name}</p>
                      {p.isLowStock && (
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-lg border px-2 py-px text-[11px] font-bold",
                            p.totalStock === 0 ? "border-danger-line bg-danger-soft text-danger" : "border-warn-line bg-warn-soft text-warn"
                          )}
                        >
                          {p.totalStock === 0 ? "Hết hàng" : "Sắp hết"}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[13px]">{p.categoryName}</span>
                  <span className="text-[13px]">{p.materialName}</span>
                  <span className="text-[13px] font-semibold">{formatVND(p.price)}</span>
                  <span className="text-[13px]">{p.variantCount} biến thể</span>
                  <span className="text-[13px] font-semibold">{p.totalStock}</span>
                  <span
                    className={cn(
                      "justify-self-start rounded-lg px-2.5 py-[3px] text-xs font-semibold",
                      p.isActive ? "bg-ok-soft text-ok" : "bg-[#efebe4] text-muted2"
                    )}
                  >
                    {p.isActive ? "Đang bán" : "Tạm ẩn"}
                  </span>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setParam("edit", String(p.id))} className="text-[13px] font-semibold">
                      Sửa
                    </button>
                    <button
                      disabled={busyId === p.id}
                      onClick={() =>
                        run(p, () => productApi.setActive(p.id, !p.isActive), p.isActive ? "Đã tạm ẩn sản phẩm" : "Sản phẩm đã hiển thị lại")
                      }
                      className="text-[13px] font-semibold text-muted2"
                    >
                      {p.isActive ? "Ẩn" : "Hiện"}
                    </button>
                    <button disabled={busyId === p.id} onClick={() => onDelete(p)} className="text-[13px] font-semibold text-danger">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />

      {editParam && (
        <ProductFormDrawer
          key={editParam}
          productId={editParam === "new" ? undefined : Number(editParam)}
          onClose={() => setParam("edit", null)}
          onSaved={() => void list.reload()}
        />
      )}
    </div>
  );
}
