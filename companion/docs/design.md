# omoserv — design spec (Android)

**omoserv** is the on-device AI service for [omochat](../../). This document covers the Android app only; iOS is a separate design.

## Product pair

| Name | What it is |
|------|------------|
| **omochat** | Even G2 plugin (`.ehpk`). Chat UI on glasses; settings on phone WebView. Thin OpenAI HTTP client → omoserv. |
| **omoserv** | Android app. Local LiteRT-LM runtime + minimal OpenAI-compatible HTTP API. Minimal phone chat UI (same API). Powers omochat on glasses. |

```
Even G2  ←BLE→  Even app WebView (omochat)
                     │
                     │  Authorization: Bearer …
                     ▼
              omoserv (same phone)
              ├─ phone chat UI  ──┐
              ├─ OpenAI /v1/*  ←┼─ same HTTP API
              └─ LiteRT-LM      │
                     ▲          │
                     └──────────┘
```

**Pronunciation:** オモサーブ

**Android package (current):** `com.penta2himajin.omochat.companion`  
**Planned package:** `com.penta2himajin.omoserv` (rename in a later release)

Repo path `companion/` is unchanged; product name is **omoserv**.

## 1. Positioning

omoserv is **not** a duplicate of omochat on glasses. It is:

1. **Local inference host** — LiteRT-LM on `127.0.0.1:8765`
2. **OpenAI-compatible API** — for omochat ehpk and external-compatible clients
3. **Phone-side utility** — minimal chat, model/setup, connection test (dogfoods the same API)

| Primary UX | Secondary UX |
|------------|--------------|
| omochat on **glasses** | omoserv **phone chat** (setup, debug, standalone) |

Conversation history is **not shared** between omoserv phone chat and omochat glasses in v1.

## 2. Shared WebView model (glassearch pattern)

glassearch and [Hrdle glasses](https://github.com/hrdle/hrdle/tree/main/glasses) use **one ehpk plugin, one WebView, shared state**:

- Logic lives in the phone-side Even Realities app WebView.
- Glasses are display + input (TextContainer, gestures).
- Opening the plugin in the **Even phone app** shows the same state. No separate sync channel.

From glassearch `docs/architecture.md`:

> Phone UI and glasses UI are the same plugin. Opening glassearch in the Even app shows the current query; there is no second sync channel.

> The WebView holds `AppState` and persists it with `setLocalStorage` on every meaningful change (Android may reclaim the WebView).

omochat follows the same model:

| Surface | omochat behaviour |
|---------|-------------------|
| **Phone WebView** (`appMenu`) | Settings: paste omoserv API base URL + token, test, save. |
| **Glasses WebView** (`glassesMenu`) | Chat: read saved config, call omoserv `/v1/*`. |

Persist API settings with the Even Hub SDK bridge:

```ts
await bridge.setLocalStorage('omochat.api.baseUrl', baseUrl)
await bridge.setLocalStorage('omochat.api.token', token)
```

## 3. User setup flow

1. Install and start **omoserv** (foreground service on port `8765`).
2. Copy **API Base URL** and **API Token** from the omoserv UI.
3. Optionally test chat inside omoserv (same API).
4. Open **omochat** in the **Even phone app**.
5. Paste URL and token → **Save** (bridge localStorage).
6. Open **omochat on glasses** → chat via omoserv.

No auto-pairing, no non-OpenAI session endpoints.

### Token regeneration (omoserv UI)

Confirmation dialog before regenerate:

> Regenerating the API token will invalidate the current token. All clients (including omochat on your glasses) will stop working until you register the new token. Continue?

On confirm: new token, persist, display + copy. Old token rejected immediately.  
omochat ehpk: on `401`, prompt to update token in phone settings.

## 4. Inference runtime

**LiteRT-LM (Kotlin)** — `com.google.ai.edge.litertlm:litertlm-android`

| Backend | Use |
|---------|-----|
| NPU | Preferred when available |
| GPU | Primary on Samsung (OpenCL) |
| CPU | Fallback |

- Model format: `.litertlm` (aligned with omochat web path).
- `engine.initialize()` on a background thread / coroutine.
- Single-flight inference scheduler (LLM + future STT).

**APK packaging (16KB page size):** LiteRT-LM ships `liblitertlm_jni.so` with ELF LOAD align 16KB. Build with AGP **≥ 8.5.1** and `packaging.jniLibs.useLegacyPackaging = false` so uncompressed `.so` zip entries are 16KB-aligned. Older AGP (e.g. 8.2.x) triggers Play/compat warnings (“APK alignment check failed” / “uncompressed library does not match”) and can crash on load/inference on devices that enforce 16KB-ready packages.

**Streaming API caveat:** Do **not** use LiteRT-LM’s Flow `sendMessageAsync` overload. Its `callbackFlow` calls `SendChannel.close$default` on the interface, but kotlinx-coroutines ships that helper on `SendChannel.DefaultImpls` → `NoSuchMethodError` at `onDone`. Use the `MessageCallback` overload instead.

**SSE transport:** Do **not** write SSE from the LiteRT JNI callback into `PipedOutputStream`. Client disconnect closes the pipe and an uncaught `IOException: Pipe closed` on the JNI thread kills the process. Enqueue bytes on a thread-safe queue (`SseByteQueue`) and let NanoHTTPD read that stream; never let exceptions escape `MessageCallback`.

## 5. Authentication

OpenAI-compatible **`Authorization: Bearer <token>`** on all `/v1/*` routes.

| Item | Policy |
|------|--------|
| Token generation | `SecureRandom` on first service start |
| Storage | `EncryptedSharedPreferences` |
| Bind address | **`127.0.0.1` only** |
| omoserv UI | URL + token, copy, regenerate (with confirm) |
| Probe routes | `/hello`, `/health` — no auth |

Threat model: localhost + bearer token; not wire-level security.

## 6. HTTP API

### 6.1 Route summary

| Method | Path | Auth | Phase |
|--------|------|------|-------|
| GET | `/hello` | No | 1 ✅ |
| GET | `/health` | No | 1 ✅ |
| GET | `/v1/models` | Bearer | 2 |
| POST | `/v1/chat/completions` | Bearer | 2 |
| POST | `/v1/audio/transcriptions` | Bearer | 3 (STT) |

Base URL in omoserv UI: `http://127.0.0.1:8765/v1`

CORS: `Access-Control-Allow-Origin: *`

### 6.2 Error format

```json
{
  "error": {
    "message": "Invalid API token",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

### 6.3 `GET /v1/models`

```json
{
  "object": "list",
  "data": [
    {
      "id": "gemma-4-e4b",
      "object": "model",
      "created": 0,
      "owned_by": "omoserv",
      "model_ready": true,
      "llm_ready": false,
      "backend": "none"
    }
  ]
}
```

`model_ready` / `llm_ready` / `backend` mirror `/health` so clients can surface “Download” / “Load model” guidance after a models list call.

### 6.4 `POST /v1/chat/completions`

Minimal request: `model`, `messages`, `stream`, `max_tokens`, `temperature`.

Stream: SSE, OpenAI-compatible `data: …` lines + `data: [DONE]`.

### 6.5 `POST /v1/audio/transcriptions` (Phase 3)

OpenAI-compatible multipart transcriptions:

| Field | Notes |
|-------|--------|
| `file` | Required. Raw PCM s16le mono 16 kHz (Even G2 / Hub) or PCM WAV with the same format |
| `model` | Accepted; ignored for routing (`omoserv-os-stt`) |
| `language` | Optional. `ja` → `ja-JP`, `en` → `en-US` |

Response (default `json`):

```json
{ "text": "認識結果" }
```

**Engine (spike):** platform `SpeechRecognizer` with `RecognizerIntent.EXTRA_AUDIO_SOURCE` (PCM pipe at realtime rate). Availability is OEM-dependent; `/health` exposes `stt_ready` / `stt_backend`. Fallback to ML Kit `AudioSource.fromPfd` if OS injection fails on device.

## 7. omochat ehpk client

Thin **OpenAI HTTP client only** (no in-WebView LiteRT / WebGPU):

```ts
type OmochatApiConfig = {
  baseUrl: string   // http://127.0.0.1:8765/v1
  token: string
}
```

Phone settings: save URL+token; connection test calls `/health` then `/v1/models` and prompts Download/Load when needed.
Glasses chat: `streamChatCompletion` against omoserv.

**Backend selection:**

```
if (api config set) → OpenAiClient → omoserv
else                → setup prompt (Even phone app)
```

Same client type can target external OpenAI-compatible APIs later.

## 8. omoserv internal architecture

```
OmoservHttpServer
    ├─ ProbeHandler       /hello, /health
    ├─ OpenAiV1Router     /v1/*
    └─ PhoneChatUi        calls localhost /v1 (dogfood)

InferenceScheduler
    ├─ LlmEngine → LiteRtLmEngine
    └─ SttEngine → OsSpeechSttEngine (EXTRA_AUDIO_SOURCE spike)

ModelStore · TokenStore
```

## 9. Implementation phases

| Phase | omoserv | omochat ehpk |
|-------|---------|--------------|
| **1** ✅ | `/hello`, `/health`, foreground service | omoserv probe, diagnostics |
| **2a** ✅ | Bearer auth, stub `/v1/chat/completions`, token UI + stub phone chat | phone settings, OpenAiClient |
| **2b** ✅ | LiteRT-LM Kotlin (Gemma 4 E4B GPU), real streaming, model download/load | glasses chat via omoserv |
| **2c** ✅ | polish `/v1/models` metadata (+ readiness) | thin OpenAI-only ehpk; health-aware connection test |
| **3** | `/v1/audio/transcriptions` (OS SpeechRecognizer + EXTRA_AUDIO_SOURCE spike) | STT client (mic → POST) |
| **4a** 🚧 | LiteRT-LM tools: time, calendar list/details, `getCurrentLocation` (Geocoder + last-known age) | unchanged thin client |

## 10. Non-goals (Android v1)

- iOS omoserv (separate design)
- `/v1/session` or non-OpenAI pairing
- Shared conversation history (phone ↔ glasses)
- Web search / cloud tool backends (deferred)
- Binding HTTP to `0.0.0.0`

## 11. References

- glassearch `docs/architecture.md` — shared WebView
- [Even Hub SDK storage](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
- [LiteRT-LM Android](https://developers.google.com/edge/litert-lm/android)
- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Audio transcriptions](https://platform.openai.com/docs/api-reference/audio/createTranscription)
