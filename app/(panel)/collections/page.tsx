"use client";

import { useState } from "react";
import { CollectionFormDrawer } from "@/components/hsv/collection-form-drawer";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { ErrorBox, LoadingRows, notify, ProductImage } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { STORE_URL, toApiError } from "@/lib/api/http";
import { collectionApi } from "@/lib/api/services";
import type { Collection } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-[minmax(240px,2fr)_minmax(180px,1.6fr)_100px_110px_70px_150px]";

/** Bộ sưu tập: nhóm sản phẩm do nhân viên chọn, hiện ở mục “Bộ sưu tập” của cửa hàng. */
export default function AdminCollections() {
  const confirm = useConfirm();
  const list = useApi(() => collectionApi.getAll(), []);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const rows = list.data?.items ?? [];

  const toggle = async (c: Collection) => {
    setBusyId(c.id);
    try {
      // Cập nhật cần đủ thông tin (kể cả danh sách sản phẩm) nên đọc chi tiết trước.
      const d = await collectionApi.get(c.id);
      await collectionApi.update({
        id: d.id,
        name: d.name,
        slug: d.slug,
        description: d.description,
        coverImage: d.coverImage,
        isActive: !d.isActive,
        displayOrder: d.displayOrder,
        productIds: d.productIds ?? [],
      });
      await list.reload();
      notify(d.isActive ? "Đã tạm ẩn bộ sưu tập" : "Bộ sưu tập đã hiển thị lại");
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: Collection) => {
    const ok = await confirm({
      title: `Xóa bộ sưu tập “${c.name}”?`,
      body: "Bộ sưu tập được xóa mềm và không còn hiển thị trên cửa hàng. Các sản phẩm trong bộ không bị ảnh hưởng.",
      okLabel: "Xóa",
      danger: true,
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      await collectionApi.delete(c.id);
      await list.reload();
      if (editing === c.id) setEditing(null);
      notify("Đã xóa bộ sưu tập");
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted2">Nhóm sản phẩm theo chủ đề (quà Tết, quà cưới, đồ thủ công…). Một sản phẩm có thể nằm trong nhiều bộ.</p>
        <button onClick={() => setEditing("new")} className="ml-auto rounded-lg bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white">
          + Thêm bộ sưu tập
        </button>
      </div>

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[900px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COLS)}>
              <span>Bộ sưu tập ({list.data ? rows.length : "…"})</span>
              <span>Mô tả</span>
              <span>Sản phẩm</span>
              <span>Trạng thái</span>
              <span>Thứ tự</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!list.data ? (
              <LoadingRows rows={4} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Chưa có bộ sưu tập nào. Bấm “+ Thêm bộ sưu tập” để tạo bộ đầu tiên.</p>
            ) : (
              rows.map((c) => (
                <div key={c.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-3", COLS, busyId === c.id && "opacity-50")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage src={c.coverImage || c.previewImages[0]} seed={c.id} alt={c.name} className="h-[46px] w-[64px] shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold leading-tight">{c.name}</p>
                      <a
                        href={`${STORE_URL}/bo-suu-tap/${c.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-xs text-muted2 hover:text-navy hover:underline"
                      >
                        /bo-suu-tap/{c.slug}
                      </a>
                    </div>
                  </div>
                  <span className="line-clamp-2 text-[13px] text-muted2">{c.description || "—"}</span>
                  <span className="text-[13px]">{c.productCount} sản phẩm</span>
                  <span
                    className={cn(
                      "w-fit rounded-lg px-2.5 py-1 text-[11.5px] font-bold",
                      c.isActive ? "bg-ok-soft text-ok" : "bg-[#efebe4] text-muted2"
                    )}
                  >
                    {c.isActive ? "Đang hiện" : "Tạm ẩn"}
                  </span>
                  <span className="text-[13px]">{c.displayOrder}</span>
                  <div className="flex justify-end gap-3.5">
                    <button onClick={() => setEditing(c.id)} className="text-[13px] font-semibold">
                      Sửa
                    </button>
                    <button onClick={() => toggle(c)} disabled={busyId === c.id} className="text-[13px] font-semibold text-muted2">
                      {c.isActive ? "Ẩn" : "Hiện"}
                    </button>
                    <button onClick={() => remove(c)} disabled={busyId === c.id} className="text-[13px] font-semibold text-danger">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {editing !== null && (
        <CollectionFormDrawer
          key={editing}
          id={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
    </div>
  );
}
