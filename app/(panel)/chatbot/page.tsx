"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Bot, CheckCircle2, Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { ACTION_LABEL, ChatIntentForm } from "@/components/hsv/chat-intent-drawer";
import { Badge, Chip, EmptyState, ErrorBox, FormAlert, LoadingRows, notify, PageHeader, Pager } from "@/components/hsv/ui";
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
      <PageHeader
        title="Huấn luyện chatbot"
        subtitle="Mỗi ý định (hỏi giá, phí ship, đổi trả…) có các câu mẫu; sửa xong bấm “Huấn luyện lại” để bot học dữ liệu mới."
        actions={
          <button disabled={training} onClick={train} className="hsv-btn-primary">
            {training ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {training ? "Đang huấn luyện…" : "Huấn luyện lại"}
          </button>
        }
      />
      <div className="hsv-toolbar">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Chip key={t.key} active={tab === t.key} onClick={() => router.replace(`${pathname}?tab=${t.key}`, { scroll: false })}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      {model.data?.isOutdated && (
        <FormAlert tone="warn" className="mb-3" message="Câu mẫu đã thay đổi sau lần huấn luyện gần nhất — bấm “Huấn luyện lại” để bot học dữ liệu mới." />
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-3">
        {!model ? (
          <div className="hsv-card">
            <EmptyState icon={Bot} title="Chưa huấn luyện lần nào" body="Bấm “Huấn luyện lại” để tạo model đầu tiên từ câu mẫu." />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Độ chính xác" value={pct(model.accuracy)} note={`${model.testCount} câu kiểm tra`} />
              <Stat label="Trung bình theo ý định" value={pct(model.macroAccuracy)} note="macro accuracy" />
              <Stat label="Dữ liệu" value={`${model.phraseCount} câu`} note={`${model.intentCount} ý định`} />
              <Stat label="Huấn luyện lúc" value={formatDateTime(model.creationTime).slice(0, 16)} note={model.isLoaded ? "Bot đang dùng" : "Chưa nạp"} />
            </div>
            <p className="text-xs leading-relaxed text-muted2">
              Model học trên {model.trainCount} câu mẫu (80%) rồi đoán thử {model.testCount} câu còn lại (20%) mà nó chưa từng thấy để đo độ chính xác;
              sau đó học lại trên toàn bộ câu mẫu để dùng thật. Ý định có F1 thấp nên thêm câu mẫu đa dạng hơn.
            </p>
            <FormAlert tone="warn" message={model.warnings.join("\n")} />
            <div className="hsv-card overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="hsv-thead grid grid-cols-[minmax(200px,1fr)_90px_90px_90px_90px] gap-3">
                  <span>Ý định (yếu nhất trước)</span>
                  <span className="text-right">Câu KT</span>
                  <span className="text-right">Precision</span>
                  <span className="text-right">Recall</span>
                  <span className="text-right">F1</span>
                </div>
                {model.perIntent.map((m) => (
                  <div key={m.code} className="hsv-trow grid grid-cols-[minmax(200px,1fr)_90px_90px_90px_90px] gap-3">
                    <span className="truncate">{m.name}</span>
                    <span className="text-right text-muted2">{m.support}</span>
                    <span className="text-right">{pct(m.precision)}</span>
                    <span className="text-right">{pct(m.recall)}</span>
                    <span className={cn("text-right font-medium", m.f1 < 0.6 ? "text-danger" : m.f1 < 0.8 ? "text-warn" : "text-ok")}>{pct(m.f1)}</span>
                  </div>
                ))}
              </div>
            </div>
            {model.confusions.length > 0 && (
              <div className="hsv-card p-4">
                <p className="hsv-card-title mb-2">Hay bị nhầm (trên tập kiểm tra)</p>
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
    <div className="hsv-card p-4">
      <p className="text-xs font-medium text-muted2">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-tight tracking-[-0.01em]">{value}</p>
      <p className="mt-0.5 text-xs text-muted2">{note}</p>
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
    <div className="hsv-card h-fit p-4">
      <p className="hsv-card-title">Thử bot</p>
      <p className="mt-0.5 text-xs text-muted2">Gõ thử một câu như khách hỏi — xem bot hiểu thành ý định nào và trả lời ra sao (không lưu lại).</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void test();
        }}
        className="mt-3 flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="VD: vòng tay sừng còn cỡ 58 không" className="hsv-input flex-1" />
        <button disabled={busy || !text.trim()} className="hsv-btn-primary h-8 px-4">
          Thử
        </button>
      </form>
      {result && (
        <div className="mt-4 space-y-3 text-[13px]">
          <p className="text-muted2">
            Sau chuẩn hóa: <span className="font-mono text-xs text-ink">{result.normalized || "—"}</span>
          </p>
          <div>
            <p>
              Ý định: <b>{result.intentName ?? result.intentCode ?? "—"}</b>
            </p>
            {result.confidence !== null && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative h-2 flex-1 rounded-full bg-surface-active">
                  <div className={cn("absolute inset-y-0 left-0 rounded-full", result.belowThreshold ? "bg-[#d99a1c]" : "bg-ok-solid")} style={{ width: `${result.confidence * 100}%` }} />
                  <div className="absolute inset-y-[-3px] w-px bg-ink" style={{ left: `${result.threshold * 100}%` }} title="Ngưỡng" />
                </div>
                <span className="w-12 text-right font-semibold">{pct(result.confidence)}</span>
              </div>
            )}
            {result.belowThreshold && (
              <p className="mt-1.5 text-xs text-warn">
                Dưới ngưỡng {pct(result.threshold)} → bot coi là chưa hiểu{result.reply.ai ? ", AI (Gemini) trả lời thay" : ""}.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted2">
              Bot trả lời
              {result.reply.ai && (
                <span className="inline-flex items-center gap-0.5 text-accent">
                  <Sparkles className="h-3 w-3" /> AI
                </span>
              )}
            </p>
            <p className="whitespace-pre-line">{result.reply.content}</p>
            {result.reply.products?.map((p) => (
              <p key={p.id} className="mt-1 text-xs text-ink-2">
                • {p.name} · {formatVND(p.price)}
                {p.variants ? ` · ${p.variants.join(", ")}` : !p.inStock ? " · hết hàng" : ""}
              </p>
            ))}
            {result.reply.links?.map((l) => (
              <p key={l.url} className="mt-1 text-xs text-ink-2">
                → {l.label} ({l.url})
              </p>
            ))}
            {result.reply.suggestStaff && <p className="mt-1 text-xs text-ink-2">→ Nút “Chat với nhân viên”</p>}
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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted2">
          Mỗi ý định cần ít nhất 5 câu mẫu khác nhau; nên có 30–60 câu đa dạng (có dấu, không dấu, viết tắt). Sửa xong nhớ bấm “Huấn luyện lại”.
        </p>
        <button onClick={() => setEditing("new")} className="hsv-btn-secondary">
          <Plus className="h-3.5 w-3.5" />
          Thêm ý định
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={cn("hsv-thead grid gap-3", cols)}>
            <span>Ý định ({list?.length ?? "…"})</span>
            <span>Bot làm gì</span>
            <span>Câu trả lời mẫu</span>
            <span className="text-right">Câu mẫu</span>
            <span>Trạng thái</span>
            <span />
          </div>
          {!list ? (
            <LoadingRows rows={6} />
          ) : list.length === 0 ? (
            <EmptyState icon={Bot} title="Chưa có ý định nào" body="Thêm ý định đầu tiên kèm vài câu mẫu để bot bắt đầu học." />
          ) : (
            list.map((i) => (
              <div key={i.id} className={cn("hsv-trow grid items-center gap-3", cols)}>
                <div className="min-w-0">
                  <button onClick={() => setEditing(i.id)} className="block max-w-full truncate rounded text-left font-medium hover:underline">
                    {i.name}
                  </button>
                  <p className="truncate font-mono text-[11px] text-muted2">{i.code}</p>
                </div>
                <span className="text-ink-2">{ACTION_LABEL[i.action]}</span>
                <span className="line-clamp-2 text-xs text-muted2">{i.answer}</span>
                <span className={cn("text-right", i.phraseCount < 5 && "font-medium text-danger")}>{i.phraseCount}</span>
                <span>
                  <Badge tone={i.isActive ? "ok" : "neutral"}>{i.isActive ? "Đang dùng" : "Tắt"}</Badge>
                </span>
                <button onClick={() => setEditing(i.id)} className="hsv-link text-right">
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
      <p className="mb-3 text-xs text-muted2">
        Câu khách hỏi mà bot không đủ tự tin (dưới ngưỡng). Chọn ý định đúng rồi bấm “Thêm vào câu mẫu” — số điện thoại, email đã được che. Câu vô nghĩa thì
        “Bỏ qua”. Xong một loạt thì bấm “Huấn luyện lại”.
      </p>
      <div className="hsv-card overflow-hidden">
        {!list.data ? (
          <LoadingRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Không có câu nào chờ gán nhãn" body="Bot đang hiểu được các câu khách hỏi gần đây." />
        ) : (
          rows.map((r) => {
            const guess = r.intentCode ? byCode.get(r.intentCode) : undefined;
            // Chỉ chọn sẵn ý định bot đoán khi nó gần đúng; đoán quá thấp thì để quản trị tự chọn, tránh bấm nhầm.
            const selected = choice[r.messageId] ?? ((r.confidence ?? 0) >= 0.35 ? guess?.id : undefined) ?? 0;
            return (
              <div key={r.messageId} className={cn("hsv-trow flex flex-wrap items-center gap-3", busy === r.messageId && "opacity-50")}>
                <div className="min-w-[240px] flex-1">
                  <p className="text-[13px]">“{r.text}”</p>
                  <p className="mt-0.5 text-[11px] text-muted2">
                    {formatDateTime(r.creationTime).slice(0, 16)}
                    {guess && r.confidence !== null && ` · bot đoán: ${guess.name} (${pct(r.confidence)})`}
                  </p>
                </div>
                <select
                  value={selected}
                  onChange={(e) => setChoice((c) => ({ ...c, [r.messageId]: Number(e.target.value) }))}
                  className="hsv-input w-[220px]"
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
                  className="hsv-btn-secondary"
                >
                  Thêm vào câu mẫu
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => act(r.messageId, () => chatTrainingApi.dismiss(r.messageId), "Đã bỏ qua")}
                  className="hsv-link-muted"
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
