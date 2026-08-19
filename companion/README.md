# omoserv (Android)

On-device AI service for **omochat** on Even G2. LiteRT-LM runtime + OpenAI-compatible HTTP API on `127.0.0.1:8765`.

**Design spec:** [docs/design.md](./docs/design.md)

## Product pair

| App | Role |
|-----|------|
| **omochat** | Even G2 plugin — chat on glasses, settings on phone |
| **omoserv** | Android app — local inference + API (+ minimal phone chat, Phase 2+) |

Phase 1: `GET /hello` → `Hello, world`.

## Build (OrbStack / Docker)

```bash
orbctl start   # if needed
cd companion/android
./build.sh
```

APK: `companion/android/app/build/outputs/apk/debug/app-debug.apk`

## Install & run

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.penta2himajin.omochat.companion/.MainActivity
```

Keep the foreground notification active (HTTP server on port **8765**).

## Test from omochat ehpk

1. Pack/install omochat with `http://127.0.0.1:8765` in `app.json` network whitelist.
2. Start omoserv on the phone.
3. Open omochat on glasses — diagnostics show `omoserv: ok`.

## Endpoints (Phase 1)

| Path | Response |
|------|----------|
| `GET /hello` | `Hello, world` (text/plain) |
| `GET /health` | `{"ok":true,"service":"omoserv"}` |

All responses include CORS headers (`Access-Control-Allow-Origin: *`).
