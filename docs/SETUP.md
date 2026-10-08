# Aivio Bot Setup — operations guide

The full guide is in Vietnamese: [SETUP.vi.md](SETUP.vi.md). This page covers the essentials.

## Move an existing project to router.aivio.vn

Projects created by v1.0.0, or with `AIVIO_ROUTER_MODE=local`, still call the bundled 9Router.

1. In `<project>/.openclaw/openclaw.json`, set `models.providers.9router.baseUrl` to `https://router.aivio.vn/v1`.
2. Reopen the Setup UI → **Dashboard** → **HVDTAI Router** card → **Set key** → paste a key from router.aivio.vn → **Endpoints**.
3. Validate and restart:

    ```bash
    cd <project>
    export OPENCLAW_HOME="$PWD/.openclaw" OPENCLAW_STATE_DIR="$PWD/.openclaw"
    openclaw config validate
    openclaw daemon restart
    ```

Do not paste the key into `openclaw.json` by hand: OpenClaw keeps the first key it saw in an auth profile that outranks the config file. **Set key** removes that profile; by hand, use `openclaw models auth list` and `openclaw models auth logout <profileId> --yes`.

## Ports

| Port | Service |
|---|---|
| 51789 | Setup UI |
| 18789 | OpenClaw Gateway (Control UI, Messenger webhook) |
| 18790 | Zalo Mod dashboard (always gateway + 1) |
| 20128 | Bundled 9Router (only with `AIVIO_ROUTER_MODE=local`) |

Everything listens on `127.0.0.1`. On a VPS, open an SSH tunnel:

```bash
ssh -L 51789:127.0.0.1:51789 -L 18789:127.0.0.1:18789 -L 18790:127.0.0.1:18790 <user>@<server>
```

## Common problems

| Symptom | Fix |
|---|---|
| `9router/smart-route request failed (authentication failed)` | **Set key** with a valid router.aivio.vn key |
| Router returns model not found | Create a combo named exactly `smart-route` on router.aivio.vn |
| Bot still calls `localhost:20128` | Follow "Move an existing project" above |
| Bot stops when SSH closes | `sudo loginctl enable-linger <user>` |
| `Unsupported channel "zalo-connect"` | `openclaw plugins install clawhub:openclaw-zalo-connect --force --accept-capabilities` |
