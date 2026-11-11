"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Headset, MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { Chip, EmptyState, ErrorBox, LoadingRows, notify, PageHeader, Pager } from "@/components/hsv/ui";
import { useWatchChat } from "@/contexts/realtime-context";
import { useApi } from "@/hooks/use-api";
import { useRealtime, useRealtimeRefresh } from "@/hooks/use-realtime";
import { STORE_URL, toApiError } from "@/lib/api/http";
import { chatSupportApi } from "@/lib/api/services";
import { ChatSender, ChatStatus, type ChatMessage, type ChatSupportConversation } from "@/lib/api/types";
import { formatDateTime, formatVND, ORDER_STATUS } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

const CHAT_STATUS: Record<ChatStatus, { label: string; cls: string }> = {
  [ChatStatus.Bot]: { label: "Bot đang trả lời", cls: "bg-info-soft text-info" },
  [ChatStatus.WaitingStaff]: { label: "Chờ nhân viên", cls: "bg-warn-soft text-warn" },
  [ChatStatus.WithStaff]: { label: "Đang hỗ trợ", cls: "bg-ok-soft text-ok" },
  [ChatStatus.Closed]: { label: "Đã kết thúc", cls: "bg-surface-active text-muted2" },
};

type Tab = "open" | ChatStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Đang mở" },
  { key: ChatStatus.WaitingStaff, label: "Chờ nhân viên" },
  { key: ChatStatus.Bot, label: "Bot đang trả lời" },
  { key: ChatStatus.Closed, label: "Đã kết thúc" },
];

/** Hỗ trợ khách hàng: khách bấm "Chat với nhân viên" ở ô chat của cửa hàng → nhân viên tiếp nhận và trả lời tại đây. */
export default function SupportPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = Number(params.get("id")) || null;
  const [tab, setTab] = useState<Tab>("open");
  const [page, setPage] = useState(1);

  const list = useApi(
    () =>
      chatSupportApi.getConversations({
        status: tab === "open" ? undefined : tab,
        skipCount: (page - 1) * PAGE_SIZE,
        maxResultCount: PAGE_SIZE,
      }),
    [tab, page]
  );
  useRealtimeRefresh(["ChatConversationChanged"], list.reload, 500);

  const select = (id: number | null) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });
  const rows = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Hỗ trợ khách hàng"
        subtitle="Khách chat ở cửa hàng được bot tự động trả lời; khi khách bấm “Chat với nhân viên”, hội thoại hiện ở mục “Chờ nhân viên”. Tiếp nhận rồi trả lời — khách nhận tin ngay trong ô chat."
      />
      <div className="hsv-card grid h-[calc(100vh-150px)] min-h-[480px] overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={cn("flex min-h-0 flex-col border-line lg:border-r", selected && "max-lg:hidden")}>
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
            {TABS.map((t) => (
              <Chip
                key={String(t.key)}
                active={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
                className="px-2 text-xs"
              >
                {t.label}
              </Chip>
            ))}
            <button onClick={() => void list.reload()} aria-label="Tải lại" className="hsv-btn-icon ml-auto">
              <RefreshCw className={cn("h-4 w-4", list.loading && "animate-spin")} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.error && !list.data ? (
              <div className="p-3">
                <ErrorBox error={list.error} onRetry={list.reload} />
              </div>
            ) : !list.data ? (
              <LoadingRows rows={5} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Headset}
                title={tab === "open" ? "Chưa có khách nào cần hỗ trợ" : "Không có cuộc trò chuyện nào"}
                body={tab === "open" ? "Hội thoại mới sẽ tự hiện ở đây." : undefined}
              />
            ) : (
              rows.map((c) => (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn("block w-full border-b border-line-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-2", c.id === selected && "bg-surface hover:bg-surface")}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {c.customerName}
                      {c.isGuest && <span className="font-normal text-muted2"> #{c.id}</span>}
                    </span>
                    {c.staffUnread > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-[18px] text-white">{c.staffUnread}</span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted2">{formatDateTime(c.lastMessageTime).slice(0, 16)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted2">
                    {c.lastSender === ChatSender.Customer ? "" : c.lastSender === ChatSender.Staff ? "Nhân viên: " : c.lastSender === ChatSender.Bot ? "Bot: " : ""}
                    {c.lastMessage ?? "—"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={cn("hsv-pill px-1.5 text-[11px]", CHAT_STATUS[c.status].cls)}>{CHAT_STATUS[c.status].label}</span>
                    {c.staffName && <span className="truncate text-[11px] text-muted2">{c.staffName}</span>}
                  </div>
                </button>
              ))
            )}
            {list.data && <Pager page={page} total={list.data.totalCount} pageSize={PAGE_SIZE} onChange={setPage} />}
          </div>
        </aside>

        <section className={cn("flex min-h-0 flex-col", !selected && "max-lg:hidden")}>
          {selected ? (
            <ConversationPane key={selected} id={selected} onBack={() => select(null)} onChanged={() => void list.reload()} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessageSquare} title="Chưa chọn cuộc trò chuyện" body="Chọn một cuộc trò chuyện ở danh sách bên trái để xem và trả lời." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationPane({ id, onBack, onChanged }: { id: number; onBack: () => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const detail = useApi(() => chatSupportApi.getConversation(id), [id]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const markRead = useRef<ReturnType<typeof setTimeout>>(undefined);
  const c = detail.data;
  const setData = detail.setData;
  const reload = detail.reload;

  useWatchChat(id);

  useRealtime("ChatMessage", ({ conversationId, message }) => {
    if (conversationId !== id) return;
    setData((prev) => (prev && !prev.messages.some((m) => m.id === message.id) ? { ...prev, messages: [...prev.messages, message] } : prev!));
    // Đang mở hội thoại → đánh dấu đã đọc (tải lại chi tiết, gom các tin đến liên tiếp).
    if (message.sender === ChatSender.Customer) {
      clearTimeout(markRead.current);
      markRead.current = setTimeout(() => void reload(), 800);
    }
  });
  useRealtime("ChatConversationChanged", (e) => {
    if (e.conversationId === id && c && e.status !== c.status) void reload();
  });
  useEffect(() => () => clearTimeout(markRead.current), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c?.messages.length]);

  const run = async (fn: () => Promise<ChatSupportConversation | ChatMessage>, ok?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if ("messages" in r) setData(r);
      else setData((prev) => (prev && !prev.messages.some((m) => m.id === r.id) ? { ...prev, messages: [...prev.messages, r] } : prev!));
      if (ok) notify(ok);
      onChanged();
      return true;
    } catch (e) {
      notify(toApiError(e).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!c) return;
    if (c.staffUserId && !c.isMine) {
      const ok = await confirm({
        title: "Giành lại cuộc trò chuyện?",
        body: `${c.staffName ?? "Nhân viên khác"} đang hỗ trợ khách này. Bạn sẽ thay họ trả lời khách.`,
        okLabel: "Giành lại",
      });
      if (!ok) return;
      await run(() => chatSupportApi.claim(id, true), "Đã tiếp nhận cuộc trò chuyện");
      return;
    }
    await run(() => chatSupportApi.claim(id), "Đã tiếp nhận cuộc trò chuyện");
  };

  const close = async () => {
    const ok = await confirm({ title: "Kết thúc cuộc trò chuyện?", body: "Khách sẽ thấy thông báo cuộc trò chuyện đã kết thúc.", okLabel: "Kết thúc" });
    if (ok) await run(() => chatSupportApi.close(id), "Đã kết thúc cuộc trò chuyện");
  };

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    if (await run(() => chatSupportApi.reply(id, value))) setText("");
    void reload(); // trả lời khi chưa tiếp nhận → backend tự tiếp nhận, cập nhật trạng thái
  };

  if (detail.error && !c)
    return (
      <div className="p-4">
        <ErrorBox error={detail.error} onRetry={detail.reload} />
      </div>
    );
  if (!c) return <LoadingRows rows={6} />;

  const closed = c.status === ChatStatus.Closed;
  const otherStaff = !!c.staffUserId && !c.isMine && c.status === ChatStatus.WithStaff;

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <button onClick={onBack} aria-label="Quay lại danh sách" className="hsv-btn-icon lg:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {c.customerName}
            {c.isGuest && <span className="ml-1.5 text-xs font-normal text-muted2">(chưa đăng nhập)</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted2">
            <span className={cn("hsv-pill px-1.5 text-[11px]", CHAT_STATUS[c.status].cls)}>{CHAT_STATUS[c.status].label}</span>
            {c.staffName && <span>Phụ trách: {c.isMine ? "Bạn" : c.staffName}</span>}
            <span>Bắt đầu {formatDateTime(c.creationTime).slice(0, 16)}</span>
          </p>
        </div>
        {!closed && (
          <div className="flex gap-2">
            {!c.isMine && (
              <button disabled={busy} onClick={claim} className="hsv-btn-primary">
                {otherStaff ? "Giành lại" : "Tiếp nhận"}
              </button>
            )}
            <button disabled={busy} onClick={close} className="hsv-btn-secondary">
              Kết thúc
            </button>
          </div>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface px-4 py-4">
        {c.messages.map((m) => (
          <MessageRow key={m.id} m={m} />
        ))}
      </div>

      <div className="border-t border-line p-3">
        {closed ? (
          <p className="py-2 text-center text-[13px] text-muted2">Cuộc trò chuyện đã kết thúc.</p>
        ) : otherStaff ? (
          <p className="py-2 text-center text-[13px] text-muted2">{c.staffName ?? "Nhân viên khác"} đang hỗ trợ khách này. Bấm “Giành lại” nếu cần thay.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder={c.isMine ? "Nhập tin nhắn cho khách… (Enter để gửi, Shift+Enter xuống dòng)" : "Gửi tin sẽ tự tiếp nhận cuộc trò chuyện…"}
              className="hsv-input min-h-[52px] flex-1 resize-none"
            />
            <button type="submit" disabled={busy || !text.trim()} className="hsv-btn-primary h-8 px-4">
              Gửi
            </button>
          </form>
        )}
      </div>
    </>
  );
}

function MessageRow({ m }: { m: ChatMessage }) {
  if (m.sender === ChatSender.System)
    return <p className="mx-auto max-w-[80%] text-center text-xs text-muted2">{m.content}</p>;
  const mine = m.sender !== ChatSender.Customer;
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <p className="mb-1 flex items-center gap-1 text-[11px] text-muted2">
        {m.sender === ChatSender.Customer ? "Khách" : m.sender === ChatSender.Staff ? (m.staffName ?? "Nhân viên") : "Bot"}
        {m.ai && (
          <span className="inline-flex items-center gap-0.5 text-accent">
            <Sparkles className="h-3 w-3" /> AI
          </span>
        )}
        · {formatDateTime(m.creationTime).slice(11, 16)}
      </p>
      <div
        className={cn(
          "max-w-[78%] whitespace-pre-line rounded-xl px-3 py-2 text-[13px] leading-5",
          m.sender === ChatSender.Customer ? "border border-line bg-white" : m.sender === ChatSender.Staff ? "bg-brand text-white" : "border border-line bg-surface-active/60"
        )}
      >
        {m.content}
        {m.products && m.products.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs">
            {m.products.map((p) => (
              <li key={p.id}>
                <a href={`${STORE_URL}/products/${p.id}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {p.name}
                </a>{" "}
                · {formatVND(p.price)}
                {!p.inStock && " · hết hàng"}
              </li>
            ))}
          </ul>
        )}
        {m.orders && m.orders.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs">
            {m.orders.map((o) => (
              <li key={o.id}>
                {o.code} · {ORDER_STATUS[o.status].label} · {formatVND(o.payableAmount)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
