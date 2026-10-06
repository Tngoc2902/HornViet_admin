// HTTP client cho backend Hồn Sừng Việt (định dạng ABP).
// Mọi response có vỏ { result, success, error, unauthorizedRequest }: hàm request()
// trả thẳng `result`, lỗi được chuẩn hóa thành ApiError để UI hiển thị nguyên văn.

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

const TOKEN_KEY = "hsv-access-token";

export type ValidationError = { message: string; members?: string[] };

const DEFAULT_MESSAGES: Record<number, string> = {
  0: "Không kết nối được máy chủ.",
  401: "Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.",
  403: "Bạn không có quyền thực hiện chức năng này.",
  404: "Không tìm thấy dữ liệu.",
  409: "Dữ liệu vừa được cập nhật bởi giao dịch khác. Vui lòng tải lại và thử lại.",
  500: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: string | null = null,
    public validationErrors: ValidationError[] = []
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Lỗi theo trường: members[0] là tên trường camelCase trong body. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of this.validationErrors) {
      const member = v.members?.[0];
      if (!member) continue;
      const key = member.charAt(0).toLowerCase() + member.slice(1);
      out[key] ??= v.message;
    }
    return out;
  }

  /** Thông báo kèm chi tiết (VD danh sách sản phẩm thiếu hàng khi đặt đơn). */
  get fullMessage() {
    return this.details ? `${this.message}\n${this.details}` : this.message;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(0, e instanceof Error ? e.message : DEFAULT_MESSAGES[0]);
}

// ---------- token

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // bỏ qua: trình duyệt chặn storage thì phiên chỉ sống trong bộ nhớ
    }
    memoryToken = token;
  },
  clear() {
    memoryToken = null;
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // bỏ qua
    }
  },
};

let memoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Được gọi khi API trả 401 (token hết hạn hoặc tài khoản vừa bị khóa). */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

// ---------- request

type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** Mảng được lặp tên: categoryIds=1&categoryIds=2. */
function buildQuery(params?: Params) {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
    else q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

type RequestOptions = { params?: Params; body?: unknown; form?: FormData };

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = memoryToken ?? tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(API_BASE_URL + path + buildQuery(opts.params), { method, headers, body });
  } catch {
    throw new ApiError(0, DEFAULT_MESSAGES[0]);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    if (res.status === 401 || json?.unauthorizedRequest) {
      tokenStore.clear();
      unauthorizedHandler?.();
    }
    const err = json?.error;
    throw new ApiError(
      res.status,
      err?.message || DEFAULT_MESSAGES[res.status] || DEFAULT_MESSAGES[500],
      err?.details ?? null,
      err?.validationErrors ?? []
    );
  }
  return (json?.result ?? null) as T;
}

export const http = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string, params?: Params) => request<T>("DELETE", path, { params }),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { form }),
};

/** Ảnh trả về dạng tương đối /uploads/... → ghép với base URL của backend. */
export function assetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return API_BASE_URL + (path.startsWith("/") ? path : `/${path}`);
}
