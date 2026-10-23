"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Drawer, ErrorBox, FieldError, FormAlert, notify, Skeleton } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { chatTrainingApi } from "@/lib/api/services";
import { ChatIntentAction } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Việc bot làm thêm khi nhận ra ý định — khớp ChatIntentAction ở backend. */
export const ACTION_LABEL: Record<ChatIntentAction, string> = {
  [ChatIntentAction.None]: "Chỉ trả lời mẫu",
  [ChatIntentAction.SearchProducts]: "Tìm sản phẩm",
  [ChatIntentAction.ProductPrice]: "Báo giá sản phẩm",
  [ChatIntentAction.ProductStock]: "Báo còn hàng",
  [ChatIntentAction.Collections]: "Liệt kê bộ sưu tập",
  [ChatIntentAction.MyOrders]: "Tra đơn của khách",
  [ChatIntentAction.Handoff]: "Gợi ý gặp nhân viên",
};

const ACTION_HINT: Record<ChatIntentAction, string> = {
  [ChatIntentAction.None]: "Bot gửi đúng câu trả lời mẫu bên dưới (kèm nút link nếu có).",
  [ChatIntentAction.SearchProducts]: "Bot tìm sản phẩm theo từ khóa / khoảng giá trong câu khách hỏi; câu trả lời mẫu là lời dẫn trước danh sách.",
  [ChatIntentAction.ProductPrice]: "Bot tra giá sản phẩm khách nhắc tới (hoặc sản phẩm vừa hỏi trước đó).",
  [ChatIntentAction.ProductStock]: "Bot báo còn hàng theo từng biến thể của sản phẩm khách nhắc tới.",
  [ChatIntentAction.Collections]: "Bot liệt kê các bộ sưu tập đang hiện trên cửa hàng.",
  [ChatIntentAction.MyOrders]: "Khách đã đăng nhập: bot hiện các đơn gần nhất (hoặc đơn theo mã HSV…); chưa đăng nhập thì mời đăng nhập.",
  [ChatIntentAction.Handoff]: "Bot gửi câu trả lời mẫu và hiện nút “Chat với nhân viên” nổi bật.",
};

type Form = {
  name: string;
  code: string;
  action: ChatIntentAction;
  answer: string;
  linkLabel: string;
  linkUrl: string;
  isActive: boolean;
  phrases: string;
};
type Errors = Partial<Record<"name" | "code" | "answer" | "linkUrl" | "phrases", string>>;

const EMPTY: Form = { name: "", code: "", action: ChatIntentAction.None, answer: "", linkLabel: "", linkUrl: "", isActive: true, phrases: "" };

/** Ngăn kéo thêm / sửa ý định của chatbot: tên, việc bot làm, câu trả lời mẫu, nút link và câu mẫu (mỗi dòng một câu). */
export function ChatIntentForm({ id, onClose, onSaved }: { id: number | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = id === "new";
  const confirm = useConfirm();
  const detail = useApi(() => chatTrainingApi.getIntent(id as number), [id], !isNew);
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setForm({
      name: d.name,
      code: d.code,
      action: d.action,
      answer: d.answer,
      linkLabel: d.linkLabel ?? "",
      linkUrl: d.linkUrl ?? "",
      isActive: d.isActive,
      phrases: (d.phrases ?? []).join("\n"),
    });
  }, [detail.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const lines = useMemo(() => (form?.phrases ?? "").split("\n").map((l) => l.trim()).filter(Boolean), [form?.phrases]);

  const save = async () => {
    if (!form) return;
    const errs: Errors = {};
    if (!form.name.trim()) errs.name = "Vui lòng nhập tên ý định";
    if (!form.answer.trim()) errs.answer = "Vui lòng nhập câu trả lời mẫu";
    if (form.linkUrl.trim() && !form.linkUrl.trim().startsWith("/")) errs.linkUrl = "Đường dẫn trong cửa hàng, bắt đầu bằng “/” (VD /ho-tro#doi-tra)";
    if (form.isActive && lines.length < 5) errs.phrases = "Ý định đang dùng cần ít nhất 5 câu mẫu";
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const input = {
        id: isNew ? undefined : (id as number),
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        action: form.action,
        answer: form.answer.trim(),
        linkLabel: form.linkLabel.trim() || null,
        linkUrl: form.linkUrl.trim() || null,
        isActive: form.isActive,
        phrases: lines,
      };
      await (isNew ? chatTrainingApi.createIntent(input) : chatTrainingApi.updateIntent(input));
      notify("Đã lưu ý định — bấm “Huấn luyện lại” để bot học câu mẫu mới");
      onSaved();
    } catch (e) {
      const api = toApiError(e);
      const f = api.fieldErrors() as Errors;
      if (!Object.keys(f).length && /mã ý định/i.test(api.message)) f.code = api.message;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew || !form) return;
    const ok = await confirm({
      title: `Xóa ý định “${form.name}”?`,
      body: "Ý định và toàn bộ câu mẫu bị xóa hẳn. Sau đó bấm “Huấn luyện lại” để bot không còn dùng ý định này.",
      okLabel: "Xóa",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await chatTrainingApi.deleteIntent(id as number);
      notify("Đã xóa ý định");
      onSaved();
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      header={
        <>
          <p className="text-[17px] font-bold">{isNew ? "Thêm ý định" : "Sửa ý định"}</p>
          {!isNew && detail.data && <p className="mt-0.5 truncate font-mono text-[12.5px] text-muted2">{detail.data.code}</p>}
        </>
      }
      footer={
        form && (
          <>
            {!isNew && (
              <button onClick={remove} disabled={busy} className="px-1 py-2.5 text-[13.5px] font-semibold text-danger">
                Xóa ý định
              </button>
            )}
            <button onClick={onClose} className="ml-auto px-3.5 py-2.5 text-[13.5px]">
              Hủy
            </button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-navy px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {busy ? "Đang lưu…" : "Lưu ý định"}
            </button>
          </>
        )
      }
    >
      {detail.error && !form ? (
        <ErrorBox error={detail.error} onRetry={detail.reload} />
      ) : !form ? (
        <div className="space-y-3">
          <Skeleton className="h-11" />
          <Skeleton className="h-24" />
          <Skeleton className="h-60" />
        </div>
      ) : (
        <div>
          <FormAlert message={formError} />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="ci-name" className="hsv-label">
                Tên ý định
              </label>
              <input
                id="ci-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="VD: Hỏi giá"
                className={cn("hsv-input h-11 text-sm", errors.name && "hsv-input-error")}
              />
              <FieldError message={errors.name} />
            </div>
            <div>
              <label htmlFor="ci-code" className="hsv-label">
                Mã (nhãn huấn luyện)
              </label>
              <input
                id="ci-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="Để trống: tự tạo từ tên"
                className={cn("hsv-input h-11 font-mono text-sm", errors.code && "hsv-input-error")}
              />
              <FieldError message={errors.code} />
            </div>
          </div>

          <label htmlFor="ci-action" className="hsv-label mt-3.5">
            Bot làm gì
          </label>
          <select
            id="ci-action"
            value={form.action}
            onChange={(e) => set("action", Number(e.target.value) as ChatIntentAction)}
            className="hsv-input h-11 text-sm"
          >
            {Object.entries(ACTION_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-muted2">{ACTION_HINT[form.action]}</p>

          <label htmlFor="ci-answer" className="hsv-label mt-3.5">
            Câu trả lời mẫu
          </label>
          <textarea
            id="ci-answer"
            rows={4}
            value={form.answer}
            onChange={(e) => set("answer", e.target.value)}
            className={cn("hsv-input h-auto py-2.5 text-sm", errors.answer && "hsv-input-error")}
          />
          <FieldError message={errors.answer} />

          <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="ci-link-label" className="hsv-label">
                Nút link (tùy chọn)
              </label>
              <input
                id="ci-link-label"
                value={form.linkLabel}
                onChange={(e) => set("linkLabel", e.target.value)}
                placeholder="VD: Chính sách đổi trả"
                className="hsv-input h-11 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ci-link-url" className="hsv-label">
                Đường dẫn của nút
              </label>
              <input
                id="ci-link-url"
                value={form.linkUrl}
                onChange={(e) => set("linkUrl", e.target.value)}
                placeholder="/ho-tro#doi-tra"
                className={cn("hsv-input h-11 text-sm", errors.linkUrl && "hsv-input-error")}
              />
              <FieldError message={errors.linkUrl} />
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              Đang dùng
              <span className="block text-[12px] text-muted2">Tắt thì lần huấn luyện kế tiếp bỏ qua ý định này.</span>
            </span>
          </label>

          <div className="mt-4 flex items-end justify-between">
            <label htmlFor="ci-phrases" className="hsv-label mb-1.5">
              Câu mẫu — mỗi dòng một câu
            </label>
            <span className={cn("mb-1.5 text-[12px]", lines.length < 5 ? "text-danger" : "text-muted2")}>{lines.length} câu</span>
          </div>
          <textarea
            id="ci-phrases"
            rows={14}
            value={form.phrases}
            onChange={(e) => set("phrases", e.target.value)}
            placeholder={"lược sừng giá bao nhiêu\nvong tay bn tien\ncho mình xin giá…"}
            className={cn("hsv-input h-auto py-2.5 font-mono text-[13px] leading-relaxed", errors.phrases && "hsv-input-error")}
          />
          <FieldError message={errors.phrases} />
          <p className="mt-1 text-[12px] text-muted2">
            Viết như khách thật hay gõ: có dấu, không dấu, viết tắt (“bn”, “sp”, “ko”), cách hỏi khác nhau. Câu trùng nhau sau khi bỏ dấu chỉ giữ một.
          </p>
        </div>
      )}
    </Drawer>
  );
}
