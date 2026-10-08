#!/usr/bin/env bash
# Cài Aivio Bot Setup lên VPS Ubuntu và mở giao diện quản lý qua HTTPS.
#
# Chạy bằng root trên VPS (an toàn khi chạy lại: lần sau sẽ cập nhật code và cấu hình):
#
#   DOMAIN=bot.aivio.vn EMAIL=ban@vidu.com bash install-vps.sh
#
# Biến môi trường:
#   DOMAIN          Tên miền trỏ về VPS (bắt buộc), ví dụ bot.aivio.vn
#   EMAIL           Email nhận thông báo hết hạn chứng chỉ Let's Encrypt (bắt buộc lần đầu)
#   ADMIN_PASSWORD  Mật khẩu quản trị. Bỏ trống: script hỏi trên terminal (lần đầu)
#                   hoặc giữ mật khẩu cũ (lần sau).
#   APP_USER        User chạy bot (mặc định: aivio). Không dùng root.
#   REPO            Git repo (mặc định: https://github.com/theanh828726/aivio-setup.git)
#   BRANCH          Nhánh (mặc định: master)
#   UI_PORT         Cổng nội bộ của giao diện (mặc định: 51789, chỉ nghe 127.0.0.1)
#   SKIP_TLS=1      Bỏ qua bước xin chứng chỉ (khi DNS chưa trỏ về VPS)
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
APP_USER="${APP_USER:-aivio}"
REPO="${REPO:-https://github.com/theanh828726/aivio-setup.git}"
BRANCH="${BRANCH:-master}"
UI_PORT="${UI_PORT:-51789}"
SKIP_TLS="${SKIP_TLS:-0}"
NODE_MAJOR=24

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Chạy script bằng root (sudo -i rồi chạy lại)."
[ -n "$DOMAIN" ] || die "Thiếu DOMAIN. Ví dụ: DOMAIN=bot.aivio.vn EMAIL=ban@vidu.com bash install-vps.sh"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN không hợp lệ: $DOMAIN"
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "APP_USER không hợp lệ: $APP_USER"
[ "$APP_USER" != "root" ] || die "Không chạy bot bằng root. Đặt APP_USER khác root."
[[ "$UI_PORT" =~ ^[0-9]+$ ]] || die "UI_PORT không hợp lệ: $UI_PORT"
. /etc/os-release 2>/dev/null || true
[ "${ID:-}" = "ubuntu" ] || [ "${ID:-}" = "debian" ] || warn "Script được viết cho Ubuntu/Debian; hệ điều hành hiện tại: ${PRETTY_NAME:-không rõ}."

export DEBIAN_FRONTEND=noninteractive

say "Cài gói hệ thống (git, nginx, certbot)"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git nginx certbot python3-certbot-nginx >/dev/null

say "Kiểm tra Node.js ${NODE_MAJOR}"
current_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -z "$current_major" ] || [ "$current_major" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN="$(command -v node)"
echo "Node $(node -v) tại $NODE_BIN"

say "Tạo user $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$APP_USER"
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
APP_UID="$(id -u "$APP_USER")"
# Linger giữ systemd user manager chạy khi không ai đăng nhập: bot và giao diện sống qua
# việc đóng SSH và tự lên lại sau reboot.
loginctl enable-linger "$APP_USER"
systemctl start "user@${APP_UID}.service"
for _ in $(seq 1 20); do [ -d "/run/user/${APP_UID}" ] && break; sleep 0.5; done
[ -d "/run/user/${APP_UID}" ] || die "Không khởi động được systemd user manager cho $APP_USER."

as_app() { sudo -u "$APP_USER" -H env XDG_RUNTIME_DIR="/run/user/${APP_UID}" NPM_CONFIG_PREFIX="$APP_HOME/.npm-global" PATH="$APP_HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" "$@"; }

# npm -g của user này cài vào ~/.npm-global, không cần quyền root.
as_app mkdir -p "$APP_HOME/.npm-global" "$APP_HOME/aivio-bot"
as_app npm config set prefix "$APP_HOME/.npm-global" >/dev/null

say "Lấy mã nguồn ($REPO, nhánh $BRANCH)"
APP_DIR="$APP_HOME/aivio-setup"
if [ -d "$APP_DIR/.git" ]; then
  as_app git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  as_app git -C "$APP_DIR" checkout --quiet "$BRANCH"
  as_app git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  as_app git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
as_app git -C "$APP_DIR" log -1 --format='Đang ở commit %h: %s'

say "Mật khẩu quản trị"
AUTH_FILE="$APP_HOME/.aivio-setup/auth.json"
if [ -z "${ADMIN_PASSWORD:-}" ] && [ ! -f "$AUTH_FILE" ]; then
  [ -r /dev/tty ] || die "Chưa có mật khẩu. Đặt ADMIN_PASSWORD=... hoặc chạy bằng ssh -t để nhập trên terminal."
  read -r -s -p "Mật khẩu quản trị mới (ít nhất 10 ký tự): " ADMIN_PASSWORD </dev/tty; echo
  read -r -s -p "Nhập lại: " again </dev/tty; echo
  [ "$ADMIN_PASSWORD" = "$again" ] || die "Hai lần nhập không khớp."
fi
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  # Đưa qua stdin, không qua tham số dòng lệnh, để mật khẩu không hiện trong `ps`.
  printf '%s\n' "$ADMIN_PASSWORD" | as_app "$NODE_BIN" "$APP_DIR/dist/cli.js" --set-password
  unset ADMIN_PASSWORD
else
  echo "Giữ mật khẩu hiện có ($AUTH_FILE)."
fi

say "Tạo service giao diện quản lý (systemd user unit)"
UNIT_DIR="$APP_HOME/.config/systemd/user"
as_app mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/aivio-setup.service" <<UNIT
[Unit]
Description=Aivio Bot Setup - giao diện quản lý bot
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=NPM_CONFIG_PREFIX=$APP_HOME/.npm-global
Environment=PATH=$APP_HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN $APP_DIR/dist/cli.js --no-open --host=127.0.0.1 --port=$UI_PORT --project-dir=$APP_HOME/aivio-bot
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNIT
chown "$APP_USER:$APP_USER" "$UNIT_DIR/aivio-setup.service"
as_app systemctl --user daemon-reload
as_app systemctl --user enable --quiet aivio-setup.service
as_app systemctl --user restart aivio-setup.service

for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${UI_PORT}/api/auth/status" || true)"
  [ "$code" = "200" ] && break
  sleep 1
done
[ "${code:-}" = "200" ] || { as_app journalctl --user -u aivio-setup -n 40 --no-pager || true; die "Giao diện không lên ở cổng $UI_PORT."; }
echo "Giao diện đang chạy ở 127.0.0.1:${UI_PORT}"

say "Cấu hình Nginx cho $DOMAIN"
SITE="/etc/nginx/sites-available/${DOMAIN}"
cat > "$SITE" <<NGINX
# Giao diện quản lý bot - tạo bởi deploy/install-vps.sh
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 20m;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass http://127.0.0.1:${UI_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # Ghi đè (không nối thêm) để IP dùng cho giới hạn đăng nhập sai là IP thật của client.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        # Nhật ký trực tiếp dùng Server-Sent Events: không được đệm.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
NGINX
ln -sf "$SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl reload nginx

if [ "$SKIP_TLS" != "1" ]; then
  say "Xin chứng chỉ HTTPS (Let's Encrypt)"
  public_ip="$(curl -fsS -4 https://api.ipify.org || true)"
  dns_ip="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')"
  if [ -z "$dns_ip" ] || { [ -n "$public_ip" ] && [ "$dns_ip" != "$public_ip" ]; }; then
    warn "$DOMAIN đang trỏ về '${dns_ip:-chưa có bản ghi}', còn IP VPS là '${public_ip:-không rõ}'."
    warn "Tạo bản ghi A: $DOMAIN -> ${public_ip:-<IP VPS>}, đợi DNS cập nhật rồi chạy lại script."
  elif [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    certbot --nginx -d "$DOMAIN" --redirect --non-interactive --keep-until-expiring >/dev/null
    echo "Chứng chỉ đã có, cấu hình lại HTTPS xong."
  else
    [ -n "$EMAIL" ] || die "Thiếu EMAIL cho Let's Encrypt. Chạy lại với EMAIL=ban@vidu.com"
    certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos -m "$EMAIL"
  fi
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null
  echo "Đã mở cổng 80/443 trên ufw."
fi

say "Xong"
cat <<DONE
Mở:              https://${DOMAIN}
Đăng nhập bằng:  mật khẩu quản trị vừa đặt
Project bot ở:   ${APP_HOME}/aivio-bot (tạo trong Cấu hình → Tạo project)

Lệnh hữu ích (chạy bằng root):
  Xem log giao diện:   sudo -u ${APP_USER} XDG_RUNTIME_DIR=/run/user/${APP_UID} journalctl --user -u aivio-setup -f
  Khởi động lại:       sudo -u ${APP_USER} XDG_RUNTIME_DIR=/run/user/${APP_UID} systemctl --user restart aivio-setup
  Đổi mật khẩu:        sudo -u ${APP_USER} -H node ${APP_DIR}/dist/cli.js --set-password
  Cập nhật bản mới:    chạy lại script này với cùng DOMAIN
DONE
