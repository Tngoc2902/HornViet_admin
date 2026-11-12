/**
 * Cờ "đang có thay đổi chưa lưu" dùng chung giữa form (thanh Lưu / Bỏ) và khung trang:
 * form bật cờ khi đã sửa, khung trang đọc cờ để hỏi lại trước khi chuyển sang trang khác.
 */
let pending = 0;

export const unsavedChanges = {
  /** Bật cờ; trả về hàm tắt cờ (gọi khi form lưu xong / đóng / hết thay đổi). */
  mark() {
    pending++;
    return () => {
      pending = Math.max(0, pending - 1);
    };
  },
  get pending() {
    return pending > 0;
  },
};

export const LEAVE_CONFIRM = {
  title: "Rời trang mà chưa lưu?",
  body: "Các thay đổi chưa lưu sẽ bị bỏ.",
  okLabel: "Rời trang",
  danger: true,
} as const;
