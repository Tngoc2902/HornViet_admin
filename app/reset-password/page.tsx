import { Suspense } from "react";
import { KeyRound } from "lucide-react";
import { ResetPasswordForm } from "@/components/hsv/password-reset-forms";

export default function AdminResetPasswordPage() {
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

        <div className="hsv-card p-8 shadow-card">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-gold" />
            <h1 className="text-[19px] font-bold uppercase tracking-[0.05em]">Đặt lại mật khẩu</h1>
          </div>
          <p className="mt-2 text-[13.5px] text-muted2">Nhập mật khẩu mới cho tài khoản của bạn.</p>
          <div className="mt-6">
            <Suspense>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
