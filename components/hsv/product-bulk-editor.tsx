"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Badge, DetailPage, EmptyState, FormAlert, LoadingRows, notify, ProductImage, SaveBar } from "@/components/hsv/ui";
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

/**
 * Kiểm tra trước khi gửi — cùng thông báo với form sản phẩm. Biến thể chưa chọn ảnh không chặn nữa: khi lưu sẽ được gán
 * ảnh đại diện (xem toInput); chỉ sản phẩm hoàn toàn không có ảnh mới phải sang trang sản phẩm bổ sung.
 */
function validate(r: Row): string | null {
  if (!r.name.trim()) return "Vui lòng nhập tên sản phẩm";
  if (!r.materialId) return "Chọn nguyên liệu";
  if (!parseInt(r.price.replace(/\D/g, ""), 10)) return "Giá bán phải lớn hơn 0";
  if (Object.values(r.stocks).some((s) => s === "" || Number(s) < 0)) return "Mỗi biến thể cần số tồn kho ≥ 0";
  if (!imagesOf(r.detail).length) return "Sản phẩm chưa có ảnh — mở trang sản phẩm để tải ảnh lên rồi mới sửa được ở đây";
  return null;
}

/** Số biến thể chưa chọn ảnh (sẽ được gán ảnh đại diện khi lưu). */
const variantsWithoutImage = (d: ProductDetail) => {
  const images = imagesOf(d);
  return (d.variants ?? []).filter((v) => !(v.imageUrl && images.includes(v.imageUrl))).length;
};

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
      // Backend bắt buộc mỗi biến thể có 1 ảnh của sản phẩm. Biến thể chưa chọn ảnh (sản phẩm tạo trước khi có quy định này)
      // được gán ảnh đại diện — đúng ảnh cửa hàng vẫn đang hiển thị cho biến thể đó, nên khách không thấy gì thay đổi.
      imageUrl: v.imageUrl && images.includes(v.imageUrl) ? v.imageUrl : images[0],
      stockQuantity: Number(r.stocks[v.id]),
    })),
  };
}

/** Lưới kiểu trang tính: kẻ ô mảnh, đầu bảng xám nhạt dính trên cùng, cột tên dính bên trái khi cuộn ngang. */
const GRID = "border-b border-r border-[#ebebeb]";
const TH = `${GRID} sticky top-0 z-10 h-9 bg-[#f7f7f7] px-3 text-left text-xs font-medium text-[#4a4a4a] whitespace-nowrap`;
const TD = `${GRID} h-[34px] bg-white p-0`;
/** Cột tên sản phẩm dính bên trái khi cuộn ngang. */
const STICKY = "sticky left-0 z-[5]";
/** Ô không áp dụng cho dòng biến thể: gạch mờ như trang tính. */
const Dash = ({ right }: { right?: boolean }) => (
  <span className={cn("flex px-3", right && "justify-end")}>
    <span className="h-0.5 w-3.5 rounded-full bg-[#d4d4d4]" />
  </span>
);
/** "380000" → "380.000" (ô giá / tồn kho hiển thị có dấu chấm; khi sửa vẫn chỉ lấy chữ số). */
const grouped = (s: string) => (s === "" ? "" : Number(s).toLocaleString("vi-VN"));

/** Gọi `fn` cho từng phần tử, tối đa `limit` lượt cùng lúc (mở nhiều sản phẩm không dồn hàng chục yêu cầu một lúc). */
async function settleAll<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>) {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
/** Ô đã sửa (chưa lưu): nền vàng nhạt, để không lẫn với vùng đang chọn (xanh). */
const CHANGED = "bg-[#fff5d1]";

/** Cột sửa được. "stock" là tồn kho của một biến thể (sản phẩm một biến thể: ngay dòng sản phẩm). */
type Col = Field | "stock";
type Cell = { col: Col; productId: number; variantId?: number };
const keyOf = (c: Cell) => `${c.col}:${c.productId}:${c.variantId ?? ""}`;

/** Ghi một giá trị (dạng chữ như trong ô) vào đúng trường của một dòng. */
function assign(r: Row, c: Cell, raw: string): Row {
  switch (c.col) {
    case "name":
      return { ...r, name: raw };
    case "isActive":
      return { ...r, isActive: raw === "on" };
    case "categoryId":
      return { ...r, categoryId: Number(raw) };
    case "materialId":
      return { ...r, materialId: raw ? Number(raw) : null };
    case "price":
      return { ...r, price: digits(raw) };
    case "stock":
      return { ...r, stocks: { ...r.stocks, [c.variantId!]: digits(raw) } };
  }
}

/**
 * Chỉnh sửa hàng loạt các sản phẩm đã chọn trong một bảng: tên, trạng thái, danh mục, nguyên liệu, giá bán
 * và tồn kho từng biến thể. Lưu = gọi lần lượt Product/Update cho từng sản phẩm đã sửa
 * (chỉ đổi trạng thái thì gọi Product/SetActive như nút Ẩn / Hiện).
 *
 * Như Excel: kéo chuột dọc một cột (hoặc Shift + bấm, Shift + ↑/↓) để bôi đen nhiều ô, rồi sửa một ô trong vùng đó
 * → mọi ô đã bôi đen nhận cùng giá trị.
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
  // Vùng đang bôi đen: luôn nằm trong một cột, từ ô neo (anchor) tới ô đang kéo tới (focus).
  const [sel, setSel] = useState<{ col: Col; anchor: string; focus: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  // Ô chữ / số vừa nhận focus bằng chuột (để nhả chuột không làm mất phần chữ đã bôi đen).
  const justFocused = useRef(false);
  const idKey = ids.join(",");

  useEffect(() => {
    let alive = true;
    setRows(null);
    void settleAll(ids, 6, (id) => productApi.get(id)).then((results) => {
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

  // Thả chuột ở bất kỳ đâu → kết thúc kéo. Bấm ra ngoài bảng → bỏ vùng đang bôi đen.
  useEffect(() => {
    const onUp = () => setDragging(false);
    const onDown = (e: MouseEvent) => {
      if (!tableRef.current?.contains(e.target as Node)) setSel(null);
    };
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  /** Các ô của từng cột theo đúng thứ tự đang hiển thị (biến thể đang thu gọn thì không tính). */
  const columns = useMemo(() => {
    const m: Record<Col, Cell[]> = { name: [], isActive: [], categoryId: [], materialId: [], price: [], stock: [] };
    for (const r of rows ?? []) {
      for (const f of FIELDS) m[f].push({ col: f, productId: r.id });
      const vs = r.detail.variants ?? [];
      if (vs.length === 1) m.stock.push({ col: "stock", productId: r.id, variantId: vs[0].id });
      else if (!collapsed[r.id]) for (const v of vs) m.stock.push({ col: "stock", productId: r.id, variantId: v.id });
    }
    return m;
  }, [rows, collapsed]);

  const range = useMemo(() => {
    if (!sel) return [] as Cell[];
    const list = columns[sel.col];
    const a = list.findIndex((c) => keyOf(c) === sel.anchor);
    const f = list.findIndex((c) => keyOf(c) === sel.focus);
    if (a < 0) return [];
    return f < 0 ? [list[a]] : list.slice(Math.min(a, f), Math.max(a, f) + 1);
  }, [sel, columns]);
  const rangeKeys = useMemo(() => new Set(range.map(keyOf)), [range]);
  const multi = range.length > 1;

  /** Sửa một ô; nếu ô nằm trong vùng đang bôi đen (≥ 2 ô) thì mọi ô trong vùng nhận cùng giá trị. */
  const setCell = (cell: Cell, raw: string) => {
    const targets = multi && rangeKeys.has(keyOf(cell)) ? range : [cell];
    const touched = new Set(targets.map((t) => t.productId));
    setRows((rs) => rs && rs.map((r) => (touched.has(r.id) ? targets.filter((t) => t.productId === r.id).reduce((acc, t) => assign(acc, t, raw), r) : r)));
    setErrors((e) => {
      if (![...touched].some((id) => e[id])) return e;
      const next = { ...e };
      for (const id of touched) delete next[id];
      return next;
    });
  };

  const focusCell = (key: string) => {
    const el = tableRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-cell="${key}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  };

  /** Chuột / bàn phím trên một ô: bấm = chọn ô, kéo = bôi đen dọc cột, Shift + bấm = nới vùng tới ô này. */
  const cellProps = (cell: Cell) => {
    const key = keyOf(cell);
    return {
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button !== 0 || progress) return;
        // Ô chọn (select) mở danh sách ngay khi nhấn chuột → chặn lại để kéo được; bấm rồi thả tại chỗ thì mở danh sách sau (onMouseUp).
        if (e.target instanceof HTMLSelectElement) {
          e.preventDefault();
          e.target.focus();
        }
        if (e.shiftKey && sel?.col === cell.col) {
          e.preventDefault();
          setSel({ ...sel, focus: key });
          return;
        }
        setSel({ col: cell.col, anchor: key, focus: key });
        setDragging(true);
      },
      onMouseEnter: () => {
        if (dragging) setSel((s) => (s && s.col === cell.col ? { ...s, focus: key } : s));
      },
      onMouseUp: (e: React.MouseEvent) => {
        // Vừa bấm vào ô chữ / số: giữ nguyên phần chữ đã bôi đen (onFocus) để gõ là đè cả ô như Excel.
        if (e.target instanceof HTMLInputElement && justFocused.current) e.preventDefault();
        justFocused.current = false;
        // Bấm rồi thả trên đúng ô chọn đã nhấn (không kéo) → mở danh sách như bình thường.
        if (e.target instanceof HTMLSelectElement && sel?.anchor === key && sel.focus === key && !e.shiftKey) {
          try {
            e.target.showPicker();
          } catch {
            /* trình duyệt không hỗ trợ: vẫn chọn được bằng bàn phím (↑/↓, Alt + ↓) */
          }
        }
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        const list = columns[cell.col];
        const i = list.findIndex((c) => keyOf(c) === key);
        if (e.key === "Escape") return setSel(null);
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const isSelect = e.target instanceof HTMLSelectElement;
        // ↑/↓ trong ô chọn dùng để đổi giá trị; chỉ Shift + ↑/↓ mới nới vùng.
        if (isSelect && !e.shiftKey) return;
        e.preventDefault();
        if (e.shiftKey) {
          // Nới vùng từ ô neo theo hướng mũi tên (vùng vẫn trong cùng cột).
          const s = sel && sel.col === cell.col ? sel : { col: cell.col, anchor: key, focus: key };
          const fi = list.findIndex((c) => keyOf(c) === s.focus);
          const next = list[Math.min(list.length - 1, Math.max(0, fi + (e.key === "ArrowDown" ? 1 : -1)))];
          setSel({ ...s, focus: keyOf(next) });
          return;
        }
        // ↑/↓ trong ô chữ / số: sang ô trên / dưới cùng cột như Excel.
        const next = list[i + (e.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        setSel({ col: cell.col, anchor: keyOf(next), focus: keyOf(next) });
        focusCell(keyOf(next));
      },
      onFocus: (e: React.FocusEvent) => {
        // Như Excel: vào một ô thì bôi đen cả nội dung — gõ là thay cả ô; bấm đúp để đặt con trỏ sửa giữa chừng.
        if (e.target instanceof HTMLInputElement) {
          e.target.select();
          justFocused.current = true;
        }
        // Đi tới ô bằng Tab / chuột: nếu ô không nằm trong vùng đang bôi đen thì chọn riêng ô đó.
        if (!rangeKeys.has(key)) setSel({ col: cell.col, anchor: key, focus: key });
      },
      "data-cell": key,
    };
  };

  /** Viền + nền xanh cho vùng đang bôi đen (≥ 2 ô); ô neo đậm hơn. */
  const selStyle = (cell: Cell): React.CSSProperties | undefined => {
    if (!multi) return undefined;
    const i = range.findIndex((c) => keyOf(c) === keyOf(cell));
    if (i < 0) return undefined;
    const edges = ["inset 2px 0 0 #005bd3", "inset -2px 0 0 #005bd3"];
    if (i === 0) edges.push("inset 0 2px 0 #005bd3");
    if (i === range.length - 1) edges.push("inset 0 -2px 0 #005bd3");
    return { boxShadow: edges.join(","), background: keyOf(cell) === sel?.anchor ? "#ffffff" : "#e0f0ff" };
  };
  const tdFor = (cell: Cell, changed: boolean, extra?: string) => ({
    className: cn(TD, changed && CHANGED, extra),
    style: selStyle(cell),
  });

  const dirtyRows = (rows ?? []).filter((r) => isDirty(r, base[r.id]));
  const noImageCount = (rows ?? []).filter((r) => variantsWithoutImage(r.detail) > 0).length;
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

    setSel(null);
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
      meta="Sửa trực tiếp trong bảng rồi bấm Lưu; ô đã sửa được tô vàng nhạt. Ảnh, mô tả và danh sách biến thể sửa ở trang của từng sản phẩm."
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

      {noImageCount > 0 && (
        <FormAlert
          tone="warn"
          message={`${noImageCount} sản phẩm có biến thể chưa chọn ảnh. Khi lưu, các biến thể này sẽ được gán ảnh đại diện của sản phẩm — đúng ảnh khách đang thấy trên cửa hàng. Muốn mỗi biến thể có ảnh riêng thì chọn ở trang của từng sản phẩm.`}
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
        <>
          <p role="status" className="-mb-2 flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
            {multi ? (
              <>
                <span className="font-semibold text-info">Đã bôi đen {range.length} ô</span>
                <span className="text-muted2">— sửa một ô trong vùng thì cả {range.length} ô nhận cùng giá trị. Esc hoặc bấm ra ngoài bảng để bỏ chọn.</span>
              </>
            ) : (
              <span className="text-muted2">Như Excel: kéo chuột dọc một cột (hoặc Shift + bấm, Shift + ↑/↓) để bôi đen nhiều ô, rồi sửa ô đầu — các ô đã bôi đen nhận cùng giá trị.</span>
            )}
          </p>
          <div className="max-h-[calc(100vh-210px)] min-h-[240px] overflow-auto rounded-xl border border-[#e3e3e3] bg-white">
            <table
              ref={tableRef}
              // Chữ trong ô đang được bôi đen sẵn: chặn kiểu "kéo–thả chữ" của trình duyệt để kéo chuột là bôi đen nhiều ô như Excel.
              onDragStart={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              className={cn("w-full min-w-[1080px] border-separate border-spacing-0 text-[13px]", dragging && "select-none")}
            >
              <thead>
                <tr>
                  <th className={cn(TH, STICKY, "z-20 w-[30%]")}>Tên sản phẩm</th>
                  <th className={cn(TH, "w-[150px]")}>Trạng thái</th>
                  <th className={cn(TH, "w-[200px]")}>Danh mục</th>
                  <th className={cn(TH, "w-[190px]")}>Nguyên liệu</th>
                  <th className={cn(TH, "w-[150px] text-right")}>
                    Giá bán <span className="ml-3 font-normal text-faint">VND</span>
                  </th>
                  <th className={cn(TH, "w-[140px] border-r-0 text-right")}>Tồn kho</th>
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
                  const c = (col: Col, variantId?: number): Cell => ({ col, productId: r.id, variantId });
                  const stockInput = (variantId: number, label: string) => (
                    <input
                      {...cellProps(c("stock", variantId))}
                      value={grouped(r.stocks[variantId] ?? "")}
                      inputMode="numeric"
                      onChange={(e) => setCell(c("stock", variantId), e.target.value)}
                      disabled={saving}
                      aria-label={label}
                      className={cn("hsv-cell text-right", Number(r.stocks[variantId]) <= LOW_STOCK_THRESHOLD && "text-warn", r.stocks[variantId] === "0" && "text-danger")}
                    />
                  );
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn(errors[r.id] && "bg-danger-soft/40")}>
                        <td {...tdFor(c("name"), fieldChanged(r, b, "name"), STICKY)}>
                          <div className="flex items-center">
                            <ProductImage src={r.detail.mainImage} seed={r.id} className="ml-2.5 h-6 w-6 shrink-0 rounded-md border border-[#e3e3e3]" />
                            <input
                              {...cellProps(c("name"))}
                              value={r.name}
                              onChange={(e) => setCell(c("name"), e.target.value)}
                              disabled={saving}
                              aria-label={`Tên sản phẩm ${b.name}`}
                              className="hsv-cell min-w-0 flex-1 px-2"
                            />
                            {!single && variants.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setCollapsed((s) => ({ ...s, [r.id]: !s[r.id] }))}
                                aria-expanded={open}
                                aria-label={`${open ? "Thu gọn" : "Mở"} biến thể của ${b.name}`}
                                className="hsv-btn-icon mr-1"
                              >
                                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td {...tdFor(c("isActive"), fieldChanged(r, b, "isActive"))}>
                          {/* Chữ của ô chọn được ẩn đi, phía trên hiện nhãn màu của trạng thái đang chọn. */}
                          <div className="relative">
                            <select
                              {...cellProps(c("isActive"))}
                              value={r.isActive ? "on" : "off"}
                              onChange={(e) => setCell(c("isActive"), e.target.value)}
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
                        <td {...tdFor(c("categoryId"), fieldChanged(r, b, "categoryId"))}>
                          <div className="relative">
                            <select
                              {...cellProps(c("categoryId"))}
                              value={r.categoryId}
                              onChange={(e) => setCell(c("categoryId"), e.target.value)}
                              disabled={saving}
                              aria-label={`Danh mục của ${b.name}`}
                              className="hsv-cell text-transparent"
                            >
                              {catOptions.map((o) => (
                                <option key={o.id} value={o.id} className="text-ink">
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute left-2.5 right-8 top-1/2 flex -translate-y-1/2">
                              <span className="truncate rounded-md border border-dashed border-[#b9a6f2] bg-[#efe9ff] px-1.5 py-px text-[13px] text-[#3d2196]">
                                {catOptions.find((o) => o.id === r.categoryId)?.name ?? "—"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td {...tdFor(c("materialId"), fieldChanged(r, b, "materialId"))}>
                          <select
                            {...cellProps(c("materialId"))}
                            value={r.materialId ?? ""}
                            onChange={(e) => setCell(c("materialId"), e.target.value)}
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
                        <td {...tdFor(c("price"), fieldChanged(r, b, "price"))}>
                          <input
                            {...cellProps(c("price"))}
                            value={grouped(r.price)}
                            inputMode="numeric"
                            onChange={(e) => setCell(c("price"), e.target.value)}
                            disabled={saving}
                            aria-label={`Giá bán của ${b.name}`}
                            title={r.price ? formatVND(Number(r.price)) : undefined}
                            className="hsv-cell text-right"
                          />
                        </td>
                        {single ? (
                          <td {...tdFor(c("stock", single.id), stockChanged(r, b, single.id))}>{stockInput(single.id, `Tồn kho của ${b.name}`)}</td>
                        ) : (
                          <td className={TD} title={`Tổng tồn kho của các biến thể: ${total}`}>
                            {open ? <Dash right /> : <p className="px-3 text-right text-muted2">{total}</p>}
                          </td>
                        )}
                      </tr>
                      {!single &&
                        open &&
                        variants.map((v) => (
                          <tr key={v.id}>
                            <td className={cn(TD, STICKY, "py-0 pl-[52px] pr-3 text-ink-2")}>{v.displayName || "Mặc định"}</td>
                            <td className={TD}>
                              <Dash />
                            </td>
                            <td className={TD}>
                              <Dash />
                            </td>
                            <td className={TD}>
                              <Dash />
                            </td>
                            <td className={TD}>
                              <Dash right />
                            </td>
                            <td {...tdFor(c("stock", v.id), stockChanged(r, b, v.id))}>
                              {stockInput(v.id, `Tồn kho của ${b.name} — ${v.displayName || "Mặc định"}`)}
                            </td>
                          </tr>
                        ))}
                      {errors[r.id] && (
                        <tr>
                          <td colSpan={6} className={cn(GRID, "bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger")}>
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
        </>
      )}
    </DetailPage>
  );
}
