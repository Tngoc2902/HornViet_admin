"use client";

// Dùng chung cho repo cửa hàng và repo quản trị (file giống nhau ở cả hai repo, như lib/api).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FieldError, FormAlert, notify } from "@/components/hsv/ui";
import { toApiError } from "@/lib/api/http";
import { authApi } from "@/lib/api/services";
import { isStrongPassword, isValidEmail, type FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

/** Khớp AppConsts.PasswordResetCodeLifetimeSeconds / PasswordResetResendSeconds ở backend. */
const CODE_SECONDS = 60;
const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;

function BackToLogin() {
  return (
    <p className="text-center text-[13.5px] text-muted2">
      <Link href="/login" className="font-semibold text-gold">
        ← Quay lại đăng nhập
      </Link>
    </p>
  );
}

type Step = "email" | "code" | "password";
type PasswordKey = "newPassword" | "confirmPassword";

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Quên mật khẩu, ba bước trên cùng một trang:
 * 1. nhập email → backend gửi mã 6 số (hiệu lực 60 giây);
 * 2. nhập mã → backend trả "vé" dùng một lần;
 * 3. nhập mật khẩu mới → về trang đăng nhập.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [passwords, setPasswords] = useState<Record<PasswordKey, string>>({ newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<"email" | "code" | PasswordKey>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  // Thời điểm gửi mã gần nhất; đồng hồ đếm ngược tính từ đó.
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "code") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [step, sentAt]);

  const elapsed = sentAt ? Math.max(0, Math.floor((now - sentAt) / 1000)) : 0;
  const remaining = Math.max(0, CODE_SECONDS - elapsed);
  const resendIn = Math.max(0, RESEND_SECONDS - elapsed);
  const expired = step === "code" && sentAt > 0 && remaining === 0;

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = email.trim();
    if (!isValidEmail(value)) {
      setErrors({ email: "Email không hợp lệ" });
      return;
    }
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      await authApi.forgotPassword(value);
      setEmail(value);
      setCode("");
      setSentAt(Date.now());
      setNow(Date.now());
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors();
      if (f.emailAddress) setErrors({ email: f.emailAddress });
      else setFormError(api.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setErrors({ code: `Mã gồm ${CODE_LENGTH} chữ số` });
      return;
    }
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const r = await authApi.verifyResetCode(email, code);
      setTicket(r.resetToken);
      setStep("password");
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors();
      if (f.code) setErrors({ code: f.code });
      else setFormError(api.message);
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: FieldErrors<PasswordKey> = {};
    if (!isStrongPassword(passwords.newPassword)) fe.newPassword = "Mật khẩu tối thiểu 6 ký tự, gồm cả chữ và số";
    if (passwords.confirmPassword !== passwords.newPassword) fe.confirmPassword = "Mật khẩu nhập lại không khớp";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      await authApi.resetPassword(ticket, passwords.newPassword);
      notify("Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.");
      router.replace("/login");
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors();
      if (f.newPassword) {
        setErrors({ newPassword: f.newPassword });
      } else if (/hết hạn/i.test(api.message)) {
        // Vé hết hạn (quá 10 phút) hoặc đã dùng: làm lại từ đầu.
        setTicket("");
        setStep("email");
        setFormError(api.message);
      } else {
        setFormError(api.message);
      }
      setBusy(false);
    }
  };

  if (step === "email")
    return (
      <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
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
            className={cn("hsv-input", errors.email && "hsv-input-error")}
          />
          <FieldError message={errors.email} />
        </div>
        <button type="submit" disabled={busy} className="hsv-btn-primary mt-1 h-[50px] text-[15px]">
          {busy ? "Đang gửi…" : "Gửi mã xác nhận"}
        </button>
        <BackToLogin />
      </form>
    );

  if (step === "code")
    return (
      <form onSubmit={verifyCode} noValidate className="flex flex-col gap-4">
        <FormAlert
          tone={expired ? "warn" : "ok"}
          message={
            expired
              ? "Mã xác nhận đã hết hạn. Hãy bấm “Gửi lại mã” để nhận mã mới."
              : `Nếu ${email} đã đăng ký tài khoản, chúng tôi vừa gửi mã xác nhận ${CODE_LENGTH} số tới email này.\nHãy kiểm tra cả thư mục Thư rác (Spam).`
          }
        />
        <FormAlert message={formError} />
        <div>
          <label htmlFor="fp-code" className="hsv-label">
            Mã xác nhận
          </label>
          <input
            id="fp-code"
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            placeholder="••••••"
            disabled={expired}
            className={cn("hsv-input text-center text-[22px] font-semibold tracking-[0.4em]", errors.code && "hsv-input-error")}
          />
          <FieldError message={errors.code} />
          <p className={cn("mt-2 text-center text-[13px]", expired ? "text-danger" : remaining <= 10 ? "text-warn" : "text-subtle")}>
            {expired ? "Mã đã hết hạn" : `Mã còn hiệu lực ${formatClock(remaining)}`}
          </p>
        </div>
        <button type="submit" disabled={busy || expired || code.length !== CODE_LENGTH} className="hsv-btn-primary mt-1 h-[50px] text-[15px]">
          {busy ? "Đang kiểm tra…" : "Xác nhận"}
        </button>
        <button
          type="button"
          onClick={() => sendCode()}
          disabled={busy || resendIn > 0}
          className="h-[44px] rounded-lg border border-line-3 bg-white text-[14px] font-semibold text-navy transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resendIn > 0 ? `Gửi lại mã sau ${resendIn} giây` : "Gửi lại mã"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setErrors({});
            setFormError("");
          }}
          className="text-[13.5px] font-semibold text-ink-2"
        >
          Dùng email khác
        </button>
        <BackToLogin />
      </form>
    );

  const fields: { key: PasswordKey; label: string; placeholder?: string }[] = [
    { key: "newPassword", label: "Mật khẩu mới", placeholder: "Tối thiểu 6 ký tự, gồm chữ và số" },
    { key: "confirmPassword", label: "Nhập lại mật khẩu mới" },
  ];

  return (
    <form onSubmit={resetPassword} noValidate className="flex flex-col gap-4">
      <FormAlert tone="ok" message="Xác nhận thành công. Hãy đặt mật khẩu mới cho tài khoản của bạn." />
      <FormAlert message={formError} />
      {fields.map((f, i) => (
        <div key={f.key}>
          <label htmlFor={`rp-${f.key}`} className="hsv-label">
            {f.label}
          </label>
          <input
            id={`rp-${f.key}`}
            type="password"
            value={passwords[f.key]}
            onChange={(e) => setPasswords({ ...passwords, [f.key]: e.target.value })}
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
    </form>
  );
}

/**
 * Trang /reset-password cũ (liên kết trong email) không còn dùng: luồng mới nhập mã ngay tại /forgot-password.
 * Giữ trang để các liên kết đã gửi từ trước dẫn người dùng về đúng chỗ thay vì lỗi 404.
 */
export function ResetPasswordForm() {
  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="warn" message="Cách đặt lại mật khẩu đã đổi: bạn sẽ nhận mã xác nhận 6 số qua email thay vì liên kết." />
      <Link href="/forgot-password" className="hsv-btn-primary flex h-[50px] items-center justify-center text-[15px]">
        Lấy mã xác nhận
      </Link>
      <BackToLogin />
    </div>
  );
}
