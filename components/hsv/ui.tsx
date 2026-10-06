"use client";

import { ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { assetUrl, type ApiError } from "@/lib/api/http";
import type { OrderStatus } from "@/lib/api/types";
import { gradient, ORDER_FLOW, ORDER_STATUS } from "@/lib/hsv/format";
import { tonesFor } from "@/lib/hsv/tones";

/** Toast đen ở đáy giữa màn hình, tự ẩn sau 2.6s. */
export function notify(message: string) {
  toast(message);
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

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const m = ORDER_STATUS[status];
  return (
    <span
      className={cn("inline-block whitespace-nowrap rounded-lg border px-2.5 py-[3px] text-xs font-semibold", className)}
      style={{ color: m.fg, background: m.bg, borderColor: m.bd }}
    >
      {m.label}
    </span>
  );
}

export function OrderProgress({ status }: { status: OrderStatus }) {
  const idx = ORDER_FLOW.indexOf(status);
  if (idx < 0) return null;
  return (
    <div className="flex gap-2.5">
      {ORDER_FLOW.map((k, i) => (
        <div key={k} className="flex-1">
          <div className={cn("h-1 rounded-lg", i <= idx ? "bg-navy" : "bg-line")} />
          <p className={cn("mt-[7px] text-[12.5px]", i <= idx ? "text-navy" : "text-faint", i === idx && "font-semibold")}>
            {ORDER_STATUS[k].label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Nút chọn dạng chip (lọc, sắp xếp, vai trò…). */
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
        "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
        active ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-2 hover:border-navy/40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn("block h-4 w-4 shrink-0 rounded-full bg-white", checked ? "border-[5px] border-navy" : "border border-line-3")}
    />
  );
}

export function QtyStepper({
  value,
  onDec,
  onInc,
  size = "md",
  disabled,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const btn = size === "lg" ? "h-[50px] w-11 text-lg" : "h-9 w-9 text-base";
  return (
    <div className={cn("flex items-center rounded-lg border border-line bg-white", disabled && "opacity-60")}>
      <button type="button" aria-label="Giảm" onClick={onDec} disabled={disabled} className={cn(btn, "text-ink-2")}>
        −
      </button>
      <span className="min-w-[28px] text-center text-[15px] font-semibold">{value}</span>
      <button type="button" aria-label="Tăng" onClick={onInc} disabled={disabled} className={cn(btn, "text-ink-2")}>
        +
      </button>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="hsv-error">{message}</p>;
}

export function FormAlert({ message, tone = "danger" }: { message?: string | null; tone?: "danger" | "warn" }) {
  if (!message) return null;
  return (
    <p
      className={cn(
        "whitespace-pre-line rounded-card border px-3.5 py-2.5 text-[13.5px] leading-relaxed",
        tone === "danger" ? "border-danger-line bg-danger-soft text-danger" : "border-warn-line bg-warn-soft text-warn"
      )}
    >
      {message}
    </p>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-[#cfd6df] bg-white px-6 py-20 text-center">
      <p className="font-serif text-[22px]">{title}</p>
      {desc && <p className="mt-2 text-sm text-subtle">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Lỗi khi tải dữ liệu: hiện nguyên văn error.message của API kèm nút thử lại. */
export function ErrorBox({ error, onRetry, className }: { error: ApiError; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("rounded-card border border-danger-line bg-danger-soft px-5 py-6 text-center", className)}>
      <p className="whitespace-pre-line text-sm font-medium text-danger">{error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg border border-danger-line bg-white px-4 py-2 text-[13px] font-semibold text-danger">
          Thử lại
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-surface", className)} />;
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

/** Phân trang: trang n (bắt đầu từ 1) ↔ skipCount = (n - 1) * pageSize. */
export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - nums[i - 1] > 1 && <span className="text-faint">…</span>}
          <button
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              "h-10 min-w-10 rounded-full border px-3 text-sm font-semibold",
              n === page ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-2"
            )}
          >
            {n}
          </button>
        </span>
      ))}
    </div>
  );
}

/** Ngăn kéo bên phải (form sản phẩm 640px, chi tiết đơn 520px). */
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
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-[rgba(31,26,21,.35)]" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed bottom-0 right-0 top-0 z-[61] flex max-w-[96vw] animate-drawer-in flex-col bg-white shadow-drawer"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">{header}</div>
          <button onClick={onClose} aria-label="Đóng" className="text-subtle hover:text-navy">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </>
  );
}
