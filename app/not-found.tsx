import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.svg" alt="" width={46} height={46} className="h-[46px] w-[46px] shrink-0" />
      <p className="font-serif text-[26px]">Không tìm thấy trang bạn cần</p>
      <Link href="/" className="hsv-btn-primary h-11">
        Về trang tổng quan
      </Link>
    </div>
  );
}
