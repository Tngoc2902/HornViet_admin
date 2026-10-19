"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import { Drawer, ErrorBox, FieldError, FormAlert, notify, ProductImage, Skeleton } from "@/components/hsv/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { collectionApi, fileApi, productApi } from "@/lib/api/services";
import type { CollectionProduct } from "@/lib/api/types";
import { formatVND } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

/** Khớp giới hạn của File/UploadImage ở backend. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

type Form = {
  name: string;
  slug: string;
  description: string;
  coverImage: string;
  isActive: boolean;
  displayOrder: string;
  products: CollectionProduct[];
};
type Errors = Partial<Record<"name" | "slug" | "description" | "displayOrder", string>>;

const EMPTY: Form = { name: "", slug: "", description: "", coverImage: "", isActive: true, displayOrder: "0", products: [] };

/** Giống CollectionAppService.Slugify ở backend: "Quà tặng Tết 2027" → "qua-tang-tet-2027". */
export function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");
}

/** Ngăn kéo thêm / sửa bộ sưu tập: thông tin, ảnh bìa, bật/tắt và danh sách sản phẩm (có sắp xếp). */
export function CollectionFormDrawer({ id, onClose, onSaved }: { id: number | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = id === "new";
  const detail = useApi(() => collectionApi.get(id as number), [id], !isNew);
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const kw = useDebounced(keyword.trim());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setForm({
      name: d.name,
      slug: d.slug,
      description: d.description ?? "",
      coverImage: d.coverImage ?? "",
      isActive: d.isActive,
      displayOrder: String(d.displayOrder),
      products: d.products ?? [],
    });
  }, [detail.data]);

  const search = useApi(() => productApi.getAdminList({ keyword: kw || undefined, maxResultCount: 8 }), [kw], !!form);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const onFile = async (file: File | undefined) => {
    if (!file || !form) return;
    if (!ACCEPT.includes(file.type)) return notify(`“${file.name}”: chỉ nhận ảnh JPG, PNG, WEBP`);
    if (file.size > MAX_IMAGE_BYTES) return notify(`“${file.name}” vượt quá 5 MB`);
    setUploading(true);
    try {
      const { url } = await fileApi.uploadImage(file);
      set("coverImage", url);
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setUploading(false);
    }
  };

  const move = (i: number, d: -1 | 1) => {
    if (!form) return;
    const j = i + d;
    if (j < 0 || j >= form.products.length) return;
    const next = [...form.products];
    [next[i], next[j]] = [next[j], next[i]];
    set("products", next);
  };

  const save = async () => {
    if (!form) return;
    const errs: Errors = {};
    if (!form.name.trim()) errs.name = "Vui lòng nhập tên bộ sưu tập";
    if (form.slug.trim() && !slugify(form.slug)) errs.slug = "Đường dẫn chỉ gồm chữ, số và dấu gạch ngang";
    if (!/^-?\d+$/.test(form.displayOrder.trim())) errs.displayOrder = "Nhập một số nguyên";
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const input = {
        id: isNew ? undefined : (id as number),
        name: form.name.trim(),
        slug: form.slug.trim() ? slugify(form.slug) : null,
        description: form.description.trim() || null,
        coverImage: form.coverImage || null,
        isActive: form.isActive,
        displayOrder: Number(form.displayOrder.trim()),
        productIds: form.products.map((p) => p.id),
      };
      await (isNew ? collectionApi.create(input) : collectionApi.update(input));
      notify("Đã lưu bộ sưu tập");
      onSaved();
    } catch (e) {
      const api = toApiError(e);
      const f = api.fieldErrors() as Errors;
      // Lỗi trùng đường dẫn không có members → gắn vào ô Đường dẫn.
      if (!Object.keys(f).length && /đường dẫn/i.test(api.message)) f.slug = api.message;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = new Set(form?.products.map((p) => p.id));
  const autoSlug = form ? slugify(form.slug || form.name) : "";

  return (
    <Drawer
      open
      onClose={onClose}
      width={680}
      header={
        <>
          <p className="text-[17px] font-bold">{isNew ? "Thêm bộ sưu tập" : "Sửa bộ sưu tập"}</p>
          {!isNew && detail.data && <p className="mt-0.5 truncate text-[13px] text-muted2">{detail.data.name}</p>}
        </>
      }
      footer={
        form && (
          <>
            <button onClick={onClose} className="ml-auto px-3.5 py-2.5 text-[13.5px]">
              Hủy
            </button>
            <button onClick={save} disabled={busy || uploading} className="rounded-lg bg-navy px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {busy ? "Đang lưu…" : "Lưu bộ sưu tập"}
            </button>
          </>
        )
      }
    >
      {detail.error && !form ? (
        <ErrorBox error={detail.error} onRetry={detail.reload} />
      ) : !form ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="flex flex-col">
          <FormAlert message={formError} />

          <label htmlFor="col-name" className="hsv-label">
            Tên bộ sưu tập *
          </label>
          <input
            id="col-name"
            autoFocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="VD: Quà tặng Tết"
            className={cn("hsv-input h-11 text-sm", errors.name && "hsv-input-error")}
          />
          <FieldError message={errors.name} />

          <label htmlFor="col-slug" className="hsv-label mt-3.5">
            Đường dẫn
          </label>
          <input
            id="col-slug"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder={slugify(form.name) || "tu-dong-tao-tu-ten"}
            className={cn("hsv-input h-11 text-sm", errors.slug && "hsv-input-error")}
          />
          <FieldError message={errors.slug} />
          <p className="mt-1 text-xs text-faint">
            Trên cửa hàng: /bo-suu-tap/<b className="font-semibold text-muted2">{autoSlug || "…"}</b> · để trống thì tự tạo từ tên.
          </p>

          <label htmlFor="col-desc" className="hsv-label mt-3.5">
            Mô tả ngắn
          </label>
          <textarea
            id="col-desc"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Hiện dưới tên bộ sưu tập trên cửa hàng"
            className="w-full resize-y rounded-card border border-line px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
          <FieldError message={errors.description} />

          <div className="mt-3.5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div>
              <p className="hsv-label">Ảnh bìa</p>
              <p className="-mt-1 mb-2 text-xs text-faint">Để trống thì dùng ảnh sản phẩm đầu tiên. JPG, PNG, WEBP · tối đa 5 MB.</p>
              {form.coverImage ? (
                <div className="overflow-hidden rounded-card border border-line">
                  <ProductImage src={form.coverImage} seed={0} alt={form.name} className="aspect-[16/9] w-full">
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
                    <button type="button" onClick={() => set("coverImage", "")} disabled={uploading} className="text-[13px] font-semibold text-danger">
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-3 bg-surface-2 text-[13px] text-subtle hover:border-navy disabled:opacity-70"
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
            </div>
            <div>
              <label htmlFor="col-order" className="hsv-label">
                Thứ tự hiển thị
              </label>
              <input
                id="col-order"
                inputMode="numeric"
                value={form.displayOrder}
                onChange={(e) => set("displayOrder", e.target.value)}
                className={cn("hsv-input h-11 text-sm", errors.displayOrder && "hsv-input-error")}
              />
              <FieldError message={errors.displayOrder} />
              <p className="mt-1 text-xs text-faint">Số nhỏ đứng trước.</p>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
                <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="mt-0.5 h-4 w-4 accent-navy" />
                <span>
                  Hiển thị trên cửa hàng
                  <span className="block text-xs text-faint">Bỏ chọn để tạm ẩn.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-[15px] font-bold">
              Sản phẩm trong bộ <span className="font-normal text-muted2">({form.products.length})</span>
            </p>
            <p className="mt-0.5 text-xs text-faint">Thứ tự dưới đây là thứ tự hiển thị trên cửa hàng (mục “Nổi bật”).</p>
            {form.products.length === 0 ? (
              <p className="mt-3 rounded-card border border-dashed border-line-3 px-4 py-6 text-center text-[13px] text-subtle">
                Chưa có sản phẩm. Tìm và thêm ở ô bên dưới.
              </p>
            ) : (
              <ol className="mt-3 overflow-hidden rounded-card border border-line">
                {form.products.map((p, i) => (
                  <li key={p.id} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-line-2")}>
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-faint">{i + 1}</span>
                    <ProductImage src={p.mainImage} seed={p.id} className="h-10 w-10 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                      <span className="text-xs text-muted2">
                        {formatVND(p.price)}
                        {!p.isActive && <span className="ml-2 rounded bg-[#efebe4] px-1.5 py-px text-[11px] font-semibold text-muted2">Sản phẩm đang ẩn</span>}
                      </span>
                    </span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Đưa lên" className="p-1.5 text-subtle hover:text-navy disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === form.products.length - 1}
                      aria-label="Đưa xuống"
                      className="p-1.5 text-subtle hover:text-navy disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => set("products", form.products.filter((x) => x.id !== p.id))}
                      aria-label={`Bỏ ${p.name} khỏi bộ`}
                      className="p-1.5 text-subtle hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <p className="hsv-label mt-5">Thêm sản phẩm</p>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo tên sản phẩm"
              aria-label="Tìm sản phẩm để thêm"
              className="hsv-input h-10 text-[13.5px]"
            />
            <div className={cn("mt-2 overflow-hidden rounded-card border border-line", search.loading && "opacity-70")}>
              {!search.data ? (
                <div className="flex flex-col gap-2 p-3">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : search.data.items.length === 0 ? (
                <p className="px-4 py-5 text-center text-[13px] text-subtle">Không tìm thấy sản phẩm.</p>
              ) : (
                search.data.items.map((p, i) => {
                  const added = chosen.has(p.id);
                  return (
                    <div key={p.id} className={cn("flex items-center gap-3 px-3 py-2", i > 0 && "border-t border-line-2")}>
                      <ProductImage src={p.mainImage} seed={p.id} className="h-10 w-10 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px]">{p.name}</span>
                        <span className="text-xs text-muted2">
                          {formatVND(p.price)} · {p.categoryName}
                          {!p.isActive && " · đang ẩn"}
                        </span>
                      </span>
                      <button
                        disabled={added}
                        onClick={() =>
                          set("products", [...form.products, { id: p.id, name: p.name, mainImage: p.mainImage ?? "", price: p.price, isActive: p.isActive }])
                        }
                        className={cn(
                          "shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
                          added ? "text-faint" : "border border-navy text-navy hover:bg-navy hover:text-white"
                        )}
                      >
                        {added ? "Đã thêm" : "+ Thêm"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
