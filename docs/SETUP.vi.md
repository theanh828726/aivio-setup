# Hướng dẫn vận hành Aivio Bot Setup

Tài liệu này bổ sung cho [README.vi.md](../README.vi.md): chuyển project cũ sang router.aivio.vn, chạy trên VPS, bảng cổng và xử lý sự cố.

---

## Chuyển project có sẵn sang router.aivio.vn

Project tạo từ bản 1.0.0, hoặc tạo khi đặt `AIVIO_ROUTER_MODE=local`, vẫn gọi 9Router cục bộ. Để chuyển sang router.aivio.vn:

1. Mở `<project>/.openclaw/openclaw.json`, sửa `models.providers.9router.baseUrl` thành `https://router.aivio.vn/v1`:

    ```json
    "9router": {
      "baseUrl": "https://router.aivio.vn/v1",
      "apiKey": "sk-no-key",
      "api": "openai-completions"
    }
    ```

2. Mở lại giao diện Setup. Thẻ router trên Dashboard đổi tên thành **HVDTAI Router**.
3. Bấm **Nhập key** → dán API key lấy ở router.aivio.vn → **Endpoints**.
4. Kiểm tra lại cấu hình rồi khởi động lại bot:

    ```bash
    cd <project>
    export OPENCLAW_HOME="$PWD/.openclaw" OPENCLAW_STATE_DIR="$PWD/.openclaw"
    openclaw config validate
    openclaw config get "models.providers['9router'].baseUrl" --json
    openclaw daemon restart
    ```

Không dán key trực tiếp vào `openclaw.json`. OpenClaw giữ key đầu tiên nó thấy trong một auth profile, và profile này được ưu tiên hơn file cấu hình. Nút **Nhập key** xoá profile đó giúp anh/chị. Nếu đã lỡ sửa tay, chạy `openclaw models auth list` rồi `openclaw models auth logout <profileId> --yes`.

---

## Chạy trên Linux / VPS

- **Gateway là systemd user unit.** Khi đóng SSH, user manager tắt và bot tắt theo. Setup tự bật linger; nếu log báo không bật được, chạy `sudo loginctl enable-linger <user>`.
- **Mọi giao diện chỉ nghe `127.0.0.1`.** Gateway nói HTTP/WebSocket không mã hoá, nên không mở ra internet. Muốn xem giao diện thì dùng SSH tunnel:

    ```bash
    ssh -L 51789:127.0.0.1:51789 -L 18789:127.0.0.1:18789 -L 18790:127.0.0.1:18790 <user>@<server>
    ```

    Giữ terminal đó mở, rồi vào `http://localhost:51789`. Tab Dashboard có sẵn lệnh này với đúng cổng của project (mục **Mở từ máy khác**).

- **Xem log trực tiếp:**

    ```bash
    systemctl --user list-units | grep -i openclaw
    journalctl --user -u <tên-unit> -f
    ```

- **Messenger trên VPS:** dùng nginx hoặc Caddy reverse proxy đường dẫn `/webhooks/messenger` về `127.0.0.1:18789` với domain và TLS của anh/chị. Chỉ proxy đúng đường dẫn đó để không lộ Control UI.

---

## Bảng cổng

| Cổng | Dịch vụ | Ghi chú |
|---|---|---|
| 51789 | Giao diện Setup | Đổi bằng `--port=` |
| 18789 | OpenClaw Gateway | Control UI và webhook Messenger |
| 18790 | Zalo Mod dashboard | Luôn bằng cổng gateway + 1 |
| 20128 | 9Router cục bộ | Chỉ dùng khi `AIVIO_ROUTER_MODE=local` |

Nếu cổng đã bị chiếm, Setup tự chuyển sang cặp cổng trống kế tiếp. Cổng thật của project nằm ở `gateway.port` trong `openclaw.json`.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Bot báo `9router/smart-route request failed (authentication failed)` | Chưa có key, key sai, hoặc auth profile còn giữ `sk-no-key` | Dashboard → **Nhập key** → dán key đúng |
| Thẻ HVDTAI Router báo OFFLINE | Máy không ra được internet tới router.aivio.vn | `curl -I https://router.aivio.vn/v1/models` từ máy chạy bot |
| Router trả lỗi model not found | Chưa có combo tên đúng `smart-route` | Tạo combo `smart-route` trên router.aivio.vn |
| Bot vẫn gọi `localhost:20128` | Project tạo từ bản cũ hoặc ở chế độ local | Làm theo mục "Chuyển project có sẵn sang router.aivio.vn" |
| `Gateway restart failed after 13s` ngay sau khi tạo bot | Lần boot đầu đang chạy migration | Chờ khoảng 30 giây rồi bấm Start lại |
| Đăng nhập Zalo báo `Unsupported channel "zalo-connect"` | Plugin chưa có trên đĩa | `openclaw plugins install clawhub:openclaw-zalo-connect --force --accept-capabilities` |
| Bot tắt khi đóng SSH hoặc không lên sau reboot | Chưa bật linger | `sudo loginctl enable-linger <user>` |
| Zalo Mod dashboard ra trang trắng | Tunnel chưa forward cổng gateway + 1 | Thêm `-L 18790:127.0.0.1:18790` |
| `ssh -L` báo `bind: Address already in use` | Máy của anh/chị đang chạy một project OpenClaw khác | Tắt project local đó trước khi mở tunnel |
| Meta không xác minh được webhook | URL không phải HTTPS public, hoặc Verify Token lệch | `curl "https://<domain>/webhooks/messenger?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=ping"` phải trả về `ping` |
| `Config warnings … plugin not found` ở mọi lệnh | Cấu hình khai plugin chưa cài | Cài plugin đó, hoặc `openclaw doctor --fix` |

---

## Ghi chú kỹ thuật

- Khi tạo project, Setup vẫn cài kèm 9Router cục bộ (`npm i -g 9router`) để có thể chuyển về chế độ local mà không cần cài lại. Ở chế độ mặc định, bot không gọi tới nó.
- Docker đã ngừng cho project mới: OpenClaw 2026.9 không ghi được cấu hình qua Docker Desktop trên Windows. Project Docker cũ vẫn mở và quản lý được.
