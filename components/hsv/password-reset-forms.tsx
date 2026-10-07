"use client";

// Dùng chung cho repo cửa hàng và repo quản trị (file giống nhau ở cả hai repo, như lib/api).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldError, FormAlert, notify } from "@/components/hsv/ui";
import { toApiError } from "@/lib/api/http";
import { authApi } from "@/lib/api/services";
import { isStrongPassword, isValidEmail, type FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

/** Khớp AppConsts.PasswordResetResendSeconds và PasswordResetTokenLifetimeMinutes ở backend. */
const RESEND_SECONDS = 60;
const LINK_LIFETIME_MINUTES = 30;

function BackToLogin() {
  return (
    <p className="text-center text-[13.5px] text-muted2">
      <Link href="/login" className="font-semibold text-gold">
        ← Quay lại đăng nhập
      </Link>
    </p>
  );
}

/** Bước 1: nhập email → backend gửi email chứa link /reset-password?token=... */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError("Email không hợp lệ");
      return;
    }
    setError(undefined);
    setFormError("");
    setBusy(true);
    try {
      await authApi.forgotPassword(value);
      setSentTo(value);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors();
      if (f.emailAddress) setError(f.emailAddress);
      else setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert
          tone="ok"
          message={
            `Nếu ${sentTo} đã đăng ký tài khoản, chúng tôi vừa gửi email chứa liên kết đặt lại mật khẩu.\n` +
            `Liên kết có hiệu lực trong ${LINK_LIFETIME_MINUTES} phút. Hãy kiểm tra cả thư mục Thư rác (Spam).`
          }
        />
        <FormAlert message={formError} />
        <button type="button" onClick={() => send()} disabled={busy || cooldown > 0} className="hsv-btn-primary h-[50px] text-[15px]">
          {busy ? "Đang gửi…" : cooldown > 0 ? `Gửi lại sau ${cooldown} giây` : "Gửi lại email"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setCooldown(0);
          }}
          className="text-[13.5px] font-semibold text-ink-2"
        >
          Dùng email khác
        </button>
        <BackToLogin />
      </div>
    );
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <div>
        <label htmlFor="fp-email" className="hsv-label">
          Email đã đăng ký
        </label>
        <input
          id="fp-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ban@email.com"
          autoComplete="email"
          autoFocus
          className={cn("hsv-input", error && "hsv-input-error")}
        />
        <FieldError message={error} />
      </div>
      <button type="submit" disabled={busy} className="hsv-btn-primary mt-1 h-[50px] text-[15px]">
        {busy ? "Đang gửi…" : "Gửi liên kết đặt lại"}
      </button>
      <BackToLogin />
    </form>
  );
}

type ResetKey = "newPassword" | "confirmPassword";

/** Bước 2: mở từ link trong email (?token=...) → đặt mật khẩu mới → về trang đăng nhập. Cần bọc trong <Suspense>. */
export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token")?.trim() ?? "";
  const [form, setForm] = useState<Record<ResetKey, string>>({ newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<ResetKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert message="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới." />
        <Link href="/forgot-password" className="hsv-btn-primary flex h-[50px] items-center justify-center text-[15px]">
          Yêu cầu liên kết mới
        </Link>
        <BackToLogin />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: FieldErrors<ResetKey> = {};
    if (!isStrongPassword(form.newPassword)) fe.newPassword = "Mật khẩu tối thiểu 6 ký tự, gồm cả chữ và số";
    if (form.confirmPassword !== form.newPassword) fe.confirmPassword = "Mật khẩu nhập lại không khớp";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      await authApi.resetPassword(token, form.newPassword);
      notify("Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.");
      router.replace("/login");
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors() as FieldErrors<ResetKey>;
      setErrors({ newPassword: f.newPassword });
      if (!f.newPassword) setFormError(api.message);
      setBusy(false);
    }
  };

  const fields: { key: ResetKey; label: string; placeholder?: string }[] = [
    { key: "newPassword", label: "Mật khẩu mới", placeholder: "Tối thiểu 6 ký tự, gồm chữ và số" },
    { key: "confirmPassword", label: "Nhập lại mật khẩu mới" },
  ];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      {fields.map((f, i) => (
        <div key={f.key}>
          <label htmlFor={`rp-${f.key}`} className="hsv-label">
            {f.label}
          </label>
          <input
            id={`rp-${f.key}`}
            type="password"
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            autoComplete="new-password"
            autoFocus={i === 0}
            className={cn("hsv-input", errors[f.key] && "hsv-input-error")}
          />
          <FieldError message={errors[f.key]} />
        </div>
      ))}
      <button type="submit" disabled={busy} className="hsv-btn-primary mt-1 h-[50px] text-[15px]">
        {busy ? "Đang lưu…" : "Đặt mật khẩu mới"}
      </button>
      <p className="text-center text-[13.5px] text-muted2">
        Liên kết hết hạn?{" "}
        <Link href="/forgot-password" className="font-semibold text-gold">
          Yêu cầu liên kết mới
        </Link>
      </p>
    </form>
  );
}
