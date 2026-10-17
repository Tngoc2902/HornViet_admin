"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { FieldError, FormAlert, notify } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { STORE_URL, toApiError } from "@/lib/api/http";
import { landingFor } from "@/lib/hsv/admin-routes";
import type { FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

/** Chỉ quay lại trang nội bộ của trang quản trị để tránh open redirect. */
function adminReturnUrl(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/login") ? v : "/";
}

function AdminLoginForm() {
  const { session, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const returnUrl = adminReturnUrl(params.get("returnUrl"));
  const [identifier, setIdentifier] = useState("");
  const [pass, setPass] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"identifier" | "pass" | "form">>({});
  const [busy, setBusy] = useState(false);

  // Đã đăng nhập bằng tài khoản quản trị → vào thẳng trang quản trị.
  useEffect(() => {
    if (session) router.replace(landingFor(returnUrl, session.roles));
  }, [session, router, returnUrl]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: typeof errors = {};
    if (!identifier.trim()) fe.identifier = "Vui lòng nhập tên đăng nhập hoặc email";
    if (!pass) fe.pass = "Vui lòng nhập mật khẩu";
    setErrors(fe);
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      const s = await login(identifier, pass);
      notify("Xin chào " + s.name);
      router.replace(landingFor(returnUrl, s.roles));
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors();
      setErrors({
        identifier: f.userNameOrEmailAddress,
        pass: f.password,
        form: f.userNameOrEmailAddress || f.password ? undefined : api.message,
      });
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4 py-12">
      <div className="w-full max-w-[420px] animate-hin">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-navy font-serif text-lg text-white">H</span>
          <div className="leading-tight">
            <p className="font-serif text-xl">Hồn Sừng Việt</p>
            <p className="mt-0.5 text-xs text-subtle">Trang quản trị</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="hsv-card p-8 shadow-card">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-gold" />
            <h1 className="text-[19px] font-bold uppercase tracking-[0.05em]">Đăng nhập quản trị</h1>
          </div>
          <p className="mt-2 text-[13.5px] text-muted2">Dành cho Nhân viên và Quản trị viên của cửa hàng.</p>

          {errors.form && (
            <div className="mt-4">
              <FormAlert message={errors.form} />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="al-user" className="hsv-label">
                Tên đăng nhập hoặc email
              </label>
              <input
                id="al-user"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoFocus
                className={cn("hsv-input", errors.identifier && "hsv-input-error")}
              />
              <FieldError message={errors.identifier} />
            </div>
            <div>
              <label htmlFor="al-pass" className="hsv-label">
                Mật khẩu
              </label>
              <input
                id="al-pass"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
                className={cn("hsv-input", errors.pass && "hsv-input-error")}
              />
              <FieldError message={errors.pass} />
            </div>
            <button type="submit" disabled={busy} className="hsv-btn-primary mt-1 h-[50px] text-[15px]">
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </div>

          <p className="mt-5 text-center text-[13px] text-subtle">
            Quên mật khẩu? Liên hệ Quản trị viên để được đặt lại.
          </p>
        </form>

        {STORE_URL && (
          <p className="mt-5 text-center text-[13px] text-subtle">
            <a href={STORE_URL} className="font-semibold text-ink-2 hover:text-navy">
              ← Về cửa hàng
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
