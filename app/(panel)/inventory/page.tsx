"use client";

import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Chip, Drawer, ErrorBox, FieldError, FormAlert, LoadingRows, notify, Pager } from "@/components/hsv/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { toApiError } from "@/lib/api/http";
import type { StockReceipt, VariantCost } from "@/lib/api/types";
import { formatDateTime, formatVND } from "@/lib/hsv/format";
import { inventorySource, movingAverage } from "@/lib/hsv/mock-cost";
import type { FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const COST_COLS = "grid-cols-[minmax(0,2fr)_90px_110px_120px_130px_110px_120px]";
const RECEIPT_COLS = "grid-cols-[130px_minmax(0,2fr)_80px_110px_120px_minmax(0,1.2fr)_120px]";

const parseNumber = (v: string) => Number(v.replace(/[.,\s]/g, ""));

type ReceiptKey = "variant" | "quantity" | "unitCost";

/** Nhập hàng (variant có sẵn, hoặc chọn trong drawer khi bấm nút ở đầu trang) hoặc sửa phiếu mới nhất (receipt). */
function ReceiptDrawer({
  variant: initialVariant,
  receipt,
  onClose,
  onSaved,
}: {
  variant?: VariantCost;
  receipt?: StockReceipt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const picking = !initialVariant && !receipt;
  const [pickedId, setPickedId] = useState("");
  const [quantity, setQuantity] = useState(receipt ? String(receipt.quantity) : "");
  const [unitCost, setUnitCost] = useState(receipt ? String(receipt.unitCost) : "");
  const [note, setNote] = useState(receipt?.note ?? "");
  const [errors, setErrors] = useState<FieldErrors<ReceiptKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const options = useApi(() => inventorySource.getVariantCosts({ maxResultCount: 100 }), [], picking);

  const variant = initialVariant ?? options.data?.items.find((v) => String(v.productVariantId) === pickedId);
  const productName = variant?.productName ?? receipt?.productName ?? "";
  const variantName = variant?.variantName ?? receipt?.variantName ?? "";
  const qty = parseNumber(quantity);
  const cost = parseNumber(unitCost);
  const valid = Number.isInteger(qty) && qty > 0 && Number.isFinite(cost) && cost >= 0 && unitCost.trim() !== "";
  const preview = variant && valid ? movingAverage(variant.stockQuantity, variant.averageCost, qty, cost) : null;

  const save = async () => {
    const e: FieldErrors<ReceiptKey> = {};
    if (!receipt && !variant) e.variant = "Chọn sản phẩm cần nhập";
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) e.quantity = "Số lượng nhập phải từ 1 đến 1.000.000";
    if (unitCost.trim() === "" || !Number.isFinite(cost) || cost < 0 || cost > 999_999_999) e.unitCost = "Giá nhập không hợp lệ";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      if (receipt) {
        await inventorySource.update({ id: receipt.id, quantity: qty, unitCost: cost, note: note.trim() || undefined });
        notify("Đã sửa phiếu nhập, giá vốn đã được tính lại");
      } else if (variant) {
        await inventorySource.create({ productVariantId: variant.productVariantId, quantity: qty, unitCost: cost, note: note.trim() || undefined });
        notify(`Đã nhập ${qty} sản phẩm`);
      }
      onSaved();
      onClose();
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors() as FieldErrors<ReceiptKey>;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      width={460}
      onClose={onClose}
      header={<p className="font-serif text-[22px]">{receipt ? "Sửa phiếu nhập" : "Nhập hàng"}</p>}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <button onClick={onClose} className="px-[18px] py-[11px] text-sm">
            Hủy
          </button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-navy px-6 py-[11px] text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Đang lưu…" : receipt ? "Lưu thay đổi" : "Nhập hàng"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {picking && (
          <div>
            <label htmlFor="sr-variant" className="hsv-label">Sản phẩm / biến thể *</label>
            <select
              id="sr-variant"
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              disabled={!options.data}
              className={cn("hsv-input h-11 text-sm", errors.variant && "hsv-input-error")}
            >
              <option value="">{options.data ? "— Chọn sản phẩm —" : options.error ? "Không tải được danh sách" : "Đang tải…"}</option>
              {options.data?.items.map((v) => (
                <option key={v.productVariantId} value={v.productVariantId}>
                  {v.productName} — {v.variantName} (tồn {v.stockQuantity})
                </option>
              ))}
            </select>
            <FieldError message={errors.variant} />
          </div>
        )}
        {(variant || receipt) && (
          <div className="rounded-lg bg-surface px-4 py-3 text-[13.5px]">
            <p className="font-semibold">{productName}</p>
            <p className="text-muted2">{variantName}</p>
            {variant && (
              <p className="mt-1.5 text-[12.5px] text-subtle">
                Tồn hiện tại: {variant.stockQuantity} · Giá vốn hiện tại: {variant.averageCost === null ? "chưa có" : formatVND(Math.round(variant.averageCost))} ·
                Giá bán: {formatVND(variant.salePrice)}
              </p>
            )}
          </div>
        )}
        <FormAlert message={formError} />
        <div>
          <label htmlFor="sr-qty" className="hsv-label">Số lượng nhập *</label>
          <input
            id="sr-qty"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="VD 20"
            className={cn("hsv-input h-11 text-sm", errors.quantity && "hsv-input-error")}
          />
          <FieldError message={errors.quantity} />
        </div>
        <div>
          <label htmlFor="sr-cost" className="hsv-label">Giá nhập / sản phẩm (VND) *</label>
          <input
            id="sr-cost"
            inputMode="numeric"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="VD 300000"
            className={cn("hsv-input h-11 text-sm", errors.unitCost && "hsv-input-error")}
          />
          <FieldError message={errors.unitCost} />
        </div>
        <div>
          <label htmlFor="sr-note" className="hsv-label">Ghi chú</label>
          <input
            id="sr-note"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: nhập từ làng nghề Thụy Ứng"
            className="hsv-input h-11 text-sm"
          />
        </div>
        {valid && (
          <div className="rounded-lg border border-line px-4 py-3 text-[13px]">
            <p>
              Thành tiền: <span className="font-semibold">{formatVND(qty * cost)}</span>
            </p>
            {preview !== null && variant && (
              <>
                <p className="mt-1">
                  Giá vốn sau khi nhập: <span className="font-semibold">{formatVND(Math.round(preview))}</span>
                </p>
                <p className="mt-1">
                  Lãi / sản phẩm với giá bán hiện tại:{" "}
                  <span className={cn("font-semibold", variant.salePrice - preview < 0 ? "text-danger" : "text-ok")}>
                    {formatVND(Math.round(variant.salePrice - preview))}
                  </span>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

const SEARCH_CLASS = "mb-3.5 h-10 w-[300px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy";

function VariantCostsTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [page, setPage] = useState(1);
  const [receiving, setReceiving] = useState<VariantCost | null>(null);
  const list = useApi(
    () => inventorySource.getVariantCosts({ keyword: keyword || undefined, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    [keyword, page, version]
  );
  const rows = list.data?.items ?? [];

  return (
    <div>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Tìm theo tên sản phẩm"
        aria-label="Tìm sản phẩm"
        className={SEARCH_CLASS}
      />
      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[900px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COST_COLS)}>
              <span>Sản phẩm / biến thể ({list.data?.totalCount ?? "…"})</span>
              <span className="text-right">Tồn kho</span>
              <span className="text-right">Giá bán</span>
              <span className="text-right">Giá vốn BQ</span>
              <span className="text-right">Giá trị tồn</span>
              <span className="text-right">Lãi / sp</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!list.data ? (
              <LoadingRows rows={6} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Không có biến thể phù hợp.</p>
            ) : (
              rows.map((v) => (
                <div key={v.productVariantId} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-[13px] text-[13px]", COST_COLS)}>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{v.productName}</p>
                    <p className="truncate text-xs text-subtle">
                      {v.variantName}
                      {v.lastReceiptTime && ` · nhập gần nhất ${formatDateTime(v.lastReceiptTime)}`}
                    </p>
                  </div>
                  <span className="text-right">{v.stockQuantity}</span>
                  <span className="text-right">{formatVND(v.salePrice)}</span>
                  <span className={cn("text-right", v.averageCost === null && "text-faint")}>
                    {v.averageCost === null ? "Chưa có" : formatVND(Math.round(v.averageCost))}
                  </span>
                  <span className="text-right">{v.stockValue === null ? "—" : formatVND(Math.round(v.stockValue))}</span>
                  <span className={cn("text-right font-semibold", v.unitProfit !== null && v.unitProfit < 0 ? "text-danger" : "text-ok")}>
                    {v.unitProfit === null ? "—" : formatVND(Math.round(v.unitProfit))}
                  </span>
                  <span className="text-right">
                    <button
                      onClick={() => setReceiving(v)}
                      className="rounded-lg border border-navy px-3 py-1.5 text-[12.5px] font-semibold text-navy hover:bg-navy hover:text-white"
                    >
                      + Nhập hàng
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      {receiving && <ReceiptDrawer variant={receiving} onClose={() => setReceiving(null)} onSaved={onChanged} />}
    </div>
  );
}

function ReceiptsTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StockReceipt | null>(null);
  const list = useApi(
    () => inventorySource.getAll({ keyword: keyword || undefined, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    [keyword, page, version]
  );
  const rows = list.data?.items ?? [];

  const onDelete = async (r: StockReceipt) => {
    const ok = await confirm({
      title: "Hủy phiếu nhập?",
      body: `${r.productName} (${r.variantName}): trừ lại ${r.quantity} sản phẩm khỏi tồn kho, giá vốn trở về như trước khi nhập.`,
      okLabel: "Hủy phiếu",
      danger: true,
    });
    if (!ok) return;
    try {
      await inventorySource.delete(r.id);
      notify("Đã hủy phiếu nhập");
      onChanged();
    } catch (e) {
      notify(toApiError(e).message);
    }
  };

  return (
    <div>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Tìm theo tên sản phẩm"
        aria-label="Tìm phiếu nhập"
        className={SEARCH_CLASS}
      />
      {list.error && !list.data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && list.data && "opacity-70")}>
          <div className="min-w-[960px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", RECEIPT_COLS)}>
              <span>Ngày nhập</span>
              <span>Sản phẩm / biến thể ({list.data?.totalCount ?? "…"})</span>
              <span className="text-right">Số lượng</span>
              <span className="text-right">Giá nhập</span>
              <span className="text-right">Thành tiền</span>
              <span>Ghi chú</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!list.data ? (
              <LoadingRows rows={6} />
            ) : rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-subtle">Chưa có phiếu nhập nào.</p>
            ) : (
              rows.map((r) => (
                <div key={r.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-[13px] text-[13px]", RECEIPT_COLS)}>
                  <span className="text-[12.5px] text-subtle">
                    {formatDateTime(r.creationTime)}
                    {r.lastModificationTime && <span className="block text-[11px] text-faint">đã sửa</span>}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{r.productName}</p>
                    <p className="truncate text-xs text-subtle">
                      {r.variantName}
                      {r.creatorUserName && ` · ${r.creatorUserName}`}
                    </p>
                  </div>
                  <span className="text-right">{r.quantity}</span>
                  <span className="text-right">{formatVND(r.unitCost)}</span>
                  <span className="text-right font-semibold">{formatVND(r.totalCost)}</span>
                  <span className="truncate text-xs text-subtle">{r.note || "—"}</span>
                  <div className="flex justify-end gap-3 whitespace-nowrap">
                    <button
                      onClick={() => setEditing(r)}
                      disabled={!r.canEdit}
                      title={r.canEdit ? undefined : "Chỉ sửa được phiếu nhập mới nhất của biến thể"}
                      className={cn("text-[13px] font-semibold text-navy", !r.canEdit && "cursor-not-allowed opacity-40")}
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      disabled={!r.canEdit}
                      title={r.canEdit ? undefined : "Chỉ hủy được phiếu nhập mới nhất của biến thể"}
                      className={cn("text-[13px] font-semibold text-danger", !r.canEdit && "cursor-not-allowed opacity-40")}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={list.data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      {editing && <ReceiptDrawer receipt={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </div>
  );
}

export default function AdminInventory() {
  const [tab, setTab] = useState<"costs" | "receipts">("costs");
  const [receiving, setReceiving] = useState(false);
  // Tăng sau mỗi lần nhập / sửa / hủy để cả hai tab tải lại dữ liệu.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  useRealtimeRefresh(["StockChanged", "ProductChanged"], bump);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={tab === "costs"} onClick={() => setTab("costs")}>
          Giá vốn & tồn kho
        </Chip>
        <Chip active={tab === "receipts"} onClick={() => setTab("receipts")}>
          Lịch sử nhập
        </Chip>
        <button onClick={() => setReceiving(true)} className="ml-auto rounded-lg bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white">
          + Nhập hàng
        </button>
      </div>
      {tab === "costs" ? <VariantCostsTab version={version} onChanged={bump} /> : <ReceiptsTab version={version} onChanged={bump} />}
      {receiving && <ReceiptDrawer onClose={() => setReceiving(false)} onSaved={bump} />}
    </div>
  );
}
