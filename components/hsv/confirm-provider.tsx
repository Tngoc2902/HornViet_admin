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
          <div className="absolute inset-0 bg-black/45" onClick={() => close(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hsv-confirm-title"
            className="relative w-[420px] max-w-full animate-hin rounded-card bg-white p-[26px] shadow-[0_24px_64px_rgba(0,0,0,.25)]"
          >
            <p id="hsv-confirm-title" className="text-[17px] font-bold">
              {pending.title}
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-muted2">{pending.body}</p>
            <div className="mt-[22px] flex justify-end gap-2.5">
              <button onClick={() => close(false)} className="rounded-lg border border-line px-[18px] py-[11px] text-sm">
                Quay lại
              </button>
              <button
                ref={okRef}
                onClick={() => close(true)}
                className={`rounded-lg px-5 py-[11px] text-sm font-semibold text-white ${pending.danger ? "bg-danger" : "bg-navy"}`}
              >
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
