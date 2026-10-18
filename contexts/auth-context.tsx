"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, setUnauthorizedHandler, tokenStore } from "@/lib/api/http";
import { authApi } from "@/lib/api/services";
import type { RoleName } from "@/lib/api/types";
import { loadAuthItem, removeAuthItem, removeLocalStorage, saveAuthItem } from "@/lib/storage";

const SESSION_KEY = "hsv-admin-session";

export type Session = {
  userId: number;
  userName: string;
  name: string;
  roles: RoleName[];
  /** epoch ms — token hết hạn sau expireInSeconds (24 giờ). */
  expiresAt: number;
};

type AuthValue = {
  /** Phiên của Nhân viên / Quản trị viên; trang quản trị không giữ phiên Khách hàng. */
  session: Session | null;
  isAdmin: boolean;
  /** Đăng nhập qua AuthenticateAdmin; tài khoản Khách hàng bị server từ chối (400) và không lưu phiên. */
  login: (identifier: string, password: string) => Promise<Session>;
  logout: () => void;
};

export const NOT_STAFF_MESSAGE = "Tài khoản không có quyền truy cập trang quản trị.";

const AuthContext = createContext<AuthValue | null>(null);

export function isStaffRoles(roles: RoleName[]) {
  return roles.includes("Admin") || roles.includes("Staff");
}

// Trang quản trị không ghi nhớ đăng nhập: phiên chỉ sống trong tab (sessionStorage), đóng tab / trình duyệt là đăng xuất.
// Phiên cũ lưu ở localStorage (trước khi đổi) bị xóa luôn để không còn "đăng nhập vĩnh viễn".
const LEGACY_TOKEN_KEY = "hsv-access-token";

function readSession(): Session | null {
  try {
    const raw = loadAuthItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  if (tokenStore.isPersistent()) {
    removeLocalStorage(LEGACY_TOKEN_KEY);
    removeLocalStorage(SESSION_KEY);
  }
  const s = readSession();
  if (!s || !tokenStore.get() || s.expiresAt <= Date.now() || !isStaffRoles(s.roles)) {
    tokenStore.clear();
    removeAuthItem(SESSION_KEY);
    return null;
  }
  return s;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession);

  const persist = useCallback((s: Session | null) => {
    setSession(s);
    if (s) saveAuthItem(SESSION_KEY, JSON.stringify(s), false);
    else removeAuthItem(SESSION_KEY);
  }, []);

  const logout = useCallback(() => {
    // JWT không lưu phiên phía server: chỉ cần xóa token phía trình duyệt.
    tokenStore.clear();
    persist(null);
  }, [persist]);

  // 401 (hết hạn / bị khóa) → xóa phiên; layout tự chuyển về /login.
  useEffect(() => {
    setUnauthorizedHandler(() => persist(null));
    return () => setUnauthorizedHandler(null);
  }, [persist]);

  // Tự đăng xuất đúng lúc token hết hạn.
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(logout, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [session, logout]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const r = await authApi.authenticate(identifier.trim(), password);
      // Server đã chặn tài khoản Khách hàng; vẫn kiểm tra lại để không bao giờ lưu phiên không phải quản trị.
      if (!isStaffRoles(r.roles ?? [])) throw new ApiError(403, NOT_STAFF_MESSAGE);
      tokenStore.set(r.accessToken, false);
      const s: Session = {
        userId: r.userId,
        userName: r.userName,
        name: r.name,
        roles: r.roles ?? [],
        expiresAt: Date.now() + r.expireInSeconds * 1000,
      };
      persist(s);
      return s;
    },
    [persist]
  );

  const value = useMemo<AuthValue>(
    () => ({ session, isAdmin: session?.roles.includes("Admin") ?? false, login, logout }),
    [session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
