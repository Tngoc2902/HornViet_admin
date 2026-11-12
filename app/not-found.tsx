import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.svg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg" />
      <p className="text-xl font-semibold tracking-[-0.01em]">Không tìm thấy trang bạn cần</p>
      <p className="text-[13px] text-muted2">Đường dẫn có thể đã đổi hoặc trang không còn tồn tại.</p>
      <Link href="/" className="hsv-btn-primary mt-1">
        Về trang tổng quan
      </Link>
    </div>
  );
}
