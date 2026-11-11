"use client";

import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { CollectionForm } from "@/components/hsv/collection-form";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Badge, EmptyState, ErrorBox, LoadingRows, notify, PageHeader, ProductImage } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { STORE_URL, toApiError } from "@/lib/api/http";
import { collectionApi } from "@/lib/api/services";
import type { Collection } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const COLS = "grid-cols-[minmax(240px,2fr)_minmax(180px,1.6fr)_110px_100px_80px_140px]";

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

  // Đang thêm / sửa: form chiếm cả trang.
  if (editing !== null) {
    return (
      <CollectionForm
        key={editing}
        id={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void list.reload();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Bộ sưu tập"
        subtitle="Nhóm sản phẩm theo chủ đề (quà Tết, quà cưới, đồ thủ công…). Một sản phẩm có thể nằm trong nhiều bộ."
        actions={
          <button onClick={() => setEditing("new")} className="hsv-btn-primary">
            <Plus className="h-4 w-4" />
            Thêm bộ sưu tập
          </button>
        }
      />

      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[900px]">
            <div className={cn("hsv-thead grid gap-3", COLS)}>
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
              <EmptyState
                icon={Layers}
                title="Chưa có bộ sưu tập nào"
                body="Tạo bộ sưu tập để gom sản phẩm theo chủ đề và hiện ở mục “Bộ sưu tập” của cửa hàng."
                action={
                  <button onClick={() => setEditing("new")} className="hsv-btn-primary">
                    Thêm bộ sưu tập
                  </button>
                }
              />
            ) : (
              rows.map((c) => (
                <div key={c.id} className={cn("hsv-trow grid items-center gap-3", COLS, busyId === c.id && "opacity-50")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage src={c.coverImage || c.previewImages[0]} seed={c.id} alt={c.name} className="h-8 w-11 shrink-0 rounded-lg border border-line" />
                    <div className="min-w-0">
                      <button onClick={() => setEditing(c.id)} className="block max-w-full truncate rounded text-left font-medium hover:underline">
                        {c.name}
                      </button>
                      <a
                        href={`${STORE_URL}/bo-suu-tap/${c.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-muted2 hover:text-ink hover:underline"
                      >
                        /bo-suu-tap/{c.slug}
                      </a>
                    </div>
                  </div>
                  <span className="line-clamp-2 text-muted2">{c.description || "—"}</span>
                  <span>{c.productCount} sản phẩm</span>
                  <span>
                    <Badge tone={c.isActive ? "ok" : "neutral"}>{c.isActive ? "Đang hiện" : "Tạm ẩn"}</Badge>
                  </span>
                  <span>{c.displayOrder}</span>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setEditing(c.id)} className="hsv-link">
                      Sửa
                    </button>
                    <button onClick={() => toggle(c)} disabled={busyId === c.id} className="hsv-link-muted">
                      {c.isActive ? "Ẩn" : "Hiện"}
                    </button>
                    <button onClick={() => remove(c)} disabled={busyId === c.id} className="hsv-link-danger">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
