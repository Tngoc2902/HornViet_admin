import type { RoleName } from "@/lib/api/types";

/** Các trang chỉ dành cho Quản trị viên (Nhân viên không thấy trên menu và bị chuyển về Tổng quan). */
export const ADMIN_ONLY_PATHS = ["/inventory", "/users", "/statistics"];

export function isAdminOnlyPath(path: string) {
  return ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

/** Trang đích sau đăng nhập: Nhân viên không được quay lại trang chỉ dành cho Quản trị viên. */
export function landingFor(returnUrl: string, roles: RoleName[]) {
  return isAdminOnlyPath(returnUrl) && !roles.includes("Admin") ? "/" : returnUrl;
}
