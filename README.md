# Hồn Sừng Việt — Trang quản trị

Frontend phân hệ quản trị (Nhân viên, Quản trị viên) của website Hồn Sừng Việt. Trang cửa hàng cho khách hàng nằm ở repo riêng; cả hai gọi chung backend `Website.Api`.

Công nghệ: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS.

## Chạy dự án

```bash
npm install
cp .env.example .env.local   # sửa địa chỉ backend nếu cần
npm run dev                  # http://localhost:3001
```

Backend phải đang chạy và có `http://localhost:3001` trong `App:CorsOrigins` (`Website.Api/appsettings.json`), nếu không mọi lời gọi API bị trình duyệt chặn.

| Biến | Ý nghĩa | Mặc định dev |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Địa chỉ backend | `http://localhost:21021` |
| `NEXT_PUBLIC_STORE_URL` | Địa chỉ trang cửa hàng (nút "Xem cửa hàng") | `http://localhost:3000` |

## Màn hình

| Đường dẫn | Màn hình | Quyền |
| --- | --- | --- |
| `/login` | Đăng nhập qua `POST /api/TokenAuth/AuthenticateAdmin` (server chỉ cấp token cho Nhân viên / Quản trị viên) | Công khai |
| `/forgot-password` | Quên mật khẩu: nhập email, backend gửi link đặt lại (hiệu lực 30 phút, dùng một lần) | Công khai |
| `/reset-password?token=` | Đặt mật khẩu mới từ link trong email | Công khai |
| `/` | Tổng quan | Nhân viên, Quản trị viên |
| `/categories` | Danh mục | Nhân viên, Quản trị viên |
| `/materials` | Nguyên liệu & nguồn gốc | Nhân viên, Quản trị viên |
| `/products` | Sản phẩm & biến thể | Nhân viên, Quản trị viên |
| `/orders` | Đơn hàng | Nhân viên, Quản trị viên |
| `/users` | Người dùng: tạo tài khoản, đổi vai trò, khóa / mở khóa, đặt lại mật khẩu | Quản trị viên |
| `/inventory` | Nhập kho & giá vốn: giá vốn bình quân, giá trị tồn, lãi / sản phẩm; tạo phiếu nhập (xem trước giá vốn mới), sửa / xóa phiếu mới nhất | Quản trị viên |
| `/statistics` | Thống kê doanh thu, giá vốn hàng bán, lợi nhuận gộp, tỷ suất lợi nhuận, sản phẩm bán chạy | Quản trị viên |

Nút **Đổi mật khẩu** ở cuối thanh bên (mọi tài khoản quản trị): đổi xong mọi phiên của tài khoản bị đăng xuất, kể cả phiên hiện tại.

## Cấu trúc

```
app/login            Đăng nhập
app/(panel)          Layout có sidebar + kiểm tra đăng nhập, các trang quản trị
components/hsv       UI dùng chung, form sản phẩm, quản lý danh mục/nguyên liệu
contexts             Phiên đăng nhập (JWT), danh mục & nguyên liệu
lib/api              HTTP client (vỏ response ABP), DTO, service theo tài liệu API
lib/hsv              Định dạng tiền/ngày, trạng thái đơn, kiểm tra form
```

`lib/api` và `lib/hsv` được sao từ repo cửa hàng; khi backend đổi API cần cập nhật ở cả hai repo.
Riêng `lib/api/services.ts` của trang quản trị khác bản cửa hàng ở hai chỗ: `authApi.authenticate` gọi
`/api/TokenAuth/AuthenticateAdmin` và `userApi.resetPassword` (`PUT /api/services/app/User/ResetPassword`).
`components/hsv/password-reset-forms.tsx` (form Quên / Đặt lại mật khẩu) giống hệt bản bên repo cửa hàng.
`lib/hsv/mock-cost.ts` chỉ có ở trang quản trị: khi chạy dev mà backend chưa có chức năng nhập kho (không trả giá vốn / lợi nhuận,
API `StockReceipt` trả 404), Tổng quan, Thống kê và Nhập kho hiện **dữ liệu ảo** kèm thông báo; trang Nhập kho chỉ xem, không nhập / sửa được.
Bản build production không dùng dữ liệu ảo (thiếu dữ liệu thì hiện "—").
