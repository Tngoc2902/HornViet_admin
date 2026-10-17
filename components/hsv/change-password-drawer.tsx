"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer, FieldError, FormAlert, notify } from "@/components/hsv/ui";
import { SESSION_TOAST_ID } from "@/lib/realtime";
import { useAuth } from "@/contexts/auth-context";
import { toApiError } from "@/lib/api/http";
import { profileApi } from "@/lib/api/services";
import { isStrongPassword, type FieldErrors } from "@/lib/hsv/validation";
import { cn } from "@/lib/utils";

type Key = "currentPassword" | "newPassword" | "confirmPassword";

const FIELDS: { key: Key; label: string; autoComplete: string; placeholder?: string }[] = [
  { key: "currentPassword", label: "Mật khẩu hiện tại *", autoComplete: "current-password" },
  { key: "newPassword", label: "Mật khẩu mới *", autoComplete: "new-password", placeholder: "Tối thiểu 6 ký tự, gồm chữ và số" },
  { key: "confirmPassword", label: "Nhập lại mật khẩu mới *", autoComplete: "new-password" },
];

/** Nhân viên / Quản trị viên tự đổi mật khẩu (POST Profile/ChangePassword). Đổi xong phải đăng nhập lại. */
export function ChangePasswordDrawer({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<Record<Key, string>>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<FieldErrors<Key>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: FieldErrors<Key> = {};
    if (!form.currentPassword) e.currentPassword = "Vui lòng nhập mật khẩu hiện tại";
    if (!isStrongPassword(form.newPassword)) e.newPassword = "Mật khẩu tối thiểu 6 ký tự, gồm cả chữ và số";
    if (form.confirmPassword !== form.newPassword) e.confirmPassword = "Mật khẩu nhập lại không khớp";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      await profileApi.changePassword(form.currentPassword, form.newPassword);
      // Backend thu hồi mọi phiên đăng nhập (kể cả phiên này) khi đổi mật khẩu → đăng nhập lại.
      logout();
      notify("Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.", SESSION_TOAST_ID);
      router.push("/login");
    } catch (err) {
      const api = toApiError(err);
      const f = api.fieldErrors() as FieldErrors<Key>;
      if (!Object.keys(f).length && /hiện tại/i.test(api.message)) f.currentPassword = api.message;
      setErrors(f);
      if (!Object.keys(f).length) setFormError(api.message);
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      width={460}
      onClose={onClose}
      header={<p className="font-serif text-[22px]">Đổi mật khẩu</p>}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <button onClick={onClose} className="px-[18px] py-[11px] text-sm">
            Hủy
          </button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-navy px-6 py-[11px] text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Đang lưu…" : "Đổi mật khẩu"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={formError} />
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`cp-${f.key}`} className="hsv-label">
              {f.label}
            </label>
            <input
              id={`cp-${f.key}`}
              type="password"
              autoComplete={f.autoComplete}
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className={cn("hsv-input h-11 text-sm", errors[f.key] && "hsv-input-error")}
            />
            <FieldError message={errors[f.key]} />
          </div>
        ))}
        <p className="rounded-lg bg-surface px-4 py-3 text-[12.5px] text-muted2">
          Sau khi đổi, mọi phiên đăng nhập của tài khoản này (kể cả trên máy khác) sẽ bị đăng xuất.
        </p>
      </div>
    </Drawer>
  );
}
