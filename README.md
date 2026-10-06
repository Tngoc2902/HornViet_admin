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
| `/login` | Đăng nhập (chỉ nhận Nhân viên / Quản trị viên) | Công khai |
| `/` | Tổng quan | Nhân viên, Quản trị viên |
| `/categories` | Danh mục | Nhân viên, Quản trị viên |
| `/materials` | Nguyên liệu & nguồn gốc | Nhân viên, Quản trị viên |
| `/products` | Sản phẩm & biến thể | Nhân viên, Quản trị viên |
| `/orders` | Đơn hàng | Nhân viên, Quản trị viên |
| `/users` | Người dùng | Quản trị viên |
| `/statistics` | Thống kê | Quản trị viên |

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
