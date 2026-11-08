# Hồn Sừng Việt — Trang quản trị

Frontend phân hệ quản trị (Nhân viên, Quản trị viên) của website Hồn Sừng Việt. Hệ thống gồm 3 repo:

| Repo | Vai trò | Địa chỉ |
| --- | --- | --- |
| [`HornViet`](https://github.com/Tngoc2902/HornViet) | Backend `HornViet.Api` (ASP.NET Core) | https://hornviet-api-staging.onrender.com |
| `HornViet_customer` | Trang cửa hàng cho khách | https://hornviet-shop.vercel.app |
| `HornViet_admin` (repo này) | Trang quản trị | https://horn-viet-admin.vercel.app |

Hai frontend gọi chung một backend qua REST API và SignalR.

## Công nghệ

| Thành phần | Phiên bản |
| --- | --- |
| Next.js (App Router) | 16.4 |
| React / React DOM | 19.3 |
| TypeScript | 5.8 |
| Tailwind CSS | 3.4 (kèm `tailwindcss-animate`) |
| `@microsoft/signalr` | 10 — kết nối thời gian thực |
| `exceljs` | 4.4 — xuất báo cáo Excel ở trang Thống kê |
| `sonner` | Thông báo dạng toast |
| `lucide-react` | Biểu tượng |

## Chạy dự án

Yêu cầu: Node.js **20.9 trở lên** (mức tối thiểu của Next.js 16; repo không có `.nvmrc`/`engines`), npm.

```bash
npm install
cp .env.example .env.local   # sửa địa chỉ backend nếu cần
npm run dev                  # http://localhost:3001
```

Backend phải đang chạy (mặc định `http://localhost:21021`) và có `http://localhost:3001` trong `App:CorsOrigins`
(`HornViet.Api/appsettings.json`), nếu không mọi lời gọi API bị trình duyệt chặn.

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy dev ở cổng 3001 |
| `npm run build` | Build bản production (dừng nếu có lỗi kiểu TypeScript) |
| `npm start` | Chạy bản đã build ở cổng 3001 |
| `npm run typecheck` | Kiểm tra lỗi kiểu (`tsc --noEmit`) |

`next build` có thể tự sửa `tsconfig.json`; nếu sau khi build git báo `tsconfig.json` thay đổi thì xem lại trước khi commit.

## Biến môi trường

Đặt trong `.env.local` khi chạy máy (mẫu ở `.env.example`). Biến `NEXT_PUBLIC_*` được nhúng vào mã phía trình duyệt lúc build,
nên **không** đặt bí mật vào đây.

| Biến | Ý nghĩa | Giá trị khi chạy máy |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Địa chỉ backend (REST API, SignalR, ảnh `/uploads/...`) | `http://localhost:21021` |
| `NEXT_PUBLIC_STORE_URL` | Địa chỉ trang cửa hàng (nút "Xem cửa hàng"). Để trống: bản dev dùng `http://localhost:3000`, bản production ẩn nút | `http://localhost:3000` |

## Màn hình

| Đường dẫn | Màn hình | Quyền |
| --- | --- | --- |
| `/login` | Đăng nhập qua `POST /api/TokenAuth/AuthenticateAdmin` (server chỉ cấp token cho Nhân viên / Quản trị viên) | Công khai |
| `/` | Tổng quan | Nhân viên, Quản trị viên |
| `/categories` | Danh mục | Nhân viên, Quản trị viên |
| `/materials` | Nguyên liệu & nguồn gốc | Nhân viên, Quản trị viên |
| `/products` | Sản phẩm: biến thể, tải ảnh lên, ẩn / hiện | Nhân viên, Quản trị viên |
| `/collections` | Bộ sưu tập: nhóm sản phẩm hiện ở mục "Bộ sưu tập" của cửa hàng | Nhân viên, Quản trị viên |
| `/orders` | Đơn hàng: đổi trạng thái; tạo / hủy vận đơn GHN, in nhãn, theo dõi tiến trình (môi trường thử GHN có nút giả lập trạng thái) | Nhân viên, Quản trị viên |
| `/support` | Hỗ trợ khách hàng: tiếp nhận và trả lời hội thoại khi khách bấm "Chat với nhân viên" ở cửa hàng | Nhân viên, Quản trị viên |
| `/chatbot` | Huấn luyện chatbot: ý định và câu mẫu, huấn luyện lại model, xem độ chính xác, gán nhãn câu bot chưa hiểu | Nhân viên, Quản trị viên |
| `/users` | Người dùng: tạo tài khoản, đổi vai trò, khóa / mở khóa, đặt lại mật khẩu | Quản trị viên |
| `/inventory` | Nhập kho & giá vốn: giá vốn bình quân, giá trị tồn, lãi / sản phẩm; nút **+ Nhập hàng** (đầu trang: chọn sản phẩm; hoặc trên từng dòng), xem trước giá vốn mới; sửa / hủy phiếu mới nhất | Quản trị viên |
| `/statistics` | Thống kê doanh thu, giá vốn hàng bán, lợi nhuận gộp, tỷ suất lợi nhuận, sản phẩm bán chạy; xuất báo cáo Excel (không ghi thông tin cá nhân của khách) | Quản trị viên |

Trang chỉ dành cho Quản trị viên khai báo ở `lib/hsv/admin-routes.ts`: Nhân viên không thấy trên menu và bị chuyển về Tổng quan.

Nút **Đổi mật khẩu** ở cuối thanh bên (mọi tài khoản quản trị): đổi xong mọi phiên của tài khoản bị đăng xuất, kể cả phiên hiện tại.
Trang quản trị không có chức năng tự quên mật khẩu (chỉ trang cửa hàng có, bằng mã xác nhận qua email): Nhân viên quên mật khẩu thì
Quản trị viên đặt lại ở trang Người dùng; tài khoản Quản trị viên và Nhân viên cũng không nhận được mã đặt lại từ backend.
Tổng quan, Thống kê và Nhập kho lấy giá vốn / lợi nhuận trực tiếp từ backend (API `Statistic`, `StockReceipt`); thiếu dữ liệu thì hiện "—".

## Cấu trúc

```
app/login            Đăng nhập
app/(panel)          Layout có sidebar + kiểm tra đăng nhập, các trang quản trị
components/hsv       UI dùng chung, form sản phẩm / bộ sưu tập / ý định chatbot, quản lý danh mục & nguyên liệu,
                     đổi mật khẩu, tiến trình vận đơn
contexts             Phiên đăng nhập (JWT), danh mục & nguyên liệu, kết nối SignalR
hooks                use-api (gọi API kèm trạng thái tải / lỗi), use-realtime (nghe sự kiện thời gian thực)
lib/api              HTTP client (vỏ response ABP), DTO, service theo tài liệu API
lib/hsv              Định dạng tiền / ngày, trạng thái đơn, vận chuyển GHN, kiểm tra form, phân quyền trang, xuất Excel
lib/realtime.ts      Tạo kết nối Hub SignalR, danh sách sự kiện
lib/storage.ts       Lưu phiên đăng nhập trong sessionStorage
```

`lib/api` và `lib/hsv` ban đầu được sao từ repo cửa hàng; khi backend đổi API cần cập nhật ở cả hai repo.
`lib/api/services.ts` của trang quản trị chỉ giữ các lời gọi API mà trang quản trị dùng: `authApi.authenticate` gọi
`/api/TokenAuth/AuthenticateAdmin`, có thêm các API quản trị (người dùng, nhập kho, thống kê, vận đơn, hỗ trợ khách, huấn luyện chatbot,
tải ảnh) và không có các lời gọi chỉ trang cửa hàng dùng (giỏ hàng, đặt / hủy đơn của khách, hồ sơ & địa chỉ, đăng ký).

## Kết nối backend

**REST API** — `lib/api/http.ts`:

- Ghép `NEXT_PUBLIC_API_BASE_URL` với đường dẫn API (`/api/TokenAuth/...`, `/api/services/app/<Service>/<Method>`).
- Backend trả mọi response trong vỏ `AjaxResponse` kiểu ABP: `{ result, success, error, unauthorizedRequest }`. Hàm `request()`
  trả thẳng `result`; khi lỗi ném `ApiError` (mã HTTP, `error.message`, `details`, `validationErrors` để gắn lỗi vào từng trường form).
  Tải ảnh dùng `http.upload()` gửi `FormData`.
- Đăng nhập trả JWT, gửi kèm header `Authorization: Bearer <token>`. Token (khóa `hsv-access-token`) lưu ở `sessionStorage`:
  đóng tab là đăng xuất. Gặp 401 thì xóa token và đăng xuất.

**SignalR** — `lib/realtime.ts`, `contexts/realtime-context.tsx`:

- Khi đã đăng nhập, giữ một kết nối tới Hub `/hubs/notifications` của backend (token gửi qua `?access_token=`), mất kết nối thì
  tự nối lại; trạng thái kết nối hiện trên thanh bên.
- Thông báo đơn hàng mới (`OrderCreated`), sắp hết hàng (`LowStock`), khách cần hỗ trợ (`ChatConversationChanged`); làm mới
  danh sách khi đơn đổi trạng thái, tồn kho hoặc vận đơn thay đổi.
- Đăng xuất ngay khi phiên bị thu hồi (`SessionRevoked`: khóa tài khoản, đổi vai trò, đặt lại / đổi mật khẩu).
- Trang Hỗ trợ khách hàng nghe tin nhắn của hội thoại đang mở (`JoinChat` / `LeaveChat`, sự kiện `ChatMessage`).

## Triển khai

Trang quản trị chạy trên **Vercel** (project riêng):

- Nhánh `main` là **Production**: merge vào `main` là Vercel tự build và triển khai lên https://horn-viet-admin.vercel.app.
- Làm tính năng ở nhánh `feature/...` (hoặc `fix/...`), mở Pull Request vào `main`; Vercel tạo bản **Preview** cho mỗi PR để xem thử.
- Biến `NEXT_PUBLIC_*` đặt ở Vercel → **Settings → Environment Variables**. Vì biến được nhúng lúc build, đổi xong phải **Redeploy**.
- Backend phải có địa chỉ trang quản trị trong `App__CorsOrigins`.

Hướng dẫn triển khai chung cho cả 3 repo (Neon, Cloudinary, Render, Vercel, biến môi trường, sự cố thường gặp):
[`docs/trien-khai.md`](https://github.com/Tngoc2902/HornViet/blob/main/docs/trien-khai.md) ở repo backend.

## Quy tắc

- Không commit `.env.local` (đã có trong `.gitignore`), mật khẩu, khóa API hay thông tin cá nhân vào repo.
- Chạy `npm run typecheck` trước khi tạo Pull Request.
