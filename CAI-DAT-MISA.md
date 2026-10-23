# MISA Developer Open API cho OYEN

Nguồn chính thức: https://developer.misa.vn/products-openapi/MEINVOICE?firstApi=1 (API Get Token / Authentication).

## Cấu hình trên OYEN

Cài đặt → Tích hợp → MISA meInvoice API → đăng nhập tài khoản quản trị đã được cấp quyền → Tải cấu hình.

Nhập Client ID, Client Secret từ mục tích hợp Hóa đơn điện tử của ứng dụng OYEN trên MISA Developer, mã số thuế người bán, tài khoản và mật khẩu meInvoice. Client Secret và mật khẩu meInvoice là hai thông tin khác nhau. Không nhập Client ID vào luồng App ID cũ.

Chỉ hỗ trợ cổng chính thức được tài liệu này công bố. Không tự suy ra một URL sandbox. Cấu hình App ID cũ không được tự chuyển sang Client ID; cần nhập lại thông tin theo cổng mới.

## Backend và bảo mật

- `api/misa.mjs`: chỉ quản trị có phiên Supabase hợp lệ và UUID trong `OYEN_MISA_ADMIN_IDS` mới được đọc cấu hình an toàn, lưu hoặc kiểm tra.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MISA_CONFIG_KEY` (32 byte ngẫu nhiên, base64) chỉ ở biến môi trường server. Giữ nguyên khóa mã hóa đã cài, không tạo lại khi cập nhật mã.
- `supabase/MISA_CONFIG.sql`: bảng `oyen_misa_config` bật RLS, thu hồi toàn bộ quyền public/anon/authenticated; chỉ service_role đọc/ghi. Không cần migration mới cho Client Secret vì toàn bộ cấu hình đã mã hóa trong cột encrypted_config.
- AES-256-GCM mã hóa cấu hình trước khi lưu. Client Secret, mật khẩu và tài khoản không được trả về client; giao diện chỉ nhận cờ đã lưu. Để trống giữ giá trị cũ. Đổi Client ID hoặc mã số thuế sẽ xóa các thông tin nhạy cảm cũ nếu không nhập lại.
- Kiểm tra gọi duy nhất `POST https://developer.misa.vn/apis/itg/meinvoice/invoice/token` bằng header `ClientID`, `ClientSecret`, `Content-Type: application/json`; body gồm `taxcode`, `username`, `password`. Không gửi `appid`.
- Không theo redirect, không nhận URL tùy ý, không trả/lưu token MISA, không đưa phản hồi thô của MISA vào log hoặc client.

## Phê duyệt và kiểm thử

Quyền kiểm tra do server quyết định: `MISA_EINVOICE_APPROVED=true`, `MISA_APPROVED_CLIENT_ID` khớp Client ID được MISA duyệt, `MISA_APPROVED_ENVIRONMENT=production`. Chỉ xác nhận các biến này sau khi có bằng chứng MISA đã cho ứng dụng hoạt động. Không dùng biến MISA_APPROVED_APP_ID cũ.

Chức năng phát hành hóa đơn luôn bị khóa, kể cả khi xác thực thành công. Endpoint issue/publish không được hỗ trợ.

Kiểm thử: `node --test tests/misa.test.mjs tests/misa-ui.test.cjs`. Kiểm thử tự động dùng phản hồi giả lập, không xác nhận thông tin đăng nhập hoặc quyền thực tế của tài khoản MISA. Việc kiểm tra thật chỉ thực hiện sau khi người quản trị lưu đủ thông tin và quyền đã được xác nhận.
