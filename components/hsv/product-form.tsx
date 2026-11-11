"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Badge, Card, DetailPage, ErrorBox, FieldError, FormAlert, LoadingRows, notify, ProductImage, SaveBar } from "@/components/hsv/ui";
import { useCatalog } from "@/contexts/catalog-context";
import { useApi } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { fileApi, productApi } from "@/lib/api/services";
import type { ProductDetail } from "@/lib/api/types";
import { formatVND, LOW_STOCK_THRESHOLD } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 6;
/** Trùng AppConsts.MinProductImages: sản phẩm mới cần tối thiểu 3 ảnh (gồm ảnh đại diện). */
const MIN_IMAGES_NEW = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const VARIANT_COLS = "grid-cols-[24px_44px_minmax(0,1fr)_minmax(0,1fr)_84px_60px_28px]";

/** image: ảnh của biến thể (một trong f.images); "" = dùng ảnh đại diện. */
type VariantRow = { key: number; id?: number; size: string; style: string; stock: string; image: string };
type FormState = {
  id?: number;
  name: string;
  categoryId: number | null;
  materialId: number | null;
  price: string;
  description: string;
  isActive: boolean;
  /** images[0] là mainImage (ảnh đại diện), phần còn lại là bộ ảnh chi tiết. */
  images: string[];
  variants: VariantRow[];
};
type ErrKey = "name" | "categoryId" | "materialId" | "price" | "mainImage" | "variants";

let rowKey = 1;
const blankRow = (): VariantRow => ({ key: rowKey++, size: "", style: "", stock: "", image: "" });

function toForm(p: ProductDetail | null): FormState {
  if (!p) return { name: "", categoryId: null, materialId: null, price: "", description: "", isActive: true, images: [], variants: [blankRow()] };
  return {
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    materialId: p.material?.id ?? null,
    price: String(p.price),
    description: p.description ?? "",
    isActive: p.isActive,
    images: [p.mainImage, ...(p.images ?? [])].filter((x, i, a): x is string => !!x && a.indexOf(x) === i),
    variants: (p.variants ?? []).map((v) => ({
      key: rowKey++,
      id: v.id,
      size: v.size ?? "",
      style: v.style ?? "",
      stock: String(v.stockQuantity),
      image: v.imageUrl ?? "",
    })),
  };
}

/** Ảnh chụp form để biết đã sửa gì chưa (bỏ `key` của dòng biến thể vì chỉ dùng cho React). */
const snapshot = (f: FormState) => JSON.stringify({ ...f, variants: f.variants.map(({ key: _key, ...r }) => r) });

/** Trang thêm / sửa sản phẩm. productId: undefined = thêm mới. onSaved được gọi sau khi lưu thành công. */
export function ProductForm({ productId, onClose, onSaved }: { productId?: number; onClose: () => void; onSaved: () => void }) {
  const { categories, materials } = useCatalog();
  const confirm = useConfirm();
  const isNew = productId === undefined;
  const detail = useApi(() => productApi.get(productId!), [productId], !isNew);
  const [initial, setInitial] = useState<FormState | null>(() => (isNew ? toForm(null) : null));
  const [f, setF] = useState<FormState | null>(initial);
  const [errors, setErrors] = useState<Partial<Record<ErrKey, string>>>({});
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  // Biến thể đang mở bảng chọn ảnh (theo key của dòng).
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [variantUploading, setVariantUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const variantFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!detail.data) return;
    const next = toForm(detail.data);
    setInitial(next);
    setF(next);
  }, [detail.data]);

  const dirty = !!f && !!initial && snapshot(f) !== snapshot(initial);

  // Sửa trường nào thì xóa lỗi của trường đó.
  const clearError = (k: keyof FormState) => setErrors((e) => ({ ...e, [k === "images" ? "mainImage" : k]: undefined }));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => (s ? { ...s, [k]: v } : s));
    clearError(k);
  };
  const setRow = (key: number, patch: Partial<VariantRow>) => {
    setF((s) => (s ? { ...s, variants: s.variants.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : s));
    clearError("variants");
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !f) return;
    const room = MAX_IMAGES - f.images.length;
    for (const file of Array.from(files).slice(0, room)) {
      if (!ACCEPT.includes(file.type)) {
        notify(`“${file.name}”: chỉ nhận ảnh JPG, PNG, WEBP`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        notify(`“${file.name}” vượt quá 5 MB`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const { url } = await fileApi.uploadImage(file);
        setF((s) => (s && s.images.length < MAX_IMAGES ? { ...s, images: [...s.images, url] } : s));
        setErrors((e) => ({ ...e, mainImage: undefined }));
      } catch (e) {
        notify(toApiError(e).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  // Tải ảnh ngay trong bảng chọn của biến thể: ảnh được thêm vào bộ ảnh sản phẩm và gán luôn cho biến thể đang mở.
  const uploadForVariant = async (file: File | undefined) => {
    const key = pickFor;
    if (!file || !f || key === null) return;
    if (f.images.length >= MAX_IMAGES) return notify(`Đã đủ ${MAX_IMAGES} ảnh — gỡ bớt ảnh ở mục Hình ảnh trước`);
    if (!ACCEPT.includes(file.type)) return notify(`“${file.name}”: chỉ nhận ảnh JPG, PNG, WEBP`);
    if (file.size > MAX_IMAGE_BYTES) return notify(`“${file.name}” vượt quá 5 MB`);
    setVariantUploading(true);
    try {
      const { url } = await fileApi.uploadImage(file);
      setF((st) =>
        st && st.images.length < MAX_IMAGES
          ? { ...st, images: [...st.images, url], variants: st.variants.map((r) => (r.key === key ? { ...r, image: url } : r)) }
          : st
      );
      setErrors((e) => ({ ...e, mainImage: undefined, variants: undefined }));
      setPickFor(null);
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setVariantUploading(false);
    }
  };

  const makeMain = (i: number) => f && set("images", [f.images[i], ...f.images.filter((_, j) => j !== i)]);

  const save = async () => {
    if (!f) return;
    const e: typeof errors = {};
    const price = parseInt(f.price.replace(/\D/g, ""), 10);
    if (!f.name.trim()) e.name = "Vui lòng nhập tên sản phẩm";
    if (!f.categoryId) e.categoryId = "Chọn danh mục";
    if (!f.materialId) e.materialId = "Chọn nguyên liệu";
    if (!price) e.price = "Giá bán phải lớn hơn 0";
    if (!f.images.length) e.mainImage = "Tải lên ít nhất một ảnh làm ảnh đại diện";
    else if (!f.id && f.images.length < MIN_IMAGES_NEW)
      e.mainImage = `Sản phẩm mới cần tối thiểu ${MIN_IMAGES_NEW} ảnh (gồm ảnh đại diện) — đang có ${f.images.length}`;
    if (!f.variants.length) e.variants = "Sản phẩm phải có ít nhất một biến thể.";
    else if (f.variants.some((v) => v.stock === "" || Number(v.stock) < 0)) e.variants = "Mỗi biến thể cần số tồn kho ≥ 0";
    else {
      const keys = f.variants.map((v) => `${v.size.trim().toLowerCase()}|${v.style.trim().toLowerCase()}`);
      if (new Set(keys).size !== keys.length) e.variants = "Có biến thể bị trùng kích thước và kiểu dáng";
      // Mỗi biến thể đi với 1 ảnh của sản phẩm.
      else if (f.variants.some((v) => !(v.image && f.images.includes(v.image))))
        e.variants = "Mỗi biến thể cần 1 ảnh — bấm ô Ảnh ở dòng được tô đỏ để chọn hoặc tải ảnh";
    }
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const input = {
        id: f.id,
        name: f.name.trim(),
        categoryId: f.categoryId!,
        materialId: f.materialId!,
        price,
        mainImage: f.images[0],
        images: f.images.slice(1),
        description: f.description.trim() || null,
        isActive: f.isActive,
        // Biến thể có id: sửa; không có id: thêm mới; biến thể cũ không gửi lên: bị xóa mềm.
        variants: f.variants.map((v) => ({
          id: v.id,
          size: v.size.trim() || null,
          style: v.style.trim() || null,
          // Ảnh đã gỡ khỏi bộ ảnh thì không gửi (biến thể quay về ảnh đại diện).
          imageUrl: v.image && f.images.includes(v.image) ? v.image : null,
          stockQuantity: Number(v.stock),
        })),
      };
      await (f.id ? productApi.update(input) : productApi.create(input));
      notify(f.id ? "Đã lưu sản phẩm" : "Đã thêm sản phẩm mới");
      onSaved();
      onClose();
    } catch (err) {
      const api = toApiError(err);
      const fe = api.fieldErrors();
      setErrors(fe as typeof errors);
      setFormError(api.fullMessage);
    } finally {
      setSaving(false);
    }
  };

  // Rời trang / bỏ thay đổi khi form đã sửa thì hỏi lại để không mất dữ liệu vừa nhập.
  const leave = async () => {
    if (dirty && !(await confirm({ title: "Rời trang mà chưa lưu?", body: "Các thay đổi chưa lưu của sản phẩm này sẽ bị bỏ.", okLabel: "Rời trang", danger: true }))) return;
    onClose();
  };
  const discard = async () => {
    if (isNew) return leave();
    if (!(await confirm({ title: "Bỏ mọi thay đổi chưa lưu?", body: "Form sẽ trở về dữ liệu đã lưu gần nhất.", okLabel: "Bỏ thay đổi", danger: true }))) return;
    setF(initial);
    setErrors({});
    setFormError("");
    setPickFor(null);
  };

  const total = f?.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0) ?? 0;
  // Danh mục / nguyên liệu hiện tại có thể đã bị xóa mềm → vẫn hiển thị để không mất lựa chọn.
  const catOptions = [...categories];
  if (f?.categoryId && detail.data && !categories.some((c) => c.id === f.categoryId))
    catOptions.push({ id: detail.data.categoryId, name: detail.data.categoryName, description: null, productCount: 0, creationTime: "" });

  const title = isNew ? "Thêm sản phẩm" : (initial?.name ?? "Sửa sản phẩm");

  return (
    <DetailPage
      parent="Sản phẩm"
      title={title}
      onBack={leave}
      backLabel="Quay lại danh sách sản phẩm"
      badge={!isNew && initial ? <Badge tone={initial.isActive ? "ok" : "neutral"}>{initial.isActive ? "Đang bán" : "Tạm ẩn"}</Badge> : undefined}
      aside={
        f && (
          <>
            <Card title="Trạng thái">
              <select
                aria-label="Trạng thái sản phẩm"
                value={f.isActive ? "on" : "off"}
                onChange={(e) => set("isActive", e.target.value === "on")}
                className="hsv-input"
              >
                <option value="on">Đang bán</option>
                <option value="off">Tạm ẩn</option>
              </select>
              <p className="hsv-hint">{f.isActive ? "Sản phẩm hiển thị trên cửa hàng." : "Sản phẩm không hiển thị trên cửa hàng."}</p>
            </Card>

            <Card title="Tổ chức sản phẩm">
              <label htmlFor="pf-category" className="hsv-label">
                Danh mục *
              </label>
              <select
                id="pf-category"
                value={f.categoryId ?? ""}
                onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : null)}
                className={cn("hsv-input", errors.categoryId && "hsv-input-error")}
              >
                <option value="">— Chọn danh mục —</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.categoryId} />

              <label htmlFor="pf-material" className="hsv-label mt-3">
                Nguyên liệu *
              </label>
              <select
                id="pf-material"
                value={f.materialId ?? ""}
                onChange={(e) => set("materialId", e.target.value ? Number(e.target.value) : null)}
                className={cn("hsv-input", errors.materialId && "hsv-input-error")}
              >
                <option value="">— Chọn nguyên liệu —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.materialId} />
            </Card>

            <Card title="Tóm tắt">
              <dl className="flex flex-col gap-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted2">Giá bán</dt>
                  <dd className="font-medium">{f.price ? formatVND(Number(f.price)) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted2">Biến thể</dt>
                  <dd className="font-medium">{f.variants.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted2">Tổng tồn kho</dt>
                  <dd className={cn("font-medium", total === 0 ? "text-danger" : total <= LOW_STOCK_THRESHOLD && "text-warn")}>{total}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted2">Hình ảnh</dt>
                  <dd className="font-medium">
                    {f.images.length}/{MAX_IMAGES}
                  </dd>
                </div>
              </dl>
            </Card>
          </>
        )
      }
    >
      {(isNew || dirty) && f && (
        <SaveBar
          message={isNew ? "Sản phẩm chưa lưu" : "Thay đổi chưa lưu"}
          note={uploading > 0 ? "Đang tải ảnh lên…" : undefined}
          onDiscard={discard}
          onSave={save}
          saving={saving}
          disabled={uploading > 0}
          saveLabel="Lưu"
        />
      )}

      {detail.error ? (
        <ErrorBox error={detail.error} onRetry={detail.reload} />
      ) : !f ? (
        <div className="hsv-card">
          <LoadingRows rows={8} />
        </div>
      ) : (
        <>
          <FormAlert message={formError} />

          <Card>
            <label htmlFor="pf-name" className="hsv-label">
              Tên sản phẩm *
            </label>
            <input id="pf-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Lược sừng răng thưa" className={cn("hsv-input", errors.name && "hsv-input-error")} />
            <FieldError message={errors.name} />

            <label htmlFor="pf-desc" className="hsv-label mt-3">
              Mô tả
            </label>
            <textarea
              id="pf-desc"
              rows={5}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Mô tả, kích thước, cách bảo quản…"
              className="hsv-input"
            />
          </Card>

          <Card title="Hình ảnh *">
            <p className="-mt-2 mb-3 text-xs text-muted2">
              Ảnh đầu tiên là ảnh đại diện{f.id ? "" : ` · tối thiểu ${MIN_IMAGES_NEW} ảnh`} · JPG, PNG, WEBP ≤ 5 MB · tối đa {MAX_IMAGES} ảnh.
            </p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {f.images.map((src, i) => (
                <div key={src} className={cn("group relative", i === 0 && "col-span-2 row-span-2")}>
                  <ProductImage src={src} seed={i} className="aspect-square rounded-lg border border-line" />
                  {i === 0 ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-brand/90 px-1.5 py-0.5 text-[11px] font-medium text-white">Đại diện</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makeMain(i)}
                      className="absolute bottom-1.5 left-1.5 hidden rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-medium text-ink shadow group-hover:block"
                    >
                      Làm đại diện
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Gỡ ảnh"
                    onClick={() => set("images", f.images.filter((_, j) => j !== i))}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-white/95 text-danger shadow"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div key={`u${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line-3 bg-surface-2">
                  <Loader2 className="h-5 w-5 animate-spin text-faint" />
                </div>
              ))}
              {f.images.length + uploading < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-surface-2 text-xs font-medium text-muted2 transition-colors hover:border-brand hover:bg-surface",
                    errors.mainImage ? "border-danger" : "border-line-3",
                    f.images.length === 0 && uploading === 0 && "col-span-3 aspect-auto py-8 sm:col-span-6"
                  )}
                >
                  <ImagePlus className="h-5 w-5" />
                  Tải ảnh
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT.join(",")}
              multiple
              hidden
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <FieldError message={errors.mainImage} />
          </Card>

          <Card title="Giá">
            <label htmlFor="pf-price" className="hsv-label -mt-1">
              Giá bán *
            </label>
            <div className="relative max-w-[260px]">
              <input
                id="pf-price"
                inputMode="numeric"
                value={f.price}
                onChange={(e) => set("price", e.target.value.replace(/[^\d]/g, ""))}
                placeholder="280000"
                className={cn("hsv-input pr-8", errors.price && "hsv-input-error")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted2">₫</span>
            </div>
            <FieldError message={errors.price} />
          </Card>

          <Card
            flush
            title={
              <>
                Biến thể, ảnh &amp; tồn kho * <span className="font-normal text-muted2">· tổng {total}</span>
              </>
            }
            actions={
              <button type="button" onClick={() => set("variants", [...f.variants, blankRow()])} className="hsv-btn-secondary hsv-btn-sm">
                <Plus className="h-3.5 w-3.5" />
                Thêm biến thể
              </button>
            }
          >
            <div className="mt-3 overflow-x-auto border-t border-line">
              <div className="min-w-[520px]">
                <div className={cn("hsv-thead grid items-center gap-2", VARIANT_COLS)}>
                  <span>#</span>
                  <span>Ảnh</span>
                  <span>Kích thước</span>
                  <span>Kiểu dáng</span>
                  <span>Tồn kho</span>
                  <span />
                  <span />
                </div>
                {f.variants.map((v, i) => {
                  const stock = v.stock === "" ? null : Number(v.stock);
                  const img = v.image && f.images.includes(v.image) ? v.image : "";
                  return (
                    <div key={v.key} className="border-b border-line-2">
                      <div className={cn("grid items-center gap-2 px-4 py-2", VARIANT_COLS)}>
                        <span className="text-xs text-faint">{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setPickFor(pickFor === v.key ? null : v.key)}
                          aria-label="Chọn ảnh cho biến thể"
                          aria-expanded={pickFor === v.key}
                          title={img ? "Ảnh của biến thể — bấm để đổi" : "Chưa có ảnh — bấm để chọn"}
                          className={cn(
                            "relative h-10 w-10 overflow-hidden rounded-lg border",
                            pickFor === v.key
                              ? "border-brand ring-1 ring-brand"
                              : img
                                ? "border-line"
                                : errors.variants
                                  ? "border-dashed border-danger bg-danger-soft"
                                  : "border-dashed border-line-3"
                          )}
                        >
                          {img ? (
                            <ProductImage src={img} seed={i} className="h-full w-full" />
                          ) : (
                            <span className={cn("flex h-full w-full items-center justify-center text-[10px] leading-tight", errors.variants ? "text-danger" : "text-faint")}>
                              + Ảnh
                            </span>
                          )}
                        </button>
                        <input value={v.size} onChange={(e) => setRow(v.key, { size: e.target.value })} placeholder="Vừa" aria-label="Kích thước" className="hsv-input min-w-0" />
                        <input value={v.style} onChange={(e) => setRow(v.key, { style: e.target.value })} placeholder="Răng dày" aria-label="Kiểu dáng" className="hsv-input min-w-0" />
                        <input
                          value={v.stock}
                          inputMode="numeric"
                          onChange={(e) => setRow(v.key, { stock: e.target.value.replace(/[^\d]/g, "") })}
                          placeholder="0"
                          aria-label="Tồn kho"
                          className="hsv-input min-w-0"
                        />
                        <span className={cn("text-xs font-medium", stock === 0 ? "text-danger" : "text-warn")}>
                          {stock === null ? "" : stock === 0 ? "Hết" : stock <= LOW_STOCK_THRESHOLD ? "Sắp hết" : ""}
                        </span>
                        <button
                          type="button"
                          aria-label="Xóa biến thể"
                          onClick={() => set("variants", f.variants.filter((r) => r.key !== v.key))}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {pickFor === v.key && (
                        <div className="border-t border-dashed border-line bg-surface-2 px-4 py-3">
                          <p className="mb-2 text-xs text-muted2">Chọn 1 ảnh cho biến thể này (khách chọn biến thể thì ảnh lớn đổi theo):</p>
                          <div className="flex flex-wrap gap-2">
                            {f.images.map((src, j) => (
                              <button
                                key={src}
                                type="button"
                                onClick={() => (setRow(v.key, { image: src }), setPickFor(null))}
                                aria-label={`Chọn ảnh ${j + 1}`}
                                className={cn(
                                  "relative h-14 w-14 overflow-hidden rounded-lg border",
                                  img === src ? "border-brand ring-2 ring-brand" : "border-line hover:border-brand"
                                )}
                              >
                                <ProductImage src={src} seed={j} className="h-full w-full" />
                                {j === 0 && <span className="absolute inset-x-0 bottom-0 bg-brand/85 text-center text-[9px] font-medium text-white">Đại diện</span>}
                              </button>
                            ))}
                            {f.images.length < MAX_IMAGES && (
                              <button
                                type="button"
                                onClick={() => variantFileRef.current?.click()}
                                disabled={variantUploading}
                                className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-dashed border-line-3 bg-white text-[10px] leading-tight text-muted2 hover:border-brand disabled:opacity-60"
                              >
                                {variantUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ Tải ảnh"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <input
              ref={variantFileRef}
              type="file"
              accept={ACCEPT.join(",")}
              hidden
              onChange={(e) => {
                void uploadForVariant(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="px-4 py-3">
              <p className="text-xs text-muted2">
                Mỗi biến thể đi với 1 ảnh: bấm ô Ảnh để chọn trong ảnh sản phẩm hoặc tải ảnh mới — khách chọn biến thể nào thì ảnh lớn đổi theo. Bỏ trống cả kích thước và kiểu dáng thì biến thể hiển thị là “Mặc định”. Biến thể bị xóa sẽ được gỡ khỏi giỏ hàng của khách.
              </p>
              <FieldError message={errors.variants} />
            </div>
          </Card>
        </>
      )}
    </DetailPage>
  );
}
