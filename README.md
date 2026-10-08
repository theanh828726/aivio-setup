<div align="center">

# 🎓 Học Viện Đào Tạo AI — Bot Setup

### Build AI chatbots for Telegram, Zalo and Facebook Messenger on OpenClaw, powered by the HVDTAI Router

<p align="center">
  <img src="https://img.shields.io/badge/RELEASE-v1.2.0-0EA5E9?style=for-the-badge" alt="Version 1.2.0" />
  <a href="https://router.aivio.vn"><img src="https://img.shields.io/badge/HVDTAI_ROUTER-router.aivio.vn-22C55E?style=for-the-badge" alt="HVDTAI Router" /></a>
  <img src="https://img.shields.io/badge/license-MIT-8B5CF6?style=for-the-badge" alt="MIT" />
</p>

[Tiếng Việt](README.vi.md) · **English**

<img src="docs/dashboard.png" alt="Aivio Bot Setup dashboard" width="90%" />

</div>

---

Aivio Bot Setup is a local web UI that installs and configures [OpenClaw](https://openclaw.ai). Bots run inside the OpenClaw Gateway as an OS service, receive messages from chat channels and call AI models through the **HVDTAI Router** at `https://router.aivio.vn/v1` (combo `smart-route`).

The full step-by-step guide is in Vietnamese: [README.vi.md](README.vi.md).

## Quick start

Requires Node.js 24 LTS and Git.

```bash
npx --yes github:theanh828726/aivio-setup
```

or

```bash
git clone https://github.com/theanh828726/aivio-setup.git
cd aivio-setup
npm start
```

The UI opens at `http://127.0.0.1:51789`.

1. On router.aivio.vn: connect providers, create a combo named exactly `smart-route`, create an API key under **Endpoints**.
2. In the console: **Settings** → **Create project** → pick your OS → **Native**.
3. **Overview** → **HVDTAI Router** → **Set key** → paste the key.
4. **Agents** → **Create bot** → pick a channel (Telegram, Zalo Bot API, personal Zalo, Facebook Messenger).

## Running on a VPS

`deploy/install-vps.sh` installs Node.js 24, runs the console as an unprivileged user's systemd service, and puts Nginx + Let's Encrypt in front of it. With an admin password set, every request needs a signed session cookie; proxied requests are refused until a password exists. See [deploy/README.vi.md](deploy/README.vi.md).

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `AIVIO_ROUTER_MODE` | `remote` | Set to `local` to point new bots at the bundled 9Router (`127.0.0.1:20128`) instead of router.aivio.vn |
| `AIVIO_SETUP_SPEC` | `github:theanh828726/aivio-setup` | Source used by the in-app **Update** button, e.g. `create-aivio-bot@latest` once published to npm |
| `AIVIO_ADMIN_PASSWORD` | (empty) | Sets the admin password at startup (hashed, then removed from the environment) |
| `AIVIO_SETUP_HOME` | `~/.aivio-setup` | Where `auth.json` (the admin password hash) lives |

## Development

Edit `src/`, then run `npm run build` to regenerate the committed `dist/`. `npm run check:dist` fails when `dist/` is out of date.

## Credits

Built by [Học Viện Đào Tạo AI](https://hocvienai.com). Based on [OpenClaw Setup](https://github.com/tuanminhhole/openclaw-setup) by tuanminhhole (MIT); its changelog is kept in [docs/upstream](docs/upstream). Released under the [MIT License](LICENSE).
