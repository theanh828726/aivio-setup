# Deploy giao diện quản lý bot lên VPS

Sau các bước dưới đây, anh/chị mở `https://bot.aivio.vn` từ điện thoại hoặc máy tính, đăng nhập bằng mật khẩu quản trị và quản lý bot mà không cần bật máy cá nhân.

```text
Trình duyệt ──HTTPS──► Nginx (443, Let's Encrypt) ──► Aivio Bot Setup (127.0.0.1:51789)
                                                          │ cài, cấu hình
                                                          ▼
                                               OpenClaw Gateway (127.0.0.1:18789) ──► router.aivio.vn
```

Chỉ Nginx mở ra internet. Giao diện quản lý, gateway và các dashboard plugin đều nghe trên `127.0.0.1`. Giao diện từ chối mọi request đi qua proxy khi chưa đặt mật khẩu.

## Cần chuẩn bị

| Thứ cần có | Ghi chú |
|---|---|
| VPS Ubuntu 22.04 hoặc 24.04 | Quyền root. Theo dõi CPU/RAM ở trang Tổng quan, nâng cấu hình khi RAM thường xuyên trên 80% |
| Bản ghi DNS | `A  bot.aivio.vn → <IP VPS>`, tạo trước khi chạy script |
| Email | Dùng cho chứng chỉ Let's Encrypt |
| Mật khẩu quản trị | Ít nhất 10 ký tự |

Kiểm tra DNS từ máy Windows:

```powershell
nslookup bot.aivio.vn
```

## Cài lần đầu (từ Windows PowerShell)

PowerShell trên Windows 10/11 có sẵn `ssh` và `scp`.

```powershell
# 1. Tải script lên VPS
curl.exe -fsSLo install-vps.sh https://raw.githubusercontent.com/theanh828726/aivio-setup/master/deploy/install-vps.sh
scp install-vps.sh root@<IP_VPS>:/root/

# 2. Chạy script. -t để nhập mật khẩu quản trị ngay trên terminal, không lưu vào lịch sử lệnh
ssh -t root@<IP_VPS> "DOMAIN=bot.aivio.vn EMAIL=<email-cua-anh> bash /root/install-vps.sh"
```

Script làm lần lượt:

1. Cài `git`, `nginx`, `certbot`, Node.js 24.
2. Tạo user `aivio` (bot không chạy bằng root), bật linger để bot sống sau khi đóng SSH và tự lên sau reboot.
3. Clone repo vào `/home/aivio/aivio-setup`.
4. Hỏi và lưu mật khẩu quản trị (hash scrypt, file `~/.aivio-setup/auth.json`, quyền 600).
5. Tạo service `aivio-setup` (systemd user unit) chạy giao diện ở `127.0.0.1:51789`.
6. Tạo site Nginx cho `bot.aivio.vn` và xin chứng chỉ HTTPS.

Khi xong, mở `https://bot.aivio.vn` → đăng nhập → **Cấu hình** → **Tạo project** (đường dẫn mặc định `/home/aivio/aivio-bot`) → **Tổng quan** → **Nhập key** router → **Agent** → **Tạo bot**.

## Cập nhật bản mới

Hai cách, chọn một:

- Trên giao diện: **Cấu hình** → **Phiên bản** → **Cập nhật** (khi có bản mới).
- Chạy lại script với cùng `DOMAIN`. Script giữ mật khẩu cũ nếu không truyền `ADMIN_PASSWORD`:

```powershell
ssh -t root@<IP_VPS> "DOMAIN=bot.aivio.vn bash /root/install-vps.sh"
```

## Vận hành

Chạy bằng root trên VPS:

| Việc | Lệnh |
|---|---|
| Xem log giao diện | `sudo -u aivio XDG_RUNTIME_DIR=/run/user/$(id -u aivio) journalctl --user -u aivio-setup -f` |
| Khởi động lại giao diện | `sudo -u aivio XDG_RUNTIME_DIR=/run/user/$(id -u aivio) systemctl --user restart aivio-setup` |
| Đổi mật khẩu quản trị | `sudo -u aivio -H node /home/aivio/aivio-setup/dist/cli.js --set-password` |
| Xem các service của bot | `sudo -u aivio XDG_RUNTIME_DIR=/run/user/$(id -u aivio) systemctl --user list-units` |

Đổi mật khẩu sẽ đăng xuất mọi thiết bị đang đăng nhập. Cũng đổi được ngay trong **Cấu hình** → **Bảo mật**.

## Bảo mật đã có sẵn

- Mật khẩu lưu dạng scrypt hash, không lưu bản rõ.
- Phiên đăng nhập là cookie `HttpOnly`, `SameSite=Strict`, `Secure` khi chạy HTTPS, hết hạn sau 7 ngày.
- Sai mật khẩu 5 lần trong 10 phút thì IP đó bị chặn 10 phút. Nginx ghi đè `X-Forwarded-For`, nên client không giả IP để lách được.
- Mọi request ghi dữ liệu từ trang khác (Origin lạ) bị chặn.
- Trang không cho nhúng vào iframe, không cho công cụ tìm kiếm index.

## Lưu ý

- **Zalo cá nhân trên VPS:** Zalo dễ yêu cầu xác minh hơn khi đăng nhập từ IP máy chủ. Dùng tài khoản phụ. Zalo Bot API và Telegram không bị ảnh hưởng.
- **Điều khiển máy, Chrome thật:** không dùng được trên VPS (không có màn hình). Duyệt web chạy ở chế độ headless.
- **Dashboard plugin Zalo Mod (cổng 18790)** không mở ra internet. Muốn xem, dùng SSH tunnel: `ssh -L 18790:127.0.0.1:18790 root@<IP_VPS>` rồi mở `http://localhost:18790/dashboard`.
- **Sao lưu:** thư mục cần sao lưu là `/home/aivio/aivio-bot` (cấu hình, workspace, phiên đăng nhập Zalo) và `/home/aivio/.aivio-setup/auth.json`.
