# omoserv (Android)

On-device AI service for **omochat** on Even G2. LiteRT-LM (Gemma 4 E4B GPU) + OpenAI-compatible HTTP API on `127.0.0.1:8765`.

**Design spec:** [docs/design.md](./docs/design.md)

## Product pair

| App | Role |
|-----|------|
| **omochat** | Even G2 plugin — chat on glasses, settings on phone |
| **omoserv** | Android app — local LiteRT-LM + API + phone chat |

## First-run (model)

1. Install/start omoserv.
2. Tap **Download model** (~3.0 GB `gemma-4-E4B-it-gpu.litertlm`, Wi‑Fi recommended). Or push a pre-fetched copy from `companion/models/` via `adb`.
3. Tap **Load model into memory** (GPU preferred, CPU fallback).
4. Copy API URL + token into omochat phone settings.

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

## Endpoints

| Path | Auth | Response |
|------|------|----------|
| `GET /hello` | No | `Hello, world` |
| `GET /health` | No | service + model/llm ready flags |
| `GET /v1/models` | Bearer | `gemma-4-e4b` |
| `POST /v1/chat/completions` | Bearer | LiteRT-LM chat (JSON or SSE) |
| `POST /v1/audio/transcriptions` | Bearer | OS SpeechRecognizer STT (PCM/WAV → `{text}`) |

Bind: `127.0.0.1:8765` only.

All responses include CORS headers (`Access-Control-Allow-Origin: *`).
