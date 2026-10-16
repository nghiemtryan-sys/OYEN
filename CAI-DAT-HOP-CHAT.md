# Hộp chat Facebook OYEN

## Đã triển khai

- `api/social.mjs`: API bảo vệ bằng phiên đăng nhập Supabase và danh sách UUID quản trị trên máy chủ.
- `supabase/SOCIAL_INBOX.sql`: tạo bảng hội thoại/tin nhắn riêng, RLS, chuẩn hóa webhook mới và chạy lại các sự kiện cũ. Tin nhắn trùng được bỏ qua bằng Page ID + message ID.
- `index.html`: Đăng nhập hộp chat, chọn Facebook, Làm mới, đọc hội thoại, đánh dấu đã đọc/đã xử lý và lên đơn bên cạnh.

## Cấu hình bắt buộc

1. Chạy `META_WEBHOOK.sql` trước, rồi `SOCIAL_INBOX.sql` trong cùng dự án Supabase. Bản nâng cấp này đã được chạy trên dự án OYEN khi triển khai.
2. Tạo tài khoản email/mật khẩu trong Supabase → Authentication → Users. Tự nhập mật khẩu; không đưa mật khẩu vào GitHub hoặc chat.
3. Vercel → Environment Variables → thêm `OYEN_SOCIAL_ADMIN_IDS`: UUID của tài khoản được phép quản lý hộp chat; nhiều UUID cách nhau bằng dấu phẩy. Chỉ người chủ app quyết định cấp quyền. Không dùng email hoặc App ID/Page ID thay UUID người dùng.
4. Các biến máy chủ hiện có: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `META_PAGE_IDS`. Tùy chọn `META_PAGE_NAME` đặt tên Page hiển thị. Sau khi đổi biến, Redeploy Production.
5. Mở app qua HTTPS trên Vercel → Mạng xã hội → Đăng nhập hộp chat. Đăng nhập xong app chọn Facebook và tải danh sách. Nếu phiên cũ được lưu, bấm Làm mới.

API tự dùng `/api/social?route=...` trên cùng domain. Không cần nhập địa chỉ API thủ công trên Vercel. Khi mở bằng `file://`, dùng bản Vercel để đăng nhập và đọc tin.

## Phạm vi hiện tại

- Hiển thị các tin Messenger nhận qua webhook sau khi kết nối; không tải lịch sử Facebook trước thời điểm kết nối.
- Tên khách tạm hiển thị theo đuôi mã Facebook. Điền tên/điện thoại/địa chỉ khách khi lên đơn. File đính kèm hiển thị thông báo, chưa tải file về app.
- Làm mới thủ công; tối đa 100 hội thoại gần nhất và 200 tin gần nhất mỗi hội thoại, có thông báo khi vượt giới hạn.
- Chưa bật gửi trả lời, bình luận, Zalo hoặc TikTok. Trạng thái quyền của API giữ các nút chưa khả dụng ở trạng thái tắt. Gửi Messenger cần Page Access Token được cấp đúng quyền và xử lý quy tắc gửi tin của Meta; không nhập token vào giao diện trình duyệt.
- Đăng xuất hộp chat xóa dữ liệu hội thoại/bản nháp trong phiên hiển thị. Các chức năng đơn hàng hiện có vẫn theo cơ chế đồng bộ cũ của app.

## Kiểm tra

`node --test tests/meta-webhook.test.mjs tests/social.test.mjs`

`tests/social-inbox.sql` là kiểm tra tích hợp chạy trong transaction và rollback dữ liệu giả. Không gửi tin nhắn đến Facebook.
