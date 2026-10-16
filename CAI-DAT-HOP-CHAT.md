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
- Tên và ảnh khách được đọc bằng User Profile API khi có Page Access Token hợp lệ. Nếu chưa cấu hình hoặc Meta chưa cấp quyền, app giữ tên theo đuôi mã Facebook và chữ cái đại diện. File đính kèm hiển thị thông báo, chưa tải file về app.
- Làm mới thủ công; tối đa 100 hội thoại gần nhất và 200 tin gần nhất mỗi hội thoại, có thông báo khi vượt giới hạn.
- Chưa bật gửi trả lời, bình luận, Zalo hoặc TikTok. Trạng thái quyền của API giữ các nút chưa khả dụng ở trạng thái tắt. Gửi Messenger cần Page Access Token được cấp đúng quyền và xử lý quy tắc gửi tin của Meta; không nhập token vào giao diện trình duyệt.
- Đăng xuất hộp chat xóa dữ liệu hội thoại/bản nháp trong phiên hiển thị. Các chức năng đơn hàng hiện có vẫn theo cơ chế đồng bộ cũ của app.

## Kiểm tra

`node --test tests/meta-webhook.test.mjs tests/social.test.mjs`

`tests/social-inbox.sql` là kiểm tra tích hợp chạy trong transaction và rollback dữ liệu giả. Không gửi tin nhắn đến Facebook.

## Nhớ phiên đăng nhập và hồ sơ khách

- Hộp chat tự khôi phục phiên Supabase đã lưu trên cùng trình duyệt/domain, tự làm mới token và tải Facebook khi vào mục Mạng xã hội. Vẫn cần đăng nhập lần đầu, khi tự đăng xuất, xóa dữ liệu trình duyệt hoặc phiên bị thu hồi/hết hiệu lực.
- Đăng xuất ở tab khác cũng dọn hội thoại và bản nháp trong màn hình hiện tại. Máy chủ tiếp tục kiểm tra UUID quản trị trên mọi yêu cầu.
- Với một Page: đặt `META_PAGE_ACCESS_TOKEN` ở Vercel Production, loại Secret, rồi Redeploy. Token phải thuộc Page đã khai báo trong `META_PAGE_IDS` và có quyền đọc hồ sơ Messenger cần thiết. Không dùng App Secret, verify token hoặc khóa Supabase thay Page token.
- Với nhiều Page: dùng `META_PAGE_ACCESS_TOKENS` là JSON ánh xạ Page ID sang token riêng. Không tự dùng một token chung cho nhiều Page. `META_GRAPH_VERSION` tùy chọn, mặc định `v26.0`.
- API đọc tối đa 8 hồ sơ chưa có trong bộ nhớ đệm mỗi lượt tải danh sách, tối đa 4 yêu cầu song song; chọn một hội thoại sẽ lấy hồ sơ riêng của khách đó. Bộ nhớ đệm phía máy chủ lưu kết quả thành công 10 phút, lỗi 30 giây. Bấm Làm mới để lấy thêm tên trong danh sách lớn.
- Bật token hồ sơ không tự bật nút gửi tin. Backend trả lỗi riêng cho tính năng chưa triển khai.
