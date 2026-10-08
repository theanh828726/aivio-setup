# Changelog

Lịch sử thay đổi của Aivio Bot Setup. Lịch sử của bản gốc OpenClaw Setup (đến v5.17.5) nằm ở [docs/upstream](docs/upstream).

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
