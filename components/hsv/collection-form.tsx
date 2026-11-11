"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Badge, Card, DetailPage, ErrorBox, FieldError, FormAlert, notify, ProductImage, SaveBar, SearchInput, Skeleton } from "@/components/hsv/ui";
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");
}

/** Trang thêm / sửa bộ sưu tập: thông tin, ảnh bìa, bật/tắt và danh sách sản phẩm (có sắp xếp). */
export function CollectionForm({ id, onClose, onSaved }: { id: number | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = id === "new";
  const confirm = useConfirm();
  const detail = useApi(() => collectionApi.get(id as number), [id], !isNew);
  const [initial, setInitial] = useState<Form | null>(isNew ? EMPTY : null);
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
    const next: Form = {
      name: d.name,
      slug: d.slug,
      description: d.description ?? "",
      coverImage: d.coverImage ?? "",
      isActive: d.isActive,
      displayOrder: String(d.displayOrder),
      products: d.products ?? [],
    };
    setInitial(next);
    setForm(next);
  }, [detail.data]);

  const search = useApi(() => productApi.getAdminList({ keyword: kw || undefined, maxResultCount: 8 }), [kw], !!form);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial);

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

  // Rời trang / bỏ thay đổi khi form đã sửa thì hỏi lại để không mất dữ liệu vừa nhập.
  const leave = async () => {
    if (dirty && !(await confirm({ title: "Rời trang mà chưa lưu?", body: "Các thay đổi chưa lưu của bộ sưu tập này sẽ bị bỏ.", okLabel: "Rời trang", danger: true }))) return;
    onClose();
  };
  const discard = async () => {
    if (isNew) return leave();
    if (!(await confirm({ title: "Bỏ mọi thay đổi chưa lưu?", body: "Form sẽ trở về dữ liệu đã lưu gần nhất.", okLabel: "Bỏ thay đổi", danger: true }))) return;
    setForm(initial);
    setErrors({});
    setFormError("");
  };

  const chosen = new Set(form?.products.map((p) => p.id));
  const autoSlug = form ? slugify(form.slug || form.name) : "";

  return (
    <DetailPage
      parent="Bộ sưu tập"
      title={isNew ? "Thêm bộ sưu tập" : (initial?.name ?? "Sửa bộ sưu tập")}
      onBack={leave}
      backLabel="Quay lại danh sách bộ sưu tập"
      badge={!isNew && initial ? <Badge tone={initial.isActive ? "ok" : "neutral"}>{initial.isActive ? "Đang hiện" : "Tạm ẩn"}</Badge> : undefined}
      aside={
        form && (
          <>
            <Card title="Trạng thái">
              <select
                aria-label="Trạng thái bộ sưu tập"
                value={form.isActive ? "on" : "off"}
                onChange={(e) => set("isActive", e.target.value === "on")}
                className="hsv-input"
              >
                <option value="on">Hiển thị trên cửa hàng</option>
                <option value="off">Tạm ẩn</option>
              </select>
              <label htmlFor="col-order" className="hsv-label mt-3">
                Thứ tự hiển thị
              </label>
              <input
                id="col-order"
                inputMode="numeric"
                value={form.displayOrder}
                onChange={(e) => set("displayOrder", e.target.value)}
                className={cn("hsv-input", errors.displayOrder && "hsv-input-error")}
              />
              <FieldError message={errors.displayOrder} />
              <p className="hsv-hint">Số nhỏ đứng trước.</p>
            </Card>

            <Card title="Ảnh bìa">
              <p className="-mt-2 mb-3 text-xs text-muted2">Để trống thì dùng ảnh sản phẩm đầu tiên. JPG, PNG, WEBP · tối đa 5 MB.</p>
              {form.coverImage ? (
                <div className="overflow-hidden rounded-lg border border-line">
                  <ProductImage src={form.coverImage} seed={0} alt={form.name} className="aspect-[16/9] w-full">
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
                    <button type="button" onClick={() => set("coverImage", "")} disabled={uploading} className="hsv-link-danger">
                      Xóa ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-3 bg-surface-2 text-xs font-medium text-muted2 transition-colors hover:border-brand hover:bg-surface disabled:opacity-70"
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
            </Card>
          </>
        )
      }
    >
      {(isNew || dirty) && form && (
        <SaveBar
          message={isNew ? "Bộ sưu tập chưa lưu" : "Thay đổi chưa lưu"}
          note={uploading ? "Đang tải ảnh lên…" : undefined}
          onDiscard={discard}
          onSave={save}
          saving={busy}
          disabled={uploading}
        />
      )}

      {detail.error && !form ? (
        <ErrorBox error={detail.error} onRetry={detail.reload} />
      ) : !form ? (
        <div className="hsv-card flex flex-col gap-3 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <FormAlert message={formError} />

          <Card>
            <label htmlFor="col-name" className="hsv-label">
              Tên bộ sưu tập *
            </label>
            <input
              id="col-name"
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: Quà tặng Tết"
              className={cn("hsv-input", errors.name && "hsv-input-error")}
            />
            <FieldError message={errors.name} />

            <label htmlFor="col-desc" className="hsv-label mt-3">
              Mô tả ngắn
            </label>
            <textarea
              id="col-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Hiện dưới tên bộ sưu tập trên cửa hàng"
              className="hsv-input"
            />
            <FieldError message={errors.description} />

            <label htmlFor="col-slug" className="hsv-label mt-3">
              Đường dẫn
            </label>
            <input
              id="col-slug"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder={slugify(form.name) || "tu-dong-tao-tu-ten"}
              className={cn("hsv-input", errors.slug && "hsv-input-error")}
            />
            <FieldError message={errors.slug} />
            <p className="hsv-hint">
              Trên cửa hàng: /bo-suu-tap/<b className="font-semibold text-ink-2">{autoSlug || "…"}</b> · để trống thì tự tạo từ tên.
            </p>
          </Card>

          <Card
            flush
            title={
              <>
                Sản phẩm trong bộ <span className="font-normal text-muted2">({form.products.length})</span>
              </>
            }
          >
            <p className="px-4 pt-1 text-xs text-muted2">Thứ tự dưới đây là thứ tự hiển thị trên cửa hàng (mục “Nổi bật”).</p>
            {form.products.length === 0 ? (
              <p className="mx-4 mt-3 rounded-lg border border-dashed border-line-3 px-4 py-6 text-center text-[13px] text-muted2">
                Chưa có sản phẩm. Tìm và thêm ở ô bên dưới.
              </p>
            ) : (
              <ol className="mt-3 border-y border-line">
                {form.products.map((p, i) => (
                  <li key={p.id} className="hsv-trow flex items-center gap-3 py-2">
                    <span className="w-5 shrink-0 text-center text-xs font-medium text-faint">{i + 1}</span>
                    <ProductImage src={p.mainImage} seed={p.id} className="h-10 w-10 shrink-0 rounded-lg border border-line" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted2">
                        {formatVND(p.price)}
                        {!p.isActive && <Badge className="px-1.5 py-0 text-[11px]">Sản phẩm đang ẩn</Badge>}
                      </span>
                    </span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Đưa lên" className="hsv-btn-icon disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === form.products.length - 1}
                      aria-label="Đưa xuống"
                      className="hsv-btn-icon disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => set("products", form.products.filter((x) => x.id !== p.id))}
                      aria-label={`Bỏ ${p.name} khỏi bộ`}
                      className="hsv-btn-icon hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="p-4">
              <p className="hsv-label">Thêm sản phẩm</p>
              <SearchInput value={keyword} onChange={setKeyword} placeholder="Tìm theo tên sản phẩm" label="Tìm sản phẩm để thêm" />
              <div className={cn("mt-2 overflow-hidden rounded-lg border border-line", search.loading && "opacity-70")}>
                {!search.data ? (
                  <div className="flex flex-col gap-2 p-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : search.data.items.length === 0 ? (
                  <p className="px-4 py-5 text-center text-[13px] text-muted2">Không tìm thấy sản phẩm.</p>
                ) : (
                  search.data.items.map((p) => {
                    const added = chosen.has(p.id);
                    return (
                      <div key={p.id} className="hsv-trow flex items-center gap-3 px-3 py-2">
                        <ProductImage src={p.mainImage} seed={p.id} className="h-10 w-10 shrink-0 rounded-lg border border-line" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{p.name}</span>
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
                          className={cn("hsv-btn-sm", added ? "hsv-btn text-faint" : "hsv-btn-secondary")}
                        >
                          {added ? (
                            "Đã thêm"
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Thêm
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </DetailPage>
  );
}
