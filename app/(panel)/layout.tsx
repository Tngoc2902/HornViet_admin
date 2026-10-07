"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BarChart3, FolderTree, Gem, LayoutGrid, Menu, Package, ShoppingCart, Users, X } from "lucide-react";
import { ChangePasswordDrawer } from "@/components/hsv/change-password-drawer";
import { notify } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { statisticApi } from "@/lib/api/services";
import { ORDERS_CHANGED } from "@/lib/hsv/events";
import { roleLabel } from "@/lib/hsv/format";
import { cn } from "@/lib/utils";

const STORE_URL = process.env.NEXT_PUBLIC_STORE_URL || "http://localhost:3000";

// Menu render theo quyền: "Quản lý" = Nhân viên + Quản trị viên; Người dùng & Thống kê chỉ Admin.
const ADMIN_NAV = [
  { href: "/", label: "Tổng quan", title: "Tổng quan", icon: LayoutGrid, adminOnly: false },
  { href: "/categories", label: "Danh mục", title: "Quản lý danh mục", icon: FolderTree, adminOnly: false },
  { href: "/materials", label: "Nguyên liệu", title: "Nguyên liệu & nguồn gốc", icon: Gem, adminOnly: false },
  { href: "/products", label: "Sản phẩm & biến thể", title: "Sản phẩm & biến thể", icon: Package, adminOnly: false },
  { href: "/orders", label: "Đơn hàng", title: "Quản lý đơn hàng", icon: ShoppingCart, adminOnly: false },
  { href: "/users", label: "Người dùng", title: "Quản lý người dùng", icon: Users, adminOnly: true },
  { href: "/statistics", label: "Thống kê", title: "Thống kê báo cáo", icon: BarChart3, adminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const current = ADMIN_NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  const forbidden = !!current?.adminOnly && !isAdmin;

  const dashboard = useApi(() => statisticApi.getDashboard(), [pathname], !!session);
  const reloadDashboard = dashboard.reload;

  // Chưa đăng nhập (hoặc phiên hết hạn / tài khoản bị khóa) → trang đăng nhập.
  useEffect(() => {
    if (!session) router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
  }, [session, router, pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Trang đơn hàng phát sự kiện khi đổi trạng thái → cập nhật badge "Đơn hàng".
  useEffect(() => {
    const onChange = () => void reloadDashboard();
    window.addEventListener(ORDERS_CHANGED, onChange);
    return () => window.removeEventListener(ORDERS_CHANGED, onChange);
  }, [reloadDashboard]);

  if (!session) return null;

  const pending = dashboard.data?.pendingOrderCount ?? 0;
  const nav = ADMIN_NAV.filter((n) => !n.adminOnly || isAdmin);

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-line bg-surface-2 px-3.5 py-[22px]">
      <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-[22px]">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-navy font-serif text-[15px] text-white">H</span>
        <div className="leading-tight">
          <p className="font-serif text-[17px]">Hồn Sừng Việt</p>
          <p className="mt-0.5 text-[11px] text-subtle">Trang quản trị</p>
        </div>
      </Link>
      <nav className="flex flex-col gap-0.5">
        {nav.map((n) => {
          const active = n === current;
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-card px-3 py-[11px] text-sm",
                active ? "bg-surface-active font-semibold text-navy" : "font-medium text-[#5c5348] hover:bg-surface"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="flex-1">{n.label}</span>
              {n.href === "/orders" && pending > 0 && (
                <span className="rounded-lg bg-gold px-2 py-0.5 text-[11px] font-bold text-white">{pending}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line px-2.5 pt-4">
        <p className="text-[13.5px] font-semibold">{session.name}</p>
        <p className="mt-0.5 text-xs font-semibold text-gold">{roleLabel(session.roles)}</p>
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
          <a href={STORE_URL} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-ink-2">
            Xem cửa hàng
          </a>
          <button onClick={() => setChangingPassword(true)} className="text-[12.5px] font-semibold text-ink-2">
            Đổi mật khẩu
          </button>
          <button
            onClick={() => {
              logout();
              notify("Đã đăng xuất");
              router.push("/login");
            }}
            className="text-[12.5px] font-semibold text-danger"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute bottom-0 left-0 top-0 w-[260px]">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0 px-4 pb-[60px] pt-[30px] sm:px-9">
        <div className="mb-[22px] flex items-center gap-3">
          <button className="lg:hidden" aria-label="Mở menu" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <h1 className="text-[22px] font-bold uppercase tracking-[0.05em]">
            {forbidden ? "Không có quyền truy cập" : (current?.title ?? "Quản trị")}
          </h1>
        </div>
        {forbidden ? (
          <div className="rounded-card border border-dashed border-line-3 px-6 py-20 text-center">
            <p className="text-base font-semibold">Chức năng này chỉ dành cho Quản trị viên</p>
            <Link href="/" className="mt-4 inline-block text-sm font-semibold text-gold">
              Về trang tổng quan →
            </Link>
          </div>
        ) : (
          <Suspense>
            <div className="animate-hin">{children}</div>
          </Suspense>
        )}
      </div>
      {changingPassword && <ChangePasswordDrawer onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
