# MISA meInvoice API cho OYEN

Đã thêm Cài đặt → Tích hợp → MISA meInvoice API vào bản OYEN hiện có. Mặc định hiển thị ứng dụng OYEN hoạt động, API Hóa đơn điện tử chờ phê duyệt. Bấm Tải cấu hình để lấy trạng thái thực từ server. Không có chức năng phát hành hóa đơn trong bản thay đổi này, kể cả sau phê duyệt.

## Cài đặt backend

1. Giữ `index.html` và `misa-settings.js` cùng thư mục web. Đưa `api/misa.mjs` vào cùng thư mục API với `social.mjs` trên dự án Vercel hiện có. Handler dùng cùng chuẩn export `fetch` như backend hiện tại.
2. Chạy `supabase/MISA_CONFIG.sql` trong Supabase SQL Editor. Bảng riêng chỉ service_role có quyền đọc/ghi; không dùng bảng nuts_kv và không mở quyền anon/authenticated.
3. Đặt biến môi trường **chỉ phía server**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OYEN_MISA_ADMIN_IDS` (UUID Supabase Auth của quản trị được phép; nhiều UUID cách nhau bằng dấu phẩy), `MISA_CONFIG_KEY` (32 byte ngẫu nhiên mã hóa base64, dùng AES-256-GCM). Không dùng tiền tố PUBLIC/VITE/NEXT_PUBLIC. Lưu khóa mã hóa trong secret manager và sao lưu an toàn; đổi khóa cần chuyển mã dữ liệu cũ trước.
4. Chưa được MISA duyệt: để `MISA_EINVOICE_APPROVED=false`. Không tự suy ra quyền API từ trạng thái ứng dụng hoạt động.
5. Chỉ sau khi xác nhận MISA cấp quyền Hóa đơn điện tử cho đúng App ID và môi trường: đặt `MISA_EINVOICE_APPROVED=true`, `MISA_APPROVED_APP_ID` và `MISA_APPROVED_ENVIRONMENT` (`test` hoặc `production`). Thay đổi môi trường/App ID sẽ khiến kiểm tra bị khóa khi không khớp quyền đã xác nhận.
6. Triển khai theo quy trình hiện có, mở OYEN qua HTTPS, đăng nhập quản trị tại trang tích hợp, tải cấu hình, nhập App ID, MST, tài khoản và mật khẩu meInvoice rồi lưu. Tài khoản và mật khẩu được mã hóa trong bảng; API chỉ trả cờ đã lưu. Để trống để giữ thông tin cũ; đổi MST/môi trường/App ID yêu cầu nhập lại thông tin đăng nhập.

## Kiểm tra và giới hạn

- `node --test tests/misa.test.mjs` kiểm tra phân quyền, mã hóa, trạng thái chờ duyệt, quyền gắn App ID/môi trường, dữ liệu trả về, lỗi nhà cung cấp và chặn phát hành.
- Nút Kiểm tra kết nối chỉ gọi `POST /api/integration/auth/token` từ backend. Endpoint được cố định theo môi trường, không nhận URL từ client và không theo redirect. Token MISA chỉ tồn tại trong yêu cầu kiểm tra phía server, không trả về hoặc ghi log/lưu xuống DB.
- Tài liệu chính thức: https://doc.meinvoice.vn/itg/Doc/GetToken.html . Sử dụng URL trong phần Request; phần ví dụ curl cuối trang có URL khác, cần đối chiếu bộ tài liệu cấp riêng nếu MISA cấp phiên bản khác.
- Cần kiểm tra thực tế trên staging sau khi chạy migration và cấu hình biến server. Các kiểm thử tự động dùng MISA giả lập, không xác nhận quyền của tài khoản thật.
- Thông tin nhập tồn tại tạm trong form/yêu cầu HTTPS; không được nhúng sẵn vào mã nguồn, localStorage hay trả về từ server. Giữ HTTPS, CSP và kiểm soát các script bên thứ ba của OYEN trong quy trình vận hành hiện có.
- Quyền phát hành hóa đơn luôn tắt trong phiên bản này. Quyền MISA thực tế cần được xác nhận riêng trước khi mở kiểm tra kết nối.
