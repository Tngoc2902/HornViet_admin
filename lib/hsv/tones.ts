export type Tones = [string, string, string];

/** Bảng màu sừng dùng cho ảnh giữ chỗ khi sản phẩm chưa có ảnh hoặc ảnh lỗi. */
export const PLACEHOLDER_TONES: Tones[] = [
  ["#d9c6a5", "#8b7254", "#4a3c2d"],
  ["#333333", "#6e5d4a", "#0f2a4a"],
  ["#e6d8bf", "#b89c78", "#7d6448"],
  ["#c7ad8a", "#7a5a3c", "#3d2c1f"],
  ["#2b241e", "#5a4a3a", "#8b7254"],
  ["#efe4d0", "#cbb593", "#9b8160"],
  ["#c7ad8a", "#8b7254", "#3d2c1f"],
];

export function tonesFor(seed: number): Tones {
  return PLACEHOLDER_TONES[Math.abs(seed) % PLACEHOLDER_TONES.length];
}
