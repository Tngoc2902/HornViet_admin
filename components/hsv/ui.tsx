"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { assetUrl, type ApiError } from "@/lib/api/http";
import { DeliveryMethod, type OrderStatus } from "@/lib/api/types";
import { gradient, ORDER_FLOW, ORDER_STATUS, PICKUP_FLOW } from "@/lib/hsv/format";
import { tonesFor } from "@/lib/hsv/tones";

/** Toast tối ở đáy giữa màn hình, tự ẩn sau 2.6s. Cùng `id` thì toast sau thay toast trước (không hiện trùng). */
export function notify(message: string, id?: string) {
  toast(message, id ? { id } : undefined);
}

/**
 * Ảnh sản phẩm từ backend (/uploads/...). Không có ảnh hoặc ảnh lỗi thì hiện
 * nền gradient màu sừng theo `seed` (thường là id sản phẩm).
 */
export function ProductImage({
  src,
  seed = 0,
  alt = "",
  className,
  children,
}: {
  src?: string | null;
  seed?: number;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  const url = assetUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: gradient(tonesFor(seed)) }}>
      {url && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Nhãn trạng thái

const BADGE_TONES = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-active text-muted2",
  accent: "bg-accent-soft text-accent",
};
export type BadgeTone = keyof typeof BADGE_TONES;

/** Nhãn trạng thái dạng viên (Đang bán, Tạm ẩn, Sắp hết…). */
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn("hsv-pill", BADGE_TONES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const m = ORDER_STATUS[status];
  return (
    <span className={cn("hsv-pill", className)} style={{ color: m.fg, background: m.bg }}>
      {m.label}
    </span>
  );
}

export function OrderProgress({ status, deliveryMethod }: { status: OrderStatus; deliveryMethod?: DeliveryMethod }) {
  const flow = deliveryMethod === DeliveryMethod.StorePickup ? PICKUP_FLOW : ORDER_FLOW;
  const idx = flow.indexOf(status);
  if (idx < 0) return null;
  return (
    <div className="flex gap-2">
      {flow.map((k, i) => (
        <div key={k} className="flex-1">
          <div className={cn("h-1 rounded-full", i <= idx ? "bg-brand" : "bg-line")} />
          <p className={cn("mt-1.5 text-xs", i <= idx ? "text-ink" : "text-faint", i === idx && "font-semibold")}>{ORDER_STATUS[k].label}</p>
        </div>
      ))}
    </div>
  );
}

/** Nút lọc / chuyển tab dạng viên: đang chọn thì nền be đậm, còn lại chỉ có chữ. */
export function Chip({
  active,
  onClick,
  children,
  className,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] transition-colors disabled:cursor-not-allowed",
        active ? "bg-surface-active font-semibold text-ink" : "font-medium text-muted2 hover:bg-surface hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Thông báo trong trang

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="hsv-error">{message}</p>;
}

const ALERT_TONES = {
  danger: { box: "border-danger-line bg-danger-soft text-danger", icon: AlertCircle },
  warn: { box: "border-warn-line bg-warn-soft text-warn", icon: AlertTriangle },
  ok: { box: "border-ok-line bg-ok-soft text-ok", icon: CheckCircle2 },
};

/** Dải thông báo trong trang / form (lỗi lưu, cảnh báo dữ liệu…). */
export function FormAlert({ message, tone = "danger", className }: { message?: string | null; tone?: keyof typeof ALERT_TONES; className?: string }) {
  if (!message) return null;
  const t = ALERT_TONES[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-5", t.box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 whitespace-pre-line">{message}</p>
    </div>
  );
}

/** Lỗi khi tải dữ liệu: hiện nguyên văn error.message của API kèm nút thử lại. */
export function ErrorBox({ error, onRetry, className }: { error: ApiError; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("hsv-card flex flex-col items-center px-5 py-8 text-center", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircle className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">Không tải được dữ liệu</p>
      <p className="mt-1 max-w-[420px] whitespace-pre-line text-[13px] text-muted2">{error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="hsv-btn-secondary mt-4">
          Thử lại
        </button>
      )}
    </div>
  );
}

/** Trạng thái rỗng: biểu tượng, tiêu đề, mô tả ngắn và (nếu có) nút thao tác chính. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-muted2 ring-1 ring-line">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-[420px] text-[13px] text-muted2">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-active/70", className)} />;
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Bố cục trang

/** Đầu trang: tiêu đề + mô tả ngắn ở trái, nút thao tác chính ở phải. */
export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-7 flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-ink">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="max-w-[760px] text-xs text-muted2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Thẻ trắng bo góc; `flush` = nội dung tự lo khoảng đệm (bảng, danh sách). */
export function Card({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("hsv-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="hsv-card-title">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

/** Ô tìm kiếm có biểu tượng kính lúp. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="hsv-input pl-8"
      />
    </div>
  );
}

/**
 * Trang chi tiết / form toàn trang: nút quay lại + tiêu đề, nội dung chính bên trái và cột phải
 * (trạng thái, tổ chức…) khi có `aside`.
 */
export function DetailPage({
  title,
  parent,
  badge,
  meta,
  onBack,
  backLabel = "Quay lại danh sách",
  actions,
  aside,
  children,
}: {
  title: ReactNode;
  /** Tên trang danh sách (hiện cạnh nút quay lại), VD "Sản phẩm". */
  parent: string;
  badge?: ReactNode;
  meta?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  // Mở từ giữa danh sách dài → đưa khung nội dung (và trang, ở màn hình nhỏ) về đầu.
  useEffect(() => {
    document.getElementById("hsv-main")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="animate-hin">
      {/* Dải trên cùng: nút quay lại + tên mục cha ở trái, nút thao tác ở phải. */}
      <div className="mb-3 flex min-h-7 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-btn hover:bg-surface"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onBack} className="rounded text-[13px] font-semibold text-muted2 hover:text-ink">
          {parent}
        </button>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      <div className="mx-auto w-full max-w-[960px]">
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="hsv-page-title min-w-0 truncate">{title}</h1>
            {badge}
          </div>
          {meta && <p className="mt-0.5 text-xs text-muted2">{meta}</p>}
        </div>
        {aside ? (
          <div className="grid items-start gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex min-w-0 flex-col gap-4">{children}</div>
            <div className="hsv-aside flex min-w-0 flex-col">{aside}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">{children}</div>
        )}
      </div>
    </div>
  );
}

/** Thanh “Thay đổi chưa lưu” nổi ở trên cùng (đè lên thanh trên) với nút Bỏ / Lưu. */
export function SaveBar({
  message = "Thay đổi chưa lưu",
  note,
  onDiscard,
  onSave,
  saving,
  disabled,
  saveLabel = "Lưu",
  discardLabel = "Bỏ",
}: {
  message?: string;
  note?: ReactNode;
  onDiscard: () => void;
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
  saveLabel?: string;
  discardLabel?: string;
}) {
  return createPortal(
    <div role="region" aria-label="Lưu thay đổi" className="pointer-events-none fixed inset-x-0 top-2 z-[58] flex justify-center px-3 lg:left-[200px]">
      <div className="pointer-events-auto flex h-11 w-full max-w-[640px] animate-bar-in items-center gap-2 rounded-xl bg-brand pl-3.5 pr-2 text-white shadow-[0_8px_24px_rgba(0,0,0,.28)]">
        <AlertTriangle className="h-4 w-4 shrink-0 text-chrome-muted" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{message}</p>
        {note && <span className="hidden text-xs text-chrome-muted sm:inline">{note}</span>}
        <button type="button" onClick={onDiscard} disabled={saving} className="hsv-btn bg-white/10 text-white hover:bg-white/20">
          {discardLabel}
        </button>
        <button type="button" onClick={onSave} disabled={saving || disabled} className="hsv-btn bg-white font-semibold text-ink hover:bg-surface-active">
          {saving ? "Đang lưu…" : saveLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Phân trang: trang n (bắt đầu từ 1) ↔ skipCount = (n - 1) * pageSize. */
export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  const arrow = "hsv-btn-secondary w-7 px-0";
  return (
    <nav aria-label="Phân trang" className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
      <p className="text-xs text-muted2">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} trong {total}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Trang trước" className={arrow}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-faint">…</span>}
            <button
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "h-7 min-w-7 rounded-lg px-2 text-xs font-medium transition-colors",
                n === page ? "bg-surface-active font-semibold text-ink" : "text-muted2 hover:bg-surface-active/60"
              )}
            >
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Trang sau" className={arrow}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

/** Ngăn kéo bên phải cho các form ngắn (tài khoản, mật khẩu, phiếu nhập, ý định chatbot). */
export function Drawer({
  open,
  onClose,
  width,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width: number;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 right-0 top-0 z-[61] flex max-w-[96vw] animate-drawer-in flex-col bg-white shadow-drawer"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">{header}</div>
          <button onClick={onClose} aria-label="Đóng" className="hsv-btn-icon">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </div>
    </>
  );
}
