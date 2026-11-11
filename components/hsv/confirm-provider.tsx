"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  body: string;
  okLabel?: string;
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Hộp xác nhận dùng cho mọi thao tác hủy / xóa / khóa / đổi quyền. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hsv-confirm-title"
            className="relative w-[440px] max-w-full animate-hin overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.3)]"
          >
            <p id="hsv-confirm-title" className="border-b border-line bg-surface px-4 py-3 text-sm font-semibold">
              {pending.title}
            </p>
            <p className="px-4 py-4 text-[13px] leading-5 text-ink-2">{pending.body}</p>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button onClick={() => close(false)} className="hsv-btn-secondary">
                Quay lại
              </button>
              <button ref={okRef} onClick={() => close(true)} className={pending.danger ? "hsv-btn-danger" : "hsv-btn-primary"}>
                {pending.okLabel ?? "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
