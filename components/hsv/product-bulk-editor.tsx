"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Badge, DetailPage, EmptyState, LoadingRows, notify, ProductImage, SaveBar } from "@/components/hsv/ui";
import { useCatalog } from "@/contexts/catalog-context";
import { toApiError } from "@/lib/api/http";
import { productApi } from "@/lib/api/services";
import type { ProductDetail, ProductInput } from "@/lib/api/types";
import { formatVND, LOW_STOCK_THRESHOLD } from "@/lib/hsv/format";
import { LEAVE_CONFIRM } from "@/lib/hsv/unsaved";
import { cn } from "@/lib/utils";

/** Một dòng sản phẩm đang sửa: `detail` là dữ liệu máy chủ trả về, các trường còn lại là giá trị đang gõ. */
type Row = {
  id: number;
  detail: ProductDetail;
  name: string;
  isActive: boolean;
  categoryId: number;
  materialId: number | null;
  price: string;
  /** Tồn kho đang gõ theo id biến thể. */
  stocks: Record<number, string>;
};
type Field = "name" | "isActive" | "categoryId" | "materialId" | "price";

function toRow(d: ProductDetail): Row {
  return {
    id: d.id,
    detail: d,
    name: d.name,
    isActive: d.isActive,
    categoryId: d.categoryId,
    materialId: d.material?.id ?? null,
    price: String(d.price),
    stocks: Object.fromEntries((d.variants ?? []).map((v) => [v.id, String(v.stockQuantity)])),
  };
}

const FIELDS: Field[] = ["name", "isActive", "categoryId", "materialId", "price"];
const fieldChanged = (r: Row, base: Row, f: Field) => (f === "name" ? r.name.trim() !== base.name.trim() : r[f] !== base[f]);
const stockChanged = (r: Row, base: Row, variantId: number) => r.stocks[variantId] !== base.stocks[variantId];
const changedFields = (r: Row, base: Row) => FIELDS.filter((f) => fieldChanged(r, base, f));
const anyStockChanged = (r: Row, base: Row) => Object.keys(r.stocks).some((k) => stockChanged(r, base, Number(k)));
const isDirty = (r: Row, base: Row) => changedFields(r, base).length > 0 || anyStockChanged(r, base);

/** Bộ ảnh của sản phẩm theo đúng cách form sản phẩm ghép: ảnh đại diện đứng đầu, bỏ trùng. */
const imagesOf = (d: ProductDetail) => [d.mainImage, ...(d.images ?? [])].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);

/** Kiểm tra trước khi gửi — cùng thông báo với form sản phẩm; ảnh thì không sửa được ở đây nên chỉ dẫn sang trang sản phẩm. */
function validate(r: Row): string | null {
  if (!r.name.trim()) return "Vui lòng nhập tên sản phẩm";
  if (!r.materialId) return "Chọn nguyên liệu";
  if (!parseInt(r.price.replace(/\D/g, ""), 10)) return "Giá bán phải lớn hơn 0";
  if (Object.values(r.stocks).some((s) => s === "" || Number(s) < 0)) return "Mỗi biến thể cần số tồn kho ≥ 0";
  const images = imagesOf(r.detail);
  if (!images.length) return "Sản phẩm chưa có ảnh đại diện — mở trang sản phẩm để bổ sung ảnh rồi mới sửa được ở đây";
  if ((r.detail.variants ?? []).some((v) => !(v.imageUrl && images.includes(v.imageUrl))))
    return "Có biến thể chưa có ảnh — mở trang sản phẩm để chọn ảnh cho biến thể rồi mới sửa được ở đây";
  return null;
}

/**
 * Ghép các ô người dùng đã sửa (so với `b`, giá trị lúc mở) vào bản mới nhất của máy chủ (`fresh`, đọc ngay trước khi lưu).
 * Ô không sửa lấy theo máy chủ — đặc biệt tồn kho: đơn hàng / nhập kho phát sinh trong lúc đang sửa không bị ghi đè bằng số cũ.
 */
function mergeIntoFresh(r: Row, b: Row, fresh: ProductDetail): Row {
  const f = toRow(fresh);
  const pick = <K extends Field>(k: K): Row[K] => (fieldChanged(r, b, k) ? r[k] : f[k]);
  const stocks = { ...f.stocks };
  for (const key of Object.keys(r.stocks)) {
    const variantId = Number(key);
    // Biến thể đã bị xóa ở nơi khác thì bỏ qua.
    if (variantId in stocks && stockChanged(r, b, variantId)) stocks[variantId] = r.stocks[variantId];
  }
  return { ...f, name: pick("name"), isActive: pick("isActive"), categoryId: pick("categoryId"), materialId: pick("materialId"), price: pick("price"), stocks };
}

/** Bỏ số 0 thừa ở đầu ("070" → "70") để gõ lại cùng giá trị không bị tính là đã sửa. */
const digits = (v: string) => v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");

/** Dữ liệu gửi Product/Update: giống hệt form sản phẩm, chỉ thay các ô đã sửa; ảnh, mô tả và biến thể giữ nguyên. */
function toInput(r: Row): ProductInput {
  const d = r.detail;
  const images = imagesOf(d);
  return {
    id: d.id,
    name: r.name.trim(),
    categoryId: r.categoryId,
    materialId: r.materialId!,
    price: parseInt(r.price.replace(/\D/g, ""), 10),
    mainImage: images[0],
    images: images.slice(1),
    description: d.description?.trim() || null,
    isActive: r.isActive,
    variants: (d.variants ?? []).map((v) => ({
      id: v.id,
      size: v.size?.trim() || null,
      style: v.style?.trim() || null,
      imageUrl: v.imageUrl && images.includes(v.imageUrl) ? v.imageUrl : null,
      stockQuantity: Number(r.stocks[v.id]),
    })),
  };
}

const TH = "border-b border-r border-line px-3 py-2 text-left font-medium last:border-r-0";
const TD = "border-b border-r border-line p-0 last:border-r-0";
const CHANGED = "bg-accent-soft";

/**
 * Chỉnh sửa hàng loạt các sản phẩm đã chọn trong một bảng: tên, trạng thái, danh mục, nguyên liệu, giá bán
 * và tồn kho từng biến thể. Lưu = gọi lần lượt Product/Update cho từng sản phẩm đã sửa
 * (chỉ đổi trạng thái thì gọi Product/SetActive như nút Ẩn / Hiện).
 */
export function ProductBulkEditor({ ids, onClose, onSaved }: { ids: number[]; onClose: () => void; onSaved: () => void }) {
  const { categories, materials } = useCatalog();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  // Giá trị đã lưu gần nhất của từng dòng (để biết ô nào đã sửa và để "Bỏ" trả lại).
  const [base, setBase] = useState<Record<number, Row>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const idKey = ids.join(",");

  useEffect(() => {
    let alive = true;
    setRows(null);
    void Promise.allSettled(ids.map((id) => productApi.get(id))).then((results) => {
      if (!alive) return;
      const loaded: Row[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") loaded.push(toRow(r.value));
        else failed.push(`#${ids[i]}: ${toApiError(r.reason).message}`);
      });
      setRows(loaded);
      setBase(Object.fromEntries(loaded.map((r) => [r.id, r])));
      setMissing(failed);
      setErrors({});
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const patch = (id: number, change: Partial<Row>) => {
    setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
    setErrors((e) => (e[id] ? { ...e, [id]: "" } : e));
  };
  const setStock = (r: Row, variantId: number, value: string) => patch(r.id, { stocks: { ...r.stocks, [variantId]: digits(value) } });

  const dirtyRows = (rows ?? []).filter((r) => isDirty(r, base[r.id]));
  const saving = progress !== null;

  const save = async () => {
    if (!dirtyRows.length || saving) return;
    // Kiểm tra hết trước; còn dòng chưa hợp lệ thì chưa gửi gì để không lưu dở dang.
    const invalid: Record<number, string> = {};
    for (const r of dirtyRows) {
      const onlyStatus = changedFields(r, base[r.id]).join() === "isActive" && !anyStockChanged(r, base[r.id]);
      const problem = onlyStatus ? null : validate(r);
      if (problem) invalid[r.id] = problem;
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) return notify(`${Object.keys(invalid).length} sản phẩm chưa hợp lệ — sửa các dòng báo đỏ rồi lưu lại`);

    setProgress({ done: 0, total: dirtyRows.length });
    const failed: Record<number, string> = {};
    let ok = 0;
    for (const r of dirtyRows) {
      try {
        const onlyStatus = changedFields(r, base[r.id]).join() === "isActive" && !anyStockChanged(r, base[r.id]);
        let next: Row;
        if (onlyStatus) {
          await productApi.setActive(r.id, r.isActive);
          next = { ...r, detail: { ...r.detail, isActive: r.isActive } };
        } else {
          // Đọc lại sản phẩm ngay trước khi lưu rồi chỉ thay các ô đã sửa, để không ghi đè thay đổi phát sinh từ lúc mở bảng.
          const merged = mergeIntoFresh(r, base[r.id], await productApi.get(r.id));
          const problem = validate(merged);
          if (problem) throw new Error(problem);
          const updated = await productApi.update(toInput(merged));
          // Máy chủ trả sản phẩm sau khi lưu → lấy làm dữ liệu gốc mới của dòng.
          next = updated ? toRow(updated) : { ...merged, name: merged.name.trim() };
        }
        ok++;
        setRows((rs) => rs && rs.map((x) => (x.id === r.id ? next : x)));
        setBase((b) => ({ ...b, [r.id]: next }));
      } catch (e) {
        failed[r.id] = toApiError(e).fullMessage;
      }
      setProgress({ done: ok + Object.keys(failed).length, total: dirtyRows.length });
    }
    setProgress(null);
    setErrors(failed);
    if (ok) onSaved();
    const bad = Object.keys(failed).length;
    notify(bad ? `${ok ? `Đã lưu ${ok} sản phẩm. ` : ""}${bad} sản phẩm chưa lưu được — xem dòng báo đỏ` : `Đã lưu ${ok} sản phẩm`);
  };

  const leave = async () => {
    // Đang lưu thì chờ xong mới rời trang, để kết quả và lỗi của từng sản phẩm còn được báo lại.
    if (saving) return notify("Đang lưu — chờ lưu xong rồi hãy rời trang");
    if (dirtyRows.length && !(await confirm({ ...LEAVE_CONFIRM, body: `Thay đổi chưa lưu của ${dirtyRows.length} sản phẩm sẽ bị bỏ.` }))) return;
    onClose();
  };
  const discard = async () => {
    if (!(await confirm({ title: "Bỏ mọi thay đổi chưa lưu?", body: "Các ô đã sửa sẽ trở về giá trị đã lưu gần nhất.", okLabel: "Bỏ thay đổi", danger: true }))) return;
    setRows((rs) => rs && rs.map((r) => base[r.id]));
    setErrors({});
  };

  return (
    <DetailPage
      wide
      parent="Sản phẩm"
      title={rows ? `Đang sửa ${rows.length} sản phẩm` : "Chỉnh sửa hàng loạt"}
      meta="Sửa trực tiếp trong bảng rồi bấm Lưu. Ô đã sửa được tô xanh nhạt; ảnh, mô tả và danh sách biến thể sửa ở trang của từng sản phẩm."
      onBack={leave}
      backLabel="Quay lại danh sách sản phẩm"
    >
      {dirtyRows.length > 0 && (
        <SaveBar
          note={progress ? `Đang lưu ${progress.done}/${progress.total}…` : `${dirtyRows.length} sản phẩm đã sửa`}
          onDiscard={discard}
          onSave={save}
          saving={saving}
        />
      )}

      {missing.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="whitespace-pre-line">
            Không mở được {missing.length} sản phẩm (có thể đã bị xóa):{"\n"}
            {missing.join("\n")}
          </p>
        </div>
      )}

      {!rows ? (
        <div className="hsv-card">
          <LoadingRows rows={Math.min(ids.length, 8)} />
        </div>
      ) : rows.length === 0 ? (
        <div className="hsv-card">
          <EmptyState title="Không có sản phẩm nào để sửa" body="Quay lại danh sách và chọn lại các sản phẩm cần sửa." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[1040px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface text-xs text-[#4a4a4a]">
                <th className={cn(TH, "w-[30%]")}>Tên sản phẩm</th>
                <th className={cn(TH, "w-[130px]")}>Trạng thái</th>
                <th className={TH}>Danh mục</th>
                <th className={TH}>Nguyên liệu</th>
                <th className={cn(TH, "w-[150px] text-right")}>Giá bán (₫)</th>
                <th className={cn(TH, "w-[130px] text-right")}>Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = base[r.id];
                const variants = r.detail.variants ?? [];
                const single = variants.length === 1 ? variants[0] : null;
                const open = !collapsed[r.id];
                const total = variants.reduce((s, v) => s + (Number(r.stocks[v.id]) || 0), 0);
                // Danh mục hiện tại có thể đã bị xóa mềm → vẫn hiện để không mất lựa chọn.
                const catOptions = categories.some((c) => c.id === r.detail.categoryId)
                  ? categories
                  : [...categories, { id: r.detail.categoryId, name: r.detail.categoryName, description: null, productCount: 0, creationTime: "" }];
                // Nguyên liệu hiện tại đã bị xóa mềm → vẫn hiện đúng tên thay vì để ô chọn hiển thị nhầm nguyên liệu đầu tiên.
                const curMaterial = r.detail.material;
                const matOptions =
                  curMaterial && r.materialId === curMaterial.id && !materials.some((m) => m.id === curMaterial.id) ? [...materials, curMaterial] : materials;
                return (
                  <Fragment key={r.id}>
                    <tr className={cn(errors[r.id] && "bg-danger-soft/40")}>
                      <td className={cn(TD, fieldChanged(r, b, "name") && CHANGED)}>
                        <div className="flex items-center">
                          <ProductImage src={r.detail.mainImage} seed={r.id} className="ml-2 h-6 w-6 shrink-0 rounded-md border border-line" />
                          <input
                            value={r.name}
                            onChange={(e) => patch(r.id, { name: e.target.value })}
                            disabled={saving}
                            aria-label={`Tên sản phẩm ${b.name}`}
                            className="hsv-cell min-w-0 flex-1 px-2 font-medium"
                          />
                          {!single && variants.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCollapsed((c) => ({ ...c, [r.id]: !c[r.id] }))}
                              aria-expanded={open}
                              aria-label={`${open ? "Thu gọn" : "Mở"} biến thể của ${b.name}`}
                              className="hsv-btn-icon mr-1"
                            >
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={cn(TD, fieldChanged(r, b, "isActive") && CHANGED)}>
                        {/* Chữ của ô chọn được ẩn đi, phía trên hiện nhãn màu của trạng thái đang chọn. */}
                        <div className="relative">
                          <select
                            value={r.isActive ? "on" : "off"}
                            onChange={(e) => patch(r.id, { isActive: e.target.value === "on" })}
                            disabled={saving}
                            aria-label={`Trạng thái của ${b.name}`}
                            className="hsv-cell text-transparent"
                          >
                            <option value="on" className="text-ink">
                              Đang bán
                            </option>
                            <option value="off" className="text-ink">
                              Tạm ẩn
                            </option>
                          </select>
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                            <Badge tone={r.isActive ? "ok" : "neutral"}>{r.isActive ? "Đang bán" : "Tạm ẩn"}</Badge>
                          </span>
                        </div>
                      </td>
                      <td className={cn(TD, fieldChanged(r, b, "categoryId") && CHANGED)}>
                        <select
                          value={r.categoryId}
                          onChange={(e) => patch(r.id, { categoryId: Number(e.target.value) })}
                          disabled={saving}
                          aria-label={`Danh mục của ${b.name}`}
                          className="hsv-cell"
                        >
                          {catOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={cn(TD, fieldChanged(r, b, "materialId") && CHANGED)}>
                        <select
                          value={r.materialId ?? ""}
                          onChange={(e) => patch(r.id, { materialId: e.target.value ? Number(e.target.value) : null })}
                          disabled={saving}
                          aria-label={`Nguyên liệu của ${b.name}`}
                          className="hsv-cell"
                        >
                          {r.materialId === null && <option value="">— Chọn nguyên liệu —</option>}
                          {matOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={cn(TD, fieldChanged(r, b, "price") && CHANGED)}>
                        <input
                          value={r.price}
                          inputMode="numeric"
                          onChange={(e) => patch(r.id, { price: digits(e.target.value) })}
                          disabled={saving}
                          aria-label={`Giá bán của ${b.name}`}
                          title={r.price ? formatVND(Number(r.price)) : undefined}
                          className="hsv-cell text-right"
                        />
                      </td>
                      <td className={cn(TD, single && stockChanged(r, b, single.id) && CHANGED)}>
                        {single ? (
                          <input
                            value={r.stocks[single.id] ?? ""}
                            inputMode="numeric"
                            onChange={(e) => setStock(r, single.id, e.target.value)}
                            disabled={saving}
                            aria-label={`Tồn kho của ${b.name}`}
                            className={cn("hsv-cell text-right", Number(r.stocks[single.id]) <= LOW_STOCK_THRESHOLD && "text-warn", r.stocks[single.id] === "0" && "text-danger")}
                          />
                        ) : (
                          <p className="px-3 text-right text-muted2" title="Tổng tồn kho của các biến thể">
                            {total}
                          </p>
                        )}
                      </td>
                    </tr>
                    {!single &&
                      open &&
                      variants.map((v) => (
                        <tr key={v.id} className="bg-surface-2">
                          <td className={cn(TD, "py-0 pl-12 pr-3 text-ink-2")}>{v.displayName || "Mặc định"}</td>
                          <td className={cn(TD, "px-3 text-faint")}>—</td>
                          <td className={cn(TD, "px-3 text-faint")}>—</td>
                          <td className={cn(TD, "px-3 text-faint")}>—</td>
                          <td className={cn(TD, "px-3 text-right text-faint")}>—</td>
                          <td className={cn(TD, stockChanged(r, b, v.id) && CHANGED)}>
                            <input
                              value={r.stocks[v.id] ?? ""}
                              inputMode="numeric"
                              onChange={(e) => setStock(r, v.id, e.target.value)}
                              disabled={saving}
                              aria-label={`Tồn kho của ${b.name} — ${v.displayName || "Mặc định"}`}
                              className={cn("hsv-cell text-right", Number(r.stocks[v.id]) <= LOW_STOCK_THRESHOLD && "text-warn", r.stocks[v.id] === "0" && "text-danger")}
                            />
                          </td>
                        </tr>
                      ))}
                    {errors[r.id] && (
                      <tr>
                        <td colSpan={6} className="border-b border-line bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
                          <span className="flex items-start gap-1.5">
                            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-pre-line">
                              {b.name}: {errors[r.id]}
                            </span>
                          </span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DetailPage>
  );
}
