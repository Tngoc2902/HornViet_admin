"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  ChevronRight,
  ChevronsUpDown,
  CornerDownLeft,
  ExternalLink,
  FolderTree,
  Gem,
  Headset,
  Home,
  KeyRound,
  Layers,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { ChangePasswordDrawer } from "@/components/hsv/change-password-drawer";
import { useConfirm } from "@/components/hsv/confirm-provider";
import { notify } from "@/components/hsv/ui";
import { useAuth } from "@/contexts/auth-context";
import { useApi } from "@/hooks/use-api";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { STORE_URL } from "@/lib/api/http";
import { chatSupportApi, statisticApi } from "@/lib/api/services";
import { OrderStatus } from "@/lib/api/types";
import { ORDERS_CHANGED } from "@/lib/hsv/events";
import { useRealtimeStatus } from "@/contexts/realtime-context";
import { initialOf, roleLabel } from "@/lib/hsv/format";
import { LEAVE_CONFIRM, unsavedChanges } from "@/lib/hsv/unsaved";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  title: string;
  icon: LucideIcon;
  adminOnly: boolean;
  /** Mục con: hiện thụt vào dưới mục cha (không có biểu tượng). */
  parent?: string;
  /** Tên nhóm hiện phía trên mục đầu tiên của nhóm. */
  section?: string;
};

// Menu render theo quyền: "Quản lý" = Nhân viên + Quản trị viên; Nhập kho, Người dùng & Thống kê chỉ Admin
// (giữ khớp với ADMIN_ONLY_PATHS trong lib/hsv/admin-routes.ts — dùng cho trang đăng nhập).
const ADMIN_NAV: NavItem[] = [
  { href: "/", label: "Tổng quan", title: "Tổng quan", icon: Home, adminOnly: false },
  { href: "/orders", label: "Đơn hàng", title: "Quản lý đơn hàng", icon: ShoppingCart, adminOnly: false },
  { href: "/products", label: "Sản phẩm", title: "Sản phẩm", icon: Package, adminOnly: false },
  { href: "/collections", label: "Bộ sưu tập", title: "Bộ sưu tập", icon: Layers, adminOnly: false, parent: "/products" },
  { href: "/categories", label: "Danh mục", title: "Quản lý danh mục", icon: FolderTree, adminOnly: false, parent: "/products" },
  { href: "/materials", label: "Nguyên liệu", title: "Nguyên liệu & nguồn gốc", icon: Gem, adminOnly: false, parent: "/products" },
  { href: "/inventory", label: "Nhập kho", title: "Nhập kho & giá vốn", icon: Warehouse, adminOnly: true, parent: "/products" },
  { href: "/support", label: "Hỗ trợ khách", title: "Hỗ trợ khách hàng", icon: Headset, adminOnly: false, section: "Khách hàng" },
  { href: "/chatbot", label: "Huấn luyện chatbot", title: "Huấn luyện chatbot", icon: Bot, adminOnly: false, section: "Khách hàng" },
  { href: "/statistics", label: "Thống kê", title: "Thống kê báo cáo", icon: BarChart3, adminOnly: true, section: "Quản trị" },
  { href: "/users", label: "Người dùng", title: "Quản lý người dùng", icon: Users, adminOnly: true, section: "Quản trị" },
];

const NAV_SECTIONS_KEY = "hsv-admin-nav-closed";

function loadClosedSections(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(NAV_SECTIONS_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

type SearchEntry = { href: string; label: string; hint: string; icon: LucideIcon };

/** Lối tắt hiện trong ô tìm kiếm (đều là đường dẫn có sẵn của các trang). */
const SHORTCUTS: SearchEntry[] = [
  { href: "/products?edit=new", label: "Thêm sản phẩm", hint: "Sản phẩm", icon: Plus },
  { href: `/orders?status=${OrderStatus.Pending}`, label: "Đơn chờ xử lý", hint: "Đơn hàng", icon: ShoppingCart },
  { href: `/orders?status=${OrderStatus.Shipping}`, label: "Đơn đang giao", hint: "Đơn hàng", icon: ShoppingCart },
  { href: "/products?warn=1", label: "Sản phẩm sắp hết hàng", hint: "Sản phẩm", icon: Package },
  { href: "/chatbot?tab=review", label: "Câu bot chưa hiểu", hint: "Huấn luyện chatbot", icon: Bot },
];

/** Bỏ dấu + chữ thường để gõ "san pham" vẫn tìm ra "Sản phẩm". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/**
 * Chuyển trang từ khung chung (menu, ô tìm nhanh): nếu form đang mở còn thay đổi chưa lưu thì hỏi lại trước,
 * vì thanh bên vẫn bấm được trong lúc đang sửa.
 */
function useGuardedNav() {
  const router = useRouter();
  const confirm = useConfirm();
  const navigate = async (href: string) => {
    if (unsavedChanges.pending && !(await confirm(LEAVE_CONFIRM))) return;
    router.push(href);
  };
  /** Gắn vào onClick của <Link>: chỉ chặn khi có thay đổi chưa lưu và là cú bấm trái thông thường. */
  const onLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!unsavedChanges.pending || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  };
  return { navigate, onLinkClick };
}

/** Ô tìm kiếm ở đầu thanh bên: gõ để nhảy nhanh tới một trang / chức năng (Ctrl K để đặt con trỏ). */
function QuickSearch({ entries }: { entries: SearchEntry[] }) {
  const { navigate } = useGuardedNav();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useOutsideClose(open, () => setOpen(false));

  const results = useMemo(() => {
    const k = fold(q.trim());
    return k ? entries.filter((e) => fold(`${e.label} ${e.hint}`).includes(k)) : entries;
  }, [q, entries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    void navigate(href);
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-chrome-muted" />
      <input
        ref={inputRef}
        value={q}
        role="combobox"
        aria-expanded={open}
        aria-controls="hsv-quick-search"
        aria-label="Tìm trang, chức năng"
        placeholder="Tìm kiếm"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            go(results[active].href);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-7 w-full rounded-lg bg-chrome-raised pl-8 pr-12 text-[13px] text-white outline-none transition-colors placeholder:text-chrome-muted hover:bg-[#404040] focus:bg-[#404040] focus:ring-1 focus:ring-white/40"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-chrome-muted">Ctrl K</span>
      {open && (
        <div
          id="hsv-quick-search"
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-[min(340px,calc(100vw-24px))] overflow-auto rounded-xl bg-white p-1.5 text-ink shadow-dropdown"
        >
          {results.length === 0 ? (
            <p className="px-3 py-5 text-center text-[13px] text-muted2">Không có trang nào khớp “{q.trim()}”.</p>
          ) : (
            results.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.href}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px]", i === active && "bg-surface-active")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted2" />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                  <span className="shrink-0 text-xs text-muted2">{r.hint}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, logout } = useAuth();
  const realtime = useRealtimeStatus();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const menuRef = useOutsideClose(menuOpen, () => setMenuOpen(false));
  const mainRef = useRef<HTMLElement>(null);
  const { onLinkClick } = useGuardedNav();
  // Nhóm menu ("Khách hàng", "Quản trị") nào đang thu gọn.
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>(loadClosedSections);

  const current = ADMIN_NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  const forbidden = !!current?.adminOnly && !isAdmin;

  const dashboard = useApi(() => statisticApi.getDashboard(), [pathname], !!session);
  const reloadDashboard = dashboard.reload;
  // Huy hiệu "Hỗ trợ khách": số hội thoại đang chờ + tin chưa đọc của mình, cập nhật theo sự kiện thời gian thực.
  const chatSummary = useApi(() => chatSupportApi.getSummary(), [], !!session);
  useRealtimeRefresh(["ChatConversationChanged"], chatSummary.reload, 600);

  // Chưa đăng nhập (hoặc phiên hết hạn / tài khoản bị khóa) → trang đăng nhập.
  useEffect(() => {
    if (!session) router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
  }, [session, router, pathname]);

  // Nhân viên vào trang chỉ dành cho Quản trị viên (VD đăng nhập lại bằng tài khoản Nhân viên với returnUrl cũ,
  // hoặc tài khoản vừa bị đổi vai trò) → về Tổng quan thay vì hiện trang "không có quyền".
  useEffect(() => {
    if (!session || !forbidden) return;
    notify("Chức năng này chỉ dành cho Quản trị viên — đã chuyển về Tổng quan");
    router.replace("/");
  }, [session, forbidden, router]);

  // Đổi trang: đóng menu và đưa khung nội dung (cuộn riêng) về đầu trang.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  // Trang đơn hàng phát sự kiện khi đổi trạng thái → cập nhật badge "Đơn hàng".
  useEffect(() => {
    const onChange = () => void reloadDashboard();
    window.addEventListener(ORDERS_CHANGED, onChange);
    return () => window.removeEventListener(ORDERS_CHANGED, onChange);
  }, [reloadDashboard]);

  const nav = useMemo(() => ADMIN_NAV.filter((n) => !n.adminOnly || isAdmin), [isAdmin]);
  // Menu dạng cây: nhóm (có tên hoặc không) → mục → mục con.
  const navGroups = useMemo(() => {
    const groups: { section?: string; items: { item: NavItem; children: NavItem[] }[] }[] = [];
    for (const item of nav.filter((n) => !n.parent)) {
      const entry = { item, children: nav.filter((c) => c.parent === item.href) };
      const last = groups[groups.length - 1];
      if (last && last.section === item.section) last.items.push(entry);
      else groups.push({ section: item.section, items: [entry] });
    }
    return groups;
  }, [nav]);

  // Mục đang mở dropdown = mục chứa trang hiện tại (chính nó hoặc mục cha của nó); các mục khác tự gập lại.
  const currentGroup = current ? (current.parent ?? current.href) : null;
  // Vào một trang nằm trong nhóm đang thu gọn → mở lại nhóm đó.
  const currentSection = current ? (current.section ?? ADMIN_NAV.find((n) => n.href === current.parent)?.section) : undefined;
  useEffect(() => {
    if (currentSection) setClosedSections((s) => (s[currentSection] ? { ...s, [currentSection]: false } : s));
  }, [currentSection]);

  // Nhớ nhóm nào đang thu gọn giữa các lần mở trang quản trị (chỉ là tùy chọn hiển thị, không phải dữ liệu).
  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(closedSections));
    } catch {}
  }, [closedSections]);

  const searchEntries = useMemo<SearchEntry[]>(
    () => [...nav.map((n) => ({ href: n.href, label: n.label, hint: n.title === n.label ? "Trang" : n.title, icon: n.icon })), ...SHORTCUTS],
    [nav]
  );

  if (!session) return null;

  const pending = dashboard.data?.pendingOrderCount ?? 0;
  const chatBadge = (chatSummary.data?.waitingCount ?? 0) + (chatSummary.data?.mineUnread ?? 0);
  const realtimeLabel = realtime === "connected" ? "Cập nhật trực tiếp" : realtime === "connecting" ? "Đang kết nối…" : "Mất kết nối trực tiếp";
  const realtimeDot = realtime === "connected" ? "bg-[#3ecf6e]" : realtime === "connecting" ? "bg-[#e0b252]" : "bg-[#6b6b6b]";
  const navItem = "flex h-7 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors";

  const badgeOf = (href: string) => (href === "/orders" ? pending : href === "/support" ? chatBadge : 0);
  const navBadge = (href: string, count: number) =>
    count > 0 && (
      <span className={cn("rounded-full px-1.5 text-[11px] font-semibold leading-[18px]", href === "/support" ? "bg-[#e5484d] text-white" : "bg-white/15 text-white")}>
        {count}
      </span>
    );
  /**
   * Một dòng menu; `child` = mục con trong dropdown (thụt vào, không có biểu tượng);
   * `expanded` = mục cha đang sổ mục con ra (chữ trắng dù trang hiện tại là một mục con).
   */
  const navLink = (n: NavItem, child = false, expanded?: boolean) => {
    const active = n === current;
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={(e) => onLinkClick(e, n.href)}
        aria-current={active ? "page" : undefined}
        aria-expanded={expanded}
        className={cn(
          navItem,
          child && "pl-[32px]",
          active
            ? "bg-chrome-active font-semibold text-white"
            : child
              ? "text-chrome-muted hover:bg-white/[.06] hover:text-chrome-text"
              : expanded
                ? "font-medium text-white hover:bg-white/[.06]"
                : "text-chrome-text hover:bg-white/[.06]"
        )}
      >
        {!child && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
        <span className="min-w-0 flex-1 truncate">{n.label}</span>
        {navBadge(n.href, badgeOf(n.href))}
      </Link>
    );
  };
  // Dropdown sổ xuống: hàng lưới co giãn 0fr ↔ 1fr để chiều cao chạy mượt; khi đóng thì ẩn hẳn khỏi phím Tab.
  const dropdownOuter = (open: boolean) => cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]");
  const dropdownInner = (open: boolean) =>
    cn(
      "flex min-h-0 flex-col gap-px overflow-hidden",
      open ? "visible opacity-100 [transition:opacity_.2s]" : "invisible opacity-0 [transition:opacity_.15s,visibility_0s_.2s]"
    );

  const brand = (
    <Link href="/" onClick={(e) => onLinkClick(e, "/")} className="flex h-8 items-center gap-2 rounded-lg px-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-md" />
      <span className="truncate text-[13px] font-semibold text-white">Hồn Sừng Việt</span>
    </Link>
  );

  const sidebar = (
    <div className="flex h-full flex-col px-2.5 pb-2 pt-2">
      <div className="hidden lg:block">{brand}</div>
      <div className="mb-2 mt-2">
        <QuickSearch entries={searchEntries} />
      </div>
      <nav aria-label="Menu quản trị" className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-none">
        {navGroups.map((g, gi) => {
          const closed = !!g.section && !!closedSections[g.section];
          const sectionBadge = g.items.reduce((sum, { item, children }) => sum + badgeOf(item.href) + children.reduce((s, c) => s + badgeOf(c.href), 0), 0);
          return (
            <div key={g.section ?? gi}>
              {g.section && (
                // Tên nhóm bấm được để thu gọn / mở cả nhóm; thu gọn thì hiện tổng số việc đang chờ của nhóm.
                <button
                  type="button"
                  onClick={() => setClosedSections((s) => ({ ...s, [g.section!]: !s[g.section!] }))}
                  aria-expanded={!closed}
                  className="mb-0.5 mt-3 flex h-6 w-full items-center gap-1 rounded-lg px-2 text-left text-xs text-chrome-muted transition-colors hover:text-chrome-text"
                >
                  {g.section}
                  <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", !closed && "rotate-90")} />
                  {closed && <span className="ml-auto">{navBadge("/support", sectionBadge)}</span>}
                </button>
              )}
              <div className={dropdownOuter(!closed)}>
                <div className={dropdownInner(!closed)}>
                  {g.items.map(({ item, children }) => {
                    if (children.length === 0) return navLink(item);
                    // Mục có mục con: vào trang của mục (hoặc của một mục con) thì các mục con sổ xuống bên dưới;
                    // sang mục khác thì tự gập lại.
                    const open = currentGroup === item.href;
                    return (
                      <div key={item.href}>
                        {navLink(item, false, open)}
                        <div className={dropdownOuter(open)}>
                          <div className={cn(dropdownInner(open), "pt-px")}>{children.map((c) => navLink(c, true))}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-px pt-2">
        <p className="flex items-center gap-2 px-2 py-1 text-xs text-chrome-muted" title="Đơn mới, trạng thái đơn và tồn kho được cập nhật tức thì">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", realtimeDot)} />
          {realtimeLabel}
        </p>
        {STORE_URL && (
          <a href={STORE_URL} target="_blank" rel="noreferrer" className={cn(navItem, "text-chrome-text hover:bg-white/[.06]")}>
            <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Xem cửa hàng
          </a>
        )}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(navItem, "w-full text-left text-chrome-text hover:bg-white/[.06]", menuOpen && "bg-white/[.06]")}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-[10px] font-semibold text-ink">{initialOf(session.name)}</span>
            <span className="min-w-0 flex-1 truncate">{session.name}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-chrome-muted" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[220px] rounded-xl bg-white p-1.5 text-ink shadow-dropdown">
              <div className="border-b border-line-2 px-2.5 pb-2 pt-1">
                <p className="truncate text-[13px] font-semibold">{session.name}</p>
                <p className="text-xs text-muted2">{roleLabel(session.roles)}</p>
              </div>
              <div className="pt-1.5">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setChangingPassword(true);
                  }}
                  className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] hover:bg-surface-active"
                >
                  <KeyRound className="h-4 w-4 text-muted2" />
                  Đổi mật khẩu
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    logout();
                    notify("Đã đăng xuất");
                    router.push("/login");
                  }}
                  className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-chrome">
      {/* Màn hình nhỏ: thanh trên cùng có nút mở menu; thanh bên trượt ra. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-1 bg-chrome px-2 lg:hidden">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg text-chrome-text hover:bg-white/10"
          aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {brand}
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 top-12 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute bottom-0 left-0 top-0 w-[240px] bg-chrome">{sidebar}</div>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[200px] lg:block">{sidebar}</aside>

      {/* Khung nội dung trắng bo góc, cuộn riêng bên trong khung tối. */}
      <div className="pt-12 lg:py-1 lg:pl-[200px] lg:pr-1">
        {/* relative: phần tử định vị tuyệt đối bên trong (bảng ẩn của biểu đồ, chú giải) nằm gọn trong khung cuộn này, không kéo dài cả trang. */}
        <main ref={mainRef} id="hsv-main" className="relative min-h-[calc(100vh-3rem)] bg-canvas px-4 pb-16 pt-3 lg:h-[calc(100vh-8px)] lg:min-h-0 lg:overflow-y-auto lg:rounded-xl">
          {/* Trang chỉ dành cho Quản trị viên: không render nội dung trong lúc chuyển về Tổng quan. */}
          {!forbidden && (
            <Suspense>
              <div className="animate-hin">{children}</div>
            </Suspense>
          )}
        </main>
      </div>
      {changingPassword && <ChangePasswordDrawer onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
