"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ACTION_LABEL, ChatIntentForm } from "@/components/hsv/chat-intent-drawer";
import { Chip, ErrorBox, LoadingRows, notify, Pager } from "@/components/hsv/ui";
import { useApi } from "@/hooks/use-api";
import { toApiError } from "@/lib/api/http";
import { chatTrainingApi } from "@/lib/api/services";
import { type ChatIntent, type ChatModel, type ChatTestResult } from "@/lib/api/types";
import { formatDateTime, formatVND } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "model", label: "Model & thử bot" },
  { key: "intents", label: "Ý định & câu mẫu" },
  { key: "review", label: "Câu bot chưa hiểu" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * Huấn luyện chatbot: mỗi ý định (hỏi giá, phí ship, đổi trả…) có các câu mẫu; bấm “Huấn luyện” để model học lại,
 * xem độ chính xác trên tập kiểm tra và gán nhãn những câu khách hỏi mà bot chưa hiểu.
 */
export default function ChatbotPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "model") as Tab;
  const model = useApi(() => chatTrainingApi.getModel(), []);
  const intents = useApi(() => chatTrainingApi.getIntents(), []);
  const [training, setTraining] = useState(false);

  const train = async () => {
    setTraining(true);
    try {
      const m = await chatTrainingApi.train();
      model.setData(m);
      notify(`Đã huấn luyện xong — độ chính xác ${pct(m.accuracy)}`);
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setTraining(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => router.replace(`${pathname}?tab=${t.key}`, { scroll: false })}>
            {t.label}
          </Chip>
        ))}
        <button disabled={training} onClick={train} className="hsv-btn ml-auto h-10 bg-navy px-5 text-[13.5px] text-white hover:bg-navy-deep">
          {training ? "Đang huấn luyện…" : "Huấn luyện lại"}
        </button>
      </div>
      {model.data?.isOutdated && (
        <p className="mb-4 border border-warn-line bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          Câu mẫu đã thay đổi sau lần huấn luyện gần nhất — bấm “Huấn luyện lại” để bot học dữ liệu mới.
        </p>
      )}

      {tab === "model" && <ModelTab model={model.data} loading={model.loading} error={model.error} reload={model.reload} />}
      {tab === "intents" && <IntentsTab list={intents.data?.items} error={intents.error} reload={intents.reload} onChanged={() => void model.reload()} />}
      {tab === "review" && (
        <ReviewTab
          intents={intents.data?.items ?? []}
          onLabeled={() => {
            void intents.reload();
            void model.reload();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Model & thử bot

function ModelTab({ model, loading, error, reload }: { model: ChatModel | null | undefined; loading: boolean; error: ReturnType<typeof toApiError> | null; reload: () => void }) {
  if (error && model === undefined) return <ErrorBox error={error} onRetry={reload} />;
  if (model === undefined && loading) return <LoadingRows rows={4} />;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        {!model ? (
          <div className="hsv-card p-6 text-sm text-muted2">Chưa huấn luyện lần nào. Bấm “Huấn luyện lại” để tạo model đầu tiên từ câu mẫu.</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Độ chính xác" value={pct(model.accuracy)} note={`${model.testCount} câu kiểm tra`} />
              <Stat label="Trung bình theo ý định" value={pct(model.macroAccuracy)} note="macro accuracy" />
              <Stat label="Dữ liệu" value={`${model.phraseCount} câu`} note={`${model.intentCount} ý định`} />
              <Stat label="Huấn luyện lúc" value={formatDateTime(model.creationTime).slice(0, 16)} note={model.isLoaded ? "Bot đang dùng" : "Chưa nạp"} />
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted2">
              Model học trên {model.trainCount} câu mẫu (80%) rồi đoán thử {model.testCount} câu còn lại (20%) mà nó chưa từng thấy để đo độ chính xác;
              sau đó học lại trên toàn bộ câu mẫu để dùng thật. Ý định có F1 thấp nên thêm câu mẫu đa dạng hơn.
            </p>
            {model.warnings.length > 0 && (
              <div className="border border-warn-line bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
                {model.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
            <div className="hsv-card overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[minmax(200px,1fr)_90px_90px_90px_90px] gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2">
                  <span>Ý định (yếu nhất trước)</span>
                  <span className="text-right">Câu KT</span>
                  <span className="text-right">Precision</span>
                  <span className="text-right">Recall</span>
                  <span className="text-right">F1</span>
                </div>
                {model.perIntent.map((m) => (
                  <div key={m.code} className="grid grid-cols-[minmax(200px,1fr)_90px_90px_90px_90px] gap-3 border-t border-line-2 px-5 py-2.5 text-[13px]">
                    <span className="truncate">{m.name}</span>
                    <span className="text-right text-muted2">{m.support}</span>
                    <span className="text-right">{pct(m.precision)}</span>
                    <span className="text-right">{pct(m.recall)}</span>
                    <span className={cn("text-right font-semibold", m.f1 < 0.6 ? "text-danger" : m.f1 < 0.8 ? "text-warn" : "text-ok")}>{pct(m.f1)}</span>
                  </div>
                ))}
              </div>
            </div>
            {model.confusions.length > 0 && (
              <div className="hsv-card p-5">
                <p className="mb-2 text-[13px] font-semibold">Hay bị nhầm (trên tập kiểm tra)</p>
                <ul className="space-y-1 text-[13px] text-ink-2">
                  {model.confusions.map((c) => (
                    <li key={`${c.actual}-${c.predicted}`}>
                      “{c.actual}” bị đoán thành “{c.predicted}”: {c.count} câu
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      <TestBox />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="hsv-card px-4 py-3.5">
      <p className="text-[12px] font-semibold text-muted2">{label}</p>
      <p className="mt-1 text-[22px] font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-subtle">{note}</p>
    </div>
  );
}

function TestBox() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ChatTestResult | null>(null);

  const test = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setResult(await chatTrainingApi.test(text.trim()));
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hsv-card h-fit p-5">
      <p className="text-[14px] font-semibold">Thử bot</p>
      <p className="mt-0.5 text-[12.5px] text-muted2">Gõ thử một câu như khách hỏi — xem bot hiểu thành ý định nào và trả lời ra sao (không lưu lại).</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void test();
        }}
        className="mt-3 flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: vòng tay sừng còn cỡ 58 không" className="hsv-input h-10 flex-1 text-[13.5px]" />
        <button disabled={busy || !text.trim()} className="hsv-btn h-10 bg-navy px-4 text-[13px] text-white">
          Thử
        </button>
      </form>
      {result && (
        <div className="mt-4 space-y-3 text-[13px]">
          <p className="text-muted2">
            Sau chuẩn hóa: <span className="font-mono text-[12.5px] text-ink">{result.normalized || "—"}</span>
          </p>
          <div>
            <p>
              Ý định: <b>{result.intentName ?? result.intentCode ?? "—"}</b>
            </p>
            {result.confidence !== null && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative h-2 flex-1 bg-surface">
                  <div className={cn("absolute inset-y-0 left-0", result.belowThreshold ? "bg-warn" : "bg-ok-solid")} style={{ width: `${result.confidence * 100}%` }} />
                  <div className="absolute inset-y-[-3px] w-px bg-ink" style={{ left: `${result.threshold * 100}%` }} title="Ngưỡng" />
                </div>
                <span className="w-12 text-right font-semibold">{pct(result.confidence)}</span>
              </div>
            )}
            {result.belowThreshold && (
              <p className="mt-1.5 text-[12.5px] text-warn">
                Dưới ngưỡng {pct(result.threshold)} → bot coi là chưa hiểu{result.reply.ai ? ", AI (Gemini) trả lời thay" : ""}.
              </p>
            )}
          </div>
          <div className="border border-line bg-surface-2 p-3">
            <p className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-muted2">
              Bot trả lời
              {result.reply.ai && (
                <span className="inline-flex items-center gap-0.5 text-gold-dark">
                  <Sparkles className="h-3 w-3" /> AI
                </span>
              )}
            </p>
            <p className="whitespace-pre-line">{result.reply.content}</p>
            {result.reply.products?.map((p) => (
              <p key={p.id} className="mt-1 text-[12.5px] text-ink-2">
                • {p.name} · {formatVND(p.price)}
                {p.variants ? ` · ${p.variants.join(", ")}` : !p.inStock ? " · hết hàng" : ""}
              </p>
            ))}
            {result.reply.links?.map((l) => (
              <p key={l.url} className="mt-1 text-[12.5px] text-ink-2">
                → {l.label} ({l.url})
              </p>
            ))}
            {result.reply.suggestStaff && <p className="mt-1 text-[12.5px] text-ink-2">→ Nút “Chat với nhân viên”</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Ý định & câu mẫu

function IntentsTab({ list, error, reload, onChanged }: { list: ChatIntent[] | undefined; error: ReturnType<typeof toApiError> | null; reload: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const cols = "grid-cols-[minmax(200px,1.4fr)_minmax(150px,1fr)_minmax(240px,2fr)_90px_90px_60px]";
  if (error && !list) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted2">
          Mỗi ý định cần ít nhất 5 câu mẫu khác nhau; nên có 30–60 câu đa dạng (có dấu, không dấu, viết tắt). Sửa xong nhớ bấm “Huấn luyện lại”.
        </p>
        <button onClick={() => setEditing("new")} className="ml-auto rounded-lg bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white">
          + Thêm ý định
        </button>
      </div>
      <div className="hsv-card overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={cn("grid gap-3 bg-surface px-5 py-3 text-xs font-bold text-muted2", cols)}>
            <span>Ý định ({list?.length ?? "…"})</span>
            <span>Bot làm gì</span>
            <span>Câu trả lời mẫu</span>
            <span className="text-right">Câu mẫu</span>
            <span>Trạng thái</span>
            <span />
          </div>
          {!list ? (
            <LoadingRows rows={6} />
          ) : (
            list.map((i) => (
              <div key={i.id} className={cn("grid items-center gap-3 border-t border-line-2 px-5 py-3", cols)}>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{i.name}</p>
                  <p className="truncate font-mono text-[11.5px] text-muted2">{i.code}</p>
                </div>
                <span className="text-[13px] text-ink-2">{ACTION_LABEL[i.action]}</span>
                <span className="line-clamp-2 text-[12.5px] text-muted2">{i.answer}</span>
                <span className={cn("text-right text-[13px]", i.phraseCount < 5 && "font-semibold text-danger")}>{i.phraseCount}</span>
                <span className={cn("w-fit rounded-lg px-2.5 py-1 text-[11.5px] font-bold", i.isActive ? "bg-ok-soft text-ok" : "bg-[#efebe4] text-muted2")}>
                  {i.isActive ? "Đang dùng" : "Tắt"}
                </span>
                <button onClick={() => setEditing(i.id)} className="text-right text-[13px] font-semibold">
                  Sửa
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {editing !== null && (
        <ChatIntentForm
          key={editing}
          id={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Câu bot chưa hiểu

const REVIEW_PAGE = 20;

function ReviewTab({ intents, onLabeled }: { intents: ChatIntent[]; onLabeled: () => void }) {
  const [page, setPage] = useState(1);
  const list = useApi(() => chatTrainingApi.getUnrecognized({ skipCount: (page - 1) * REVIEW_PAGE, maxResultCount: REVIEW_PAGE }), [page]);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const byCode = new Map(intents.map((i) => [i.code, i]));

  const act = async (id: number, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      notify(ok);
      await list.reload();
      onLabeled();
    } catch (e) {
      notify(toApiError(e).message);
    } finally {
      setBusy(null);
    }
  };

  if (list.error && !list.data) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const rows = list.data?.items ?? [];
  return (
    <div>
      <p className="mb-3.5 text-sm text-muted2">
        Câu khách hỏi mà bot không đủ tự tin (dưới ngưỡng). Chọn ý định đúng rồi bấm “Thêm vào câu mẫu” — số điện thoại, email đã được che. Câu vô nghĩa thì
        “Bỏ qua”. Xong một loạt thì bấm “Huấn luyện lại”.
      </p>
      <div className="hsv-card">
        {!list.data ? (
          <LoadingRows rows={5} />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-subtle">Không có câu nào chờ gán nhãn.</p>
        ) : (
          rows.map((r) => {
            const guess = r.intentCode ? byCode.get(r.intentCode) : undefined;
            // Chỉ chọn sẵn ý định bot đoán khi nó gần đúng; đoán quá thấp thì để quản trị tự chọn, tránh bấm nhầm.
            const selected = choice[r.messageId] ?? ((r.confidence ?? 0) >= 0.35 ? guess?.id : undefined) ?? 0;
            return (
              <div key={r.messageId} className={cn("flex flex-wrap items-center gap-3 border-b border-line-2 px-5 py-3 last:border-b-0", busy === r.messageId && "opacity-50")}>
                <div className="min-w-[240px] flex-1">
                  <p className="text-[13.5px]">“{r.text}”</p>
                  <p className="mt-0.5 text-[11.5px] text-subtle">
                    {formatDateTime(r.creationTime).slice(0, 16)}
                    {guess && r.confidence !== null && ` · bot đoán: ${guess.name} (${pct(r.confidence)})`}
                  </p>
                </div>
                <select
                  value={selected}
                  onChange={(e) => setChoice((c) => ({ ...c, [r.messageId]: Number(e.target.value) }))}
                  className="hsv-input h-9 w-[220px] text-[13px]"
                  aria-label="Ý định đúng"
                >
                  <option value={0}>— Chọn ý định —</option>
                  {intents.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!selected || busy !== null}
                  onClick={() => act(r.messageId, () => chatTrainingApi.label(r.messageId, selected), "Đã thêm vào câu mẫu")}
                  className="hsv-btn h-9 bg-navy px-3.5 text-[12.5px] text-white"
                >
                  Thêm vào câu mẫu
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => act(r.messageId, () => chatTrainingApi.dismiss(r.messageId), "Đã bỏ qua")}
                  className="text-[12.5px] font-semibold text-muted2 hover:text-navy"
                >
                  Bỏ qua
                </button>
              </div>
            );
          })
        )}
      </div>
      {list.data && <Pager page={page} total={list.data.totalCount} pageSize={REVIEW_PAGE} onChange={setPage} />}
    </div>
  );
}
