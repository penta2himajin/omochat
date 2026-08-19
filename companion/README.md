# omochat companion (Android)

Local HTTP sidecar for omochat on Even G2. Phase 1 serves `GET /hello` → `Hello, world`.

## Build (OrbStack / Docker)

Requires [OrbStack](https://orbstack.dev/) (or Docker). Start OrbStack if the daemon is not running:

```bash
orbctl start   # if needed
```

```bash
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
2. Open with `?companionProbe=1` (or `?probeOnly=1&companionProbe=1`).
3. TextContainer should show `companion: ok` and `companion-body: Hello, world`.

## Endpoints

| Path | Response |
|------|----------|
| `GET /hello` | `Hello, world` (text/plain) |
| `GET /health` | `{"ok":true,"service":"omochat-companion"}` |

All responses include CORS headers (`Access-Control-Allow-Origin: *`).
