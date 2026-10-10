"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { FieldError, FormAlert, LoadingRows, notify, ProductImage } from "@/components/hsv/ui";
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
    noun: "danh mục",
    placeholder: "VD: Trâm cài",
    hint: "Xóa là xóa mềm. Danh mục còn sản phẩm (kể cả sản phẩm đang ẩn) sẽ không xóa được.",
    cols: "grid-cols-[1.1fr_1.6fr_110px_120px]",
    api: categoryApi,
  },
  material: {
    noun: "nguyên liệu",
    placeholder: "VD: Sừng trâu đen",
    hint: "Thông tin xuất xứ và mô tả hiển thị ở thẻ “Nguồn gốc nguyên liệu” của sản phẩm.",
    cols: "grid-cols-[1fr_1.2fr_1.6fr_120px]",
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
    <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="hsv-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <p className="text-sm text-muted2">{cfg.hint}</p>
          <button
            onClick={() => open({ name: "", origin: "", description: "", image: "" })}
            className="rounded-lg bg-navy px-4 py-[9px] text-[13.5px] font-semibold text-white"
          >
            + Thêm {cfg.noun}
          </button>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", cfg.cols)}>
              <span>Tên {cfg.noun}</span>
              {kind === "material" && <span>Xuất xứ</span>}
              <span>Mô tả</span>
              {kind === "category" && <span>Đang bán</span>}
              <span className="text-right">Thao tác</span>
            </div>
            {!catalog.loaded ? (
              <LoadingRows rows={5} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Chưa có {cfg.noun} nào.</p>
            ) : (
              rows.map((r) => (
                <div key={r.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-[13px]", cfg.cols)}>
                  {kind === "material" ? (
                    <span className="flex items-center gap-3">
                      <ProductImage src={r.image} seed={r.id} alt={r.name} className="h-11 w-11 shrink-0 rounded-lg" />
                      <span className="text-sm font-semibold">{r.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm font-semibold">{r.name}</span>
                  )}
                  {kind === "material" && <span className="text-[13px] text-ink-2">{r.origin || "—"}</span>}
                  <span className="line-clamp-2 text-[13px] text-muted2">{r.description || "—"}</span>
                  {kind === "category" && <span className="text-[13px]">{r.productCount} sản phẩm</span>}
                  <div className="flex justify-end gap-3.5">
                    <button
                      onClick={() => open({ id: r.id, name: r.name, origin: r.origin ?? "", description: r.description ?? "", image: r.image ?? "" })}
                      className="text-[13px] font-semibold"
                    >
                      Sửa
                    </button>
                    <button onClick={() => remove(r)} className="text-[13px] font-semibold text-danger">
                      Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {form && (
        <div className="sticky top-5 rounded-card border border-navy bg-white p-[22px]">
          <p className="mb-4 text-base font-bold">
            {form.id ? "Sửa" : "Thêm"} {cfg.noun}
          </p>
          <FormAlert message={formError} />
          <label htmlFor="cf-name" className="hsv-label mt-1">
            Tên {cfg.noun}
          </label>
          <input
            id="cf-name"
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={cfg.placeholder}
            className={cn("hsv-input h-11 text-sm", errors.name && "hsv-input-error")}
          />
          <FieldError message={errors.name} />
          {kind === "material" && (
            <>
              <label htmlFor="cf-origin" className="hsv-label mt-3.5">
                Xuất xứ
              </label>
              <input
                id="cf-origin"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                placeholder="VD: Làng nghề Thụy Ứng, Hà Nội"
                className={cn("hsv-input h-11 text-sm", errors.origin && "hsv-input-error")}
              />
              <FieldError message={errors.origin} />

              <p className="hsv-label mt-3.5">Ảnh minh họa</p>
              <p className="-mt-1 mb-2 text-xs text-faint">Hiển thị ở trang chủ và trang Nguồn gốc của cửa hàng. JPG, PNG, WEBP · tối đa 5 MB.</p>
              {form.image ? (
                <div className="overflow-hidden rounded-card border border-line">
                  <ProductImage src={form.image} seed={form.id ?? 0} alt={form.name} className="aspect-[16/10] w-full">
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                        <Loader2 className="h-6 w-6 animate-spin text-navy" />
                      </div>
                    )}
                  </ProductImage>
                  <div className="flex justify-end gap-3.5 border-t border-line-2 px-3 py-2">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[13px] font-semibold">
                      Đổi ảnh
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, image: "" })} disabled={uploading} className="text-[13px] font-semibold text-danger">
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-3 bg-surface-2 text-[13px] text-subtle hover:border-navy disabled:opacity-70"
                >
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
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
          <label htmlFor="cf-desc" className="hsv-label mt-3.5">
            {kind === "material" ? "Mô tả đặc điểm, tính hợp pháp" : "Mô tả"}
          </label>
          <textarea
            id="cf-desc"
            rows={kind === "material" ? 5 : 3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full resize-y rounded-card border border-line px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
          <FieldError message={errors.description} />
          <div className="mt-4 flex justify-end gap-2.5">
            <button onClick={() => setForm(null)} className="px-3.5 py-2.5 text-[13.5px]">
              Hủy
            </button>
            <button onClick={save} disabled={busy || uploading} className="rounded-lg bg-navy px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
