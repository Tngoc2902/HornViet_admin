"use client";

import { useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Chip, Drawer, ErrorBox, FieldError, FormAlert, LoadingRows, notify, Pager } from "@/components/hsv/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { stockReceiptApi } from "@/lib/api/services";
import type { StockReceipt, VariantCost } from "@/lib/api/types";
import { formatDateTime, formatVND } from "@/lib/hsv/format";
import { isMissingApi, MOCK_NOTICE, mockReceipts, mockVariantCosts } from "@/lib/hsv/mock-cost";
import type { FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const COST_COLS = "grid-cols-[minmax(0,2fr)_90px_110px_120px_130px_110px_110px]";
const RECEIPT_COLS = "grid-cols-[130px_minmax(0,2fr)_80px_110px_120px_minmax(0,1.2fr)_120px]";

/** Giống ProductVariant.MovingAverage ở backend: (tồn × giá cũ + nhập × giá nhập) / (tồn + nhập). */
function movingAverage(stock: number, average: number | null, qty: number, cost: number) {
  if (stock <= 0 || average === null) return cost;
  return (stock * average + qty * cost) / (stock + qty);
}

const parseNumber = (v: string) => Number(v.replace(/[.,\s]/g, ""));

type ReceiptKey = "quantity" | "unitCost";

/** Gọi API thật; backend cũ chưa có API nhập kho (404) → dữ liệu ảo khi chạy dev, chỉ xem. */
async function withMock<T>(real: () => Promise<T>, mock: () => Promise<T>) {
  try {
    return { data: await real(), mocked: false };
  } catch (e) {
    if (isMissingApi(e)) return { data: await mock(), mocked: true };
    throw e;
  }
}

const MockNotice = () => (
  <div className="mb-3.5">
    <FormAlert tone="warn" message={MOCK_NOTICE} />
  </div>
);

/** Nhập hàng mới (variant) hoặc sửa phiếu mới nhất (receipt). */
function ReceiptDrawer({
  variant,
  receipt,
  onClose,
  onSaved,
}: {
  variant?: VariantCost;
  receipt?: StockReceipt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState(receipt ? String(receipt.quantity) : "");
  const [unitCost, setUnitCost] = useState(receipt ? String(receipt.unitCost) : "");
  const [note, setNote] = useState(receipt?.note ?? "");
  const [errors, setErrors] = useState<FieldErrors<ReceiptKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const productName = variant?.productName ?? receipt?.productName ?? "";
  const variantName = variant?.variantName ?? receipt?.variantName ?? "";
  const qty = parseNumber(quantity);
  const cost = parseNumber(unitCost);
  const valid = Number.isInteger(qty) && qty > 0 && Number.isFinite(cost) && cost >= 0 && unitCost.trim() !== "";
  const preview = variant && valid ? movingAverage(variant.stockQuantity, variant.averageCost, qty, cost) : null;

  const save = async () => {
    const e: FieldErrors<ReceiptKey> = {};
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) e.quantity = "Số lượng nhập phải từ 1 đến 1.000.000";
    if (unitCost.trim() === "" || !Number.isFinite(cost) || cost < 0 || cost > 999_999_999) e.unitCost = "Giá nhập không hợp lệ";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      if (receipt) {
        await stockReceiptApi.update({ id: receipt.id, quantity: qty, unitCost: cost, note: note.trim() || undefined });
        notify("Đã sửa phiếu nhập, giá vốn đã được tính lại");
      } else if (variant) {
        await stockReceiptApi.create({ productVariantId: variant.productVariantId, quantity: qty, unitCost: cost, note: note.trim() || undefined });
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
        <div className="rounded-lg bg-surface px-4 py-3 text-[13.5px]">
          <p className="font-semibold">{productName}</p>
          <p className="text-muted2">{variantName}</p>
          {variant && (
            <p className="mt-1.5 text-[12.5px] text-subtle">
              Tồn hiện tại: {variant.stockQuantity} · Giá vốn hiện tại: {variant.averageCost === null ? "chưa có" : formatVND(variant.averageCost)} · Giá bán:{" "}
              {formatVND(variant.salePrice)}
            </p>
          )}
        </div>
        <FormAlert message={formError} />
        <div>
          <label htmlFor="sr-qty" className="hsv-label">Số lượng nhập *</label>
          <input
            id="sr-qty"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
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
        <p className="rounded-lg bg-surface px-4 py-3 text-[12.5px] text-muted2">
          Giá vốn tính theo bình quân di động: mỗi lần nhập, giá vốn = (tồn × giá vốn cũ + số nhập × giá nhập) / tổng số lượng.
          Đơn bán sau đó lưu giá vốn này để tính lợi nhuận.
          {receipt && " Sửa phiếu sẽ tính lại giá vốn của các đơn đã bán biến thể này từ sau thời điểm nhập."}
        </p>
      </div>
    </Drawer>
  );
}

function VariantCostsTab({ onReceived }: { onReceived: () => void }) {
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [page, setPage] = useState(1);
  const [receiving, setReceiving] = useState<VariantCost | null>(null);
  const list = useApi(() => {
    const q = { keyword: keyword || undefined, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE };
    return withMock(() => stockReceiptApi.getVariantCosts(q), () => mockVariantCosts(q));
  }, [keyword, page]);
  const data = list.data?.data;
  const mocked = !!list.data?.mocked;
  const rows = data?.items ?? [];

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
        className="mb-3.5 h-10 w-[300px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy"
      />
      {mocked && <MockNotice />}
      {list.error && !data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && data && "opacity-70")}>
          <div className="min-w-[900px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", COST_COLS)}>
              <span>Sản phẩm / biến thể ({data?.totalCount ?? "…"})</span>
              <span className="text-right">Tồn kho</span>
              <span className="text-right">Giá bán</span>
              <span className="text-right">Giá vốn BQ</span>
              <span className="text-right">Giá trị tồn</span>
              <span className="text-right">Lãi / sp</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!data ? (
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
                  <button
                    onClick={() => setReceiving(v)}
                    disabled={mocked}
                    title={mocked ? "Đang xem dữ liệu ảo, backend chưa có chức năng nhập kho" : undefined}
                    className={cn("text-right text-[13px] font-semibold text-navy", mocked && "cursor-not-allowed opacity-40")}
                  >
                    + Nhập hàng
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <Pager page={page} total={data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      {receiving && (
        <ReceiptDrawer
          variant={receiving}
          onClose={() => setReceiving(null)}
          onSaved={() => {
            void list.reload();
            onReceived();
          }}
        />
      )}
    </div>
  );
}

function ReceiptsTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const keyword = useDebounced(q.trim());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StockReceipt | null>(null);
  const list = useApi(() => {
    const q = { keyword: keyword || undefined, skipCount: (page - 1) * PAGE_SIZE, maxResultCount: PAGE_SIZE };
    return withMock(() => stockReceiptApi.getAll(q), () => mockReceipts(q));
  }, [keyword, page, version]);
  const data = list.data?.data;
  const mocked = !!list.data?.mocked;
  const rows = data?.items ?? [];

  const onDelete = async (r: StockReceipt) => {
    const ok = await confirm({
      title: "Hủy phiếu nhập?",
      body: `${r.productName} (${r.variantName}): trừ lại ${r.quantity} sản phẩm khỏi tồn kho, giá vốn trở về như trước khi nhập.`,
      okLabel: "Hủy phiếu",
      danger: true,
    });
    if (!ok) return;
    try {
      await stockReceiptApi.delete(r.id);
      notify("Đã hủy phiếu nhập");
      void list.reload();
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
        className="mb-3.5 h-10 w-[300px] rounded-full border border-line bg-white px-4 text-[13.5px] outline-none focus:border-navy"
      />
      {mocked && <MockNotice />}
      {list.error && !data ? (
        <ErrorBox error={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn("hsv-card overflow-x-auto", list.loading && data && "opacity-70")}>
          <div className="min-w-[960px]">
            <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", RECEIPT_COLS)}>
              <span>Ngày nhập</span>
              <span>Sản phẩm / biến thể ({data?.totalCount ?? "…"})</span>
              <span className="text-right">Số lượng</span>
              <span className="text-right">Giá nhập</span>
              <span className="text-right">Thành tiền</span>
              <span>Ghi chú</span>
              <span className="text-right">Thao tác</span>
            </div>
            {!data ? (
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
                      title={mocked ? "Đang xem dữ liệu ảo" : r.canEdit ? undefined : "Chỉ sửa được phiếu nhập mới nhất của biến thể"}
                      className={cn("text-[13px] font-semibold text-navy", !r.canEdit && "cursor-not-allowed opacity-40")}
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      disabled={!r.canEdit}
                      title={mocked ? "Đang xem dữ liệu ảo" : r.canEdit ? undefined : "Chỉ hủy được phiếu nhập mới nhất của biến thể"}
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
      <Pager page={page} total={data?.totalCount ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      {editing && (
        <ReceiptDrawer
          receipt={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void list.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default function AdminInventory() {
  const [tab, setTab] = useState<"costs" | "receipts">("costs");
  // Tăng sau mỗi lần nhập / sửa / hủy để tab kia tải lại dữ liệu khi được mở.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={tab === "costs"} onClick={() => setTab("costs")}>
          Giá vốn & tồn kho
        </Chip>
        <Chip active={tab === "receipts"} onClick={() => setTab("receipts")}>
          Lịch sử nhập
        </Chip>
        <span className="ml-auto text-[12.5px] text-faint">Chỉ Quản trị viên xem được giá nhập và giá vốn</span>
      </div>
      {tab === "costs" ? <VariantCostsTab onReceived={bump} /> : <ReceiptsTab version={version} onChanged={bump} />}
    </div>
  );
}
