export function loadLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function saveLocalStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // ignore write errors
  }
}

export function removeLocalStorage(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // ignore
  }
}

// ---------- Phiên đăng nhập
// sessionStorage: mất khi đóng tab / trình duyệt (mặc định). localStorage: chỉ khi người dùng chọn "Ghi nhớ đăng nhập".

function authStores(): Storage[] {
  if (typeof window === "undefined") return [];
  const list: Storage[] = [];
  try {
    list.push(window.sessionStorage);
  } catch {
    // trình duyệt chặn storage
  }
  try {
    list.push(window.localStorage);
  } catch {
    // trình duyệt chặn storage
  }
  return list;
}

/** Đọc mục phiên (ưu tiên phiên theo tab, sau đó phiên đã ghi nhớ). */
export function loadAuthItem(key: string): string | null {
  for (const store of authStores()) {
    try {
      const v = store.getItem(key);
      if (v !== null) return v;
    } catch {
      // bỏ qua
    }
  }
  return null;
}

/** Phiên hiện tại có đang được ghi nhớ (localStorage) không. */
export function isAuthItemPersistent(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === null && window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function saveAuthItem(key: string, value: string, persistent: boolean) {
  if (typeof window === "undefined") return;
  removeAuthItem(key);
  try {
    (persistent ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // bỏ qua: phiên chỉ sống trong bộ nhớ
  }
}

export function removeAuthItem(key: string) {
  for (const store of authStores()) {
    try {
      store.removeItem(key);
    } catch {
      // bỏ qua
    }
  }
}
