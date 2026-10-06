import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-navy font-serif text-[22px] text-champagne">H</span>
      <p className="font-serif text-[26px]">Không tìm thấy trang bạn cần</p>
      <Link href="/" className="hsv-btn-primary h-11">
        Về trang tổng quan
      </Link>
    </div>
  );
}
