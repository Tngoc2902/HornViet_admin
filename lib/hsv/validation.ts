// Kiểm tra phía client cho phản hồi nhanh; backend vẫn validate lại và
// lỗi theo trường từ server (validationErrors) được ghép vào cùng form.

/** Di động Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx. */
export const PHONE_RE = /^(0|\+84)\d{9}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizePhone(value: string) {
  return value.replace(/\s/g, "");
}

export function isValidPhone(value: string) {
  return PHONE_RE.test(normalizePhone(value));
}

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

/** Tối thiểu 6 ký tự, có cả chữ và số. */
export function isStrongPassword(value: string) {
  return value.length >= 6 && /\d/.test(value) && /[a-zA-Z]/.test(value);
}

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

export function hasErrors(errors: FieldErrors) {
  return Object.values(errors).some(Boolean);
}
