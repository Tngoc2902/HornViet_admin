"use client";

import { useRef, useState } from "react";
import { FolderTree, Gem, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { EmptyState, FieldError, FormAlert, LoadingRows, notify, PageHeader, ProductImage } from "@/components/hsv/ui";
import { useCatalog } from "@/contexts/catalog-context";
import { toApiError } from "@/lib/api/http";
import { categoryApi, fileApi, materialApi } from "@/lib/api/services";
import type { Category, Material } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type Kind = "category" | "material";
type Row = { id: number; name: string; description: string | null; origin?: string | null; image?: string | null; productCount?: number };
type Form = { id?: number; name: string; origin: string; description: string; image: string };

/** Khớp giới hạn của File/UploadImage ở backend. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const CONFIG = {
  category: {
    title: "Danh mục",
    noun: "danh mục",
    icon: FolderTree,
    placeholder: "VD: Trâm cài",
    hint: "Xóa là xóa mềm. Danh mục còn sản phẩm (kể cả sản phẩm đang ẩn) sẽ không xóa được.",
    cols: "grid-cols-[1.1fr_1.6fr_110px_110px]",
    api: categoryApi,
  },
  material: {
    title: "Nguyên liệu & nguồn gốc",
    noun: "nguyên liệu",
    icon: Gem,
    placeholder: "VD: Sừng trâu đen",
    hint: "Thông tin xuất xứ và mô tả hiển thị ở thẻ “Nguồn gốc nguyên liệu” của sản phẩm.",
    cols: "grid-cols-[1fr_1.2fr_1.6fr_110px]",
    api: materialApi,
  },
} as const;

/** Quản lý danh mục / nguyên liệu: đọc từ CatalogContext, ghi qua Create/Update/Delete. */
export function CatalogAdmin({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind];
  const confirm = useConfirm();
  const catalog = useCatalog();
  const rows: Row[] = kind === "category" ? (catalog.categories as Category[]) : (catalog.materials as Material[]);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file || !form) return;
    if (!ACCEPT.includes(file.type)) return notify(`“${file.name}”: chỉ nhận ảnh JPG, PNG, WEBP`);
    if (file.size > MAX_IMAGE_BYTES) return notify(`“${file.name}” vượt quá 5 MB`);
    setUploading(true);
    try {
      const { url } = await fileApi.uploadImage(file);
      setForm((f) => (f ? { ...f, image: url } : f));
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setUploading(false);
    }
  };

  const open = (f: Form) => {
    setForm(f);
    setErrors({});
    setFormError("");
  };
  const openNew = () => open({ name: "", origin: "", description: "", image: "" });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      setErrors({ name: `Vui lòng nhập tên ${cfg.noun}` });
      return;
    }
    setBusy(true);
    try {
      const input = {
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        ...(kind === "material" ? { origin: form.origin.trim() || null, image: form.image || null } : {}),
      };
      await (form.id ? cfg.api.update(input) : cfg.api.create(input));
      await catalog.reload();
      setForm(null);
      notify(`Đã lưu ${cfg.noun}`);
    } catch (e) {
      const api = toApiError(e);
      const f = api.fieldErrors();
      // Lỗi trùng tên không có members → gắn vào ô Tên.
      if (!Object.keys(f).length && /tồn tại/i.test(api.message)) f.name = api.message;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    const ok = await confirm({
      title: `Xóa ${cfg.noun} “${r.name}”?`,
      body: `${cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1)} được xóa mềm và không còn hiển thị. ${
        kind === "category" ? "Chỉ xóa được khi danh mục không còn sản phẩm." : "Chỉ xóa được khi không còn sản phẩm dùng nguyên liệu này."
      }`,
      okLabel: "Xóa",
      danger: true,
    });
    if (!ok) return;
    try {
      await cfg.api.delete(r.id);
      await catalog.reload();
      if (form?.id === r.id) setForm(null);
      notify(`Đã xóa ${cfg.noun}`);
    } catch (e) {
      notify(toApiError(e).message);
    }
  };

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.hint}
        actions={
          <button onClick={openNew} className="hsv-btn-primary">
            <Plus className="h-4 w-4" />
            Thêm {cfg.noun}
          </button>
        }
      />
      <div className={cn("grid items-start gap-4", form && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className={cn("hsv-thead grid gap-3", cfg.cols)}>
              <span>
                Tên {cfg.noun} ({catalog.loaded ? rows.length : "…"})
              </span>
              {kind === "material" && <span>Xuất xứ</span>}
              <span>Mô tả</span>
              {kind === "category" && <span>Đang bán</span>}
              <span className="text-right">Thao tác</span>
            </div>
            {!catalog.loaded ? (
              <LoadingRows rows={5} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={cfg.icon}
                title={`Chưa có ${cfg.noun} nào`}
                body={kind === "category" ? "Danh mục giúp khách lọc sản phẩm trên cửa hàng." : "Nguyên liệu cho biết sản phẩm làm từ gì và nguồn gốc ở đâu."}
                action={
                  <button onClick={openNew} className="hsv-btn-primary">
                    Thêm {cfg.noun}
                  </button>
                }
              />
            ) : (
              rows.map((r) => (
                <div key={r.id} className={cn("hsv-trow grid items-center gap-3", cfg.cols, form?.id === r.id && "bg-surface")}>
                  {kind === "material" ? (
                    <span className="flex min-w-0 items-center gap-3">
                      <ProductImage src={r.image} seed={r.id} alt={r.name} className="h-8 w-8 shrink-0 rounded-lg border border-line" />
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
                  ) : (
                    <span className="truncate font-medium">{r.name}</span>
                  )}
                  {kind === "material" && <span className="text-ink-2">{r.origin || "—"}</span>}
                  <span className="line-clamp-2 text-muted2">{r.description || "—"}</span>
                  {kind === "category" && <span>{r.productCount} sản phẩm</span>}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => open({ id: r.id, name: r.name, origin: r.origin ?? "", description: r.description ?? "", image: r.image ?? "" })}
                      className="hsv-link"
                    >
                      Sửa
                    </button>
                    <button onClick={() => remove(r)} className="hsv-link-danger">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {form && (
          <div className="hsv-card sticky top-0 animate-hin">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="hsv-card-title">
                {form.id ? "Sửa" : "Thêm"} {cfg.noun}
              </p>
              <button onClick={() => setForm(null)} aria-label="Đóng" className="hsv-btn-icon">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <FormAlert message={formError} className="mb-3" />
              <label htmlFor="cf-name" className="hsv-label">
                Tên {cfg.noun}
              </label>
              <input
                id="cf-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder={cfg.placeholder}
                className={cn("hsv-input", errors.name && "hsv-input-error")}
              />
              <FieldError message={errors.name} />
              {kind === "material" && (
                <>
                  <label htmlFor="cf-origin" className="hsv-label mt-3">
                    Xuất xứ
                  </label>
                  <input
                    id="cf-origin"
                    value={form.origin}
                    onChange={(e) => setForm({ ...form, origin: e.target.value })}
                    placeholder="VD: Làng nghề Thụy Ứng, Hà Nội"
                    className={cn("hsv-input", errors.origin && "hsv-input-error")}
                  />
                  <FieldError message={errors.origin} />

                  <p className="hsv-label mt-3">Ảnh minh họa</p>
                  <p className="-mt-0.5 mb-2 text-xs text-muted2">Hiển thị ở trang chủ và trang Nguồn gốc của cửa hàng. JPG, PNG, WEBP · tối đa 5 MB.</p>
                  {form.image ? (
                    <div className="overflow-hidden rounded-lg border border-line">
                      <ProductImage src={form.image} seed={form.id ?? 0} alt={form.name} className="aspect-[16/10] w-full">
                        {uploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                            <Loader2 className="h-6 w-6 animate-spin text-ink" />
                          </div>
                        )}
                      </ProductImage>
                      <div className="flex justify-end gap-3 border-t border-line-2 px-3 py-2">
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="hsv-link">
                          Đổi ảnh
                        </button>
                        <button type="button" onClick={() => setForm({ ...form, image: "" })} disabled={uploading} className="hsv-link-danger">
                          Xóa ảnh
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-3 bg-surface-2 text-xs font-medium text-muted2 transition-colors hover:border-brand hover:bg-surface disabled:opacity-70"
                    >
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      {uploading ? "Đang tải ảnh…" : "Tải ảnh lên"}
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT.join(",")}
                    hidden
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
              <label htmlFor="cf-desc" className="hsv-label mt-3">
                {kind === "material" ? "Mô tả đặc điểm, tính hợp pháp" : "Mô tả"}
              </label>
              <textarea
                id="cf-desc"
                rows={kind === "material" ? 5 : 3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="hsv-input"
              />
              <FieldError message={errors.description} />
            </div>
            <div className="flex justify-end gap-2 rounded-b-card border-t border-line bg-surface px-4 py-3">
              <button onClick={() => setForm(null)} className="hsv-btn-secondary">
                Hủy
              </button>
              <button onClick={save} disabled={busy || uploading} className="hsv-btn-primary">
                {busy ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
