# Changelog

Lịch sử thay đổi của Aivio Bot Setup. Lịch sử của bản gốc OpenClaw Setup (đến v5.17.5) nằm ở [docs/upstream](docs/upstream).

## [1.2.0] - 2026-10-08

### Giao diện quản lý mới
- Khung mới với sidebar theo nhóm: **Tổng quan**, **Agent**, **Tài khoản Zalo**, **Công cụ**, **Nhật ký**, **Cấu hình**. Có chế độ sáng/tối, menu kéo ra trên điện thoại, phím Esc đóng hộp thoại.
- **Tổng quan** vẽ đường đi của tin nhắn (kênh chat → OpenClaw → router) và chỉ ra tin nhắn đang dừng ở đâu, kèm nút sửa tại chỗ.
- Số đo CPU, RAM, ổ đĩa là số thật của máy chủ (`/api/host/metrics`), thay cho số giả tính từ đường dẫn project ở bản cũ.
- **Nhật ký** giữ 400 dòng gần nhất trên máy chủ, mở trang lúc nào cũng thấy; có ô lọc.
- **Agent** chọn bot ở danh sách, sửa `SOUL.md` ngay bên cạnh. **Công cụ** bật kỹ năng/plugin theo từng bot.
- Bỏ file `styles.css` cũ (126 KB) thay bằng `admin.css`.

### Đăng nhập và bảo mật
- Mật khẩu quản trị (scrypt), phiên đăng nhập bằng cookie ký HMAC, `HttpOnly`, `SameSite=Strict`, `Secure` khi HTTPS. Đổi mật khẩu đăng xuất mọi thiết bị.
- Chưa có mật khẩu thì từ chối mọi request đi qua proxy hoặc từ máy khác.
- Giới hạn 5 lần sai mật khẩu / 10 phút / IP; chặn request ghi dữ liệu có Origin lạ; header chống iframe và sniff.
- Lệnh `--set-password` và biến `AIVIO_ADMIN_PASSWORD`.

### Deploy VPS
- `deploy/install-vps.sh`: Node.js 24, user riêng `aivio`, systemd user service, Nginx + Let's Encrypt cho `bot.aivio.vn`.
- Server tìm được OpenClaw cài theo `NPM_CONFIG_PREFIX` của user.

### Sửa lỗi
- Lựa chọn sáng/tối và ngôn ngữ không được nhớ sau khi tải lại trang.
- Đường dẫn workspace hiển thị sai (bị ghép hai lần) với project Native.
- Đường dẫn project mặc định là thư mục giả (`/home/you/...`); nay dùng thư mục home thật của máy chủ.

## [1.1.0] - 2026-10-08

### Router
- Bot mới gọi thẳng HVDTAI Router tại `https://router.aivio.vn/v1` thay vì 9Router cục bộ. Đặt `AIVIO_ROUTER_MODE=local` để quay về 9Router cục bộ.
- Dashboard có nút **Nhập key / Đổi key** trên thẻ HVDTAI Router. Lưu key sẽ xoá auth profile cũ đang giữ `sk-no-key`, nên bot dùng key mới ngay.
- Với router từ xa, Setup không còn lấy key của 9Router cục bộ ghi đè vào cấu hình (key đó router.aivio.vn không chấp nhận).
- Thẻ router hiện trạng thái thật của router.aivio.vn, mở đúng trang router.aivio.vn, ẩn nút Update và dòng phiên bản của 9Router cục bộ.

### Cài đặt và cập nhật
- Nút **Cập nhật**, kiểm tra phiên bản và launcher Windows lấy bản từ `github:theanh828726/aivio-setup`, không còn kéo `create-openclaw-bot` của bản gốc. Đổi nguồn bằng `AIVIO_SETUP_SPEC`.
- Sửa lỗi chạy lệnh Setup lần hai mở thêm một instance ở cổng 51790 thay vì dùng lại instance đang chạy.
- Lệnh tắt mở lại giao diện đổi thành `aivio-ui`.
- Tên project mặc định đổi thành `aivio-bot`; vẫn tìm thấy project cũ tên `openclaw-setup`.

### Giao diện
- Bỏ popup Donate và mã QR chuyển khoản của tác giả bản gốc.
- Footer ghi công bản gốc (MIT) và trỏ về repo aivio-setup.

### Build
- Thêm `scripts/build.mjs`: `npm run build` sinh `dist/` từ `src/`, `npm run check:dist` báo lỗi khi hai thư mục lệch nhau.
- `dist/` được build lại từ `src/`, nên có luôn bản sửa lỗi đọc model dạng chuỗi (`"smart-route"`) mà bản 1.0.0 chưa đưa vào `dist/`.
- Bỏ ký tự BOM ở đầu file. BOM đứng trước shebang khiến `dist/cli.js` không chạy trực tiếp được trên macOS/Linux.
- Bỏ file không dùng (`install-gen.js`, logo OpenClaw, ảnh QR) và ba dependency không được import (`chalk`, `@inquirer/prompts`, `fs-extra`).

### Tài liệu
- Viết lại README (VI/EN) và `docs/SETUP*.md` theo luồng router.aivio.vn.

## [1.0.0] - 2026-09-26

- Bản đầu tiên: rebrand OpenClaw Setup v5.17.5 thành Học Viện Đào Tạo AI Bot Setup.
