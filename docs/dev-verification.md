# Development & verification Source of Truth

**Status:** active SoT for how omochat / omoserv are verified before and after device runs.  
**Audience:** humans and coding agents (local or Cursor Cloud).  
**Non-goal:** reproducing Even G2 + Even Hub + LiteRT GPU fidelity inside Cursor-managed cloud VMs.

When this doc conflicts with chat history or ad-hoc notes, **this file wins** until a later commit revises it.

---

## 1. Goals

| Do | Do not (for now) |
|---|---|
| Catch layout, client, and API-contract bugs before a desk session | Run Z Flip / glasses / Even Hub on Cursor-hosted cloud VMs |
| Make the official Even loop (sim → QR → pack) reproducible | Treat Android SDK emulator or Hub Simulator as L4 substitutes |
| Keep real-device time for GPU, BLE, permissions, and lock-screen quirks | Invent cloud KVM / USB device labs as the primary path |

**Success:** a desk session mostly finds *fidelity gaps* (BLE timing, GPU, Hub packaging), not regressions that L0–L2 should have caught.

---

## 2. Product surfaces

| Surface | Role |
|---|---|
| **omochat** | Even Hub plugin (`.ehpk`). Thin OpenAI client + glasses UI via Hub SDK. |
| **omoserv** | Android companion. LiteRT-LM + `127.0.0.1:8765` OpenAI-compatible API. |

Architecture detail: `companion/docs/design.md`.

Even Hub apps are phone WebView logic; glasses are display + input over BLE  
([Architecture](https://hub.evenrealities.com/docs/get-started/architecture)).

---

## 3. Official Even Hub loop (adopt as-is)

From [Overview](https://hub.evenrealities.com/docs/get-started/overview) and community practice
([gpsnmeajp / Segment scrap](https://zenn.dev/gpsnmeajp/scraps/beb45043a2d731),
[miyaura](https://zenn.dev/miyaura/articles/eveng2-part1-getstarted-0ed90d3aa144e8)):

```text
1. Write          Vite + Even Hub SDK
2. Preview        evenhub-simulator http://localhost:5173
3. On device      evenhub qr  (Local Testing, HMR)
4. Package        evenhub pack → .ehpk
5. Ship gate      Private / Beta Testing (lock-screen parity)
```

[Testing modes](https://hub.evenrealities.com/docs/test/):

| Mode | Hardware | Hot reload | Survives phone lock | Reviewer parity | Our use |
|---|---|---|---|---|---|
| **Simulator** | No | n/a | n/a | No | Daily + CI/Cloud (L2a) |
| **Local Testing (QR)** | Yes | Yes | **No** | No | Desk iteration (L4-fast) |
| **Private Testing** | Yes | No | Partial | Closer | First real `.ehpk` |
| **Beta Testing** | Yes | No | **Yes** | **Yes** | Pre-submit / lock 5 min |

### Fidelity notes (do not paper over)

- **Hub Simulator** is Node + LVGL preview, **not** a hardware emulator. Layout / copy / event logic yes; BLE timing, frame pacing, pixel-perfect fonts no  
  ([Simulator](https://hub.evenrealities.com/docs/test/simulator)).
- **QR sideload** dies when the Even app WebView backgrounds; lock-screen QA requires Beta  
  ([Local Testing](https://hub.evenrealities.com/docs/test/local-testing), [Beta Testing](https://hub.evenrealities.com/docs/test/beta-testing)).
- **QR network rules are looser** than packaged apps. Packaged plugins need HTTPS + exact `app.json` `network` entries; whitelist ≠ CORS bypass  
  (architecture docs; community notes in gpsnmeajp scrap).
- Some device APIs work only after Hub upload, not under QR (e.g. geolocation reports in [bigdra](https://zenn.dev/bigdra/articles/eveng2-sdk-features)).
- omochat `localhost` → omoserv is a **dev path**. Packaged Hub networking is a separate checklist item.

---

## 4. Verification layers

```text
L0  Unit / static
    omochat: vitest, tsc, pretext / hubPaint budgets
    omoserv: Gradle unit tests

L1  Artifacts
    npm run pack → omochat.ehpk  (bump patch in package.json + app.json + APP_VERSION)
    ./gradlew assembleDebug      (omoserv 0.1.x patch only when shipping)

L2a Hub Simulator (plugin)
    vite + evenhub-simulator
    optional --automation-port smoke (boot, lit pixels, exit dialog)

L2b API contract (omoserv ↔ client)
    HTTP to 127.0.0.1:8765 (JVM/Node and/or thin Web client with browserConfigStorage)
    Android emulator + omoserv APK is an optional L2b strengthen — not required for Cloud

L3  Desk Android device (omoserv APK, GPU load, permissions, logcat)
L4  Desk Even stack (QR or private/beta .ehpk + glasses + BLE)
```

**Android SDK emulator:** fine for generic APK / HTTP smoke; weak for LiteRT GPU (Samsung OpenCL path) and useless as Even Hub host.  
**“ehpk-equivalent WebView → omoserv in emulator”:** valid **L2b** for OpenAI client + settings; not Hub TextContainer / glasses fidelity.

---

## 5. Cursor Cloud vs desk

```text
Cursor Cloud / CI                 Desk (human; optional My Machines)
───────────────────────────      ────────────────────────────────
L0–L1                            L3 omoserv on Z Flip
L2a simulator automation         L4 QR / private / Beta + glasses
L2b HTTP contract tests          LiteRT GPU, real sensors, BLE
.environment.json + Builds
```

Hard limits of Cursor-managed cloud VMs today: no productized KVM Android emulator, no USB devices, no Even Hub account UI. Prefer **My Machines / self-hosted workers** only if desk automation of L3 is needed later — not as the first milestone.

---

## 6. Implementation phases

### Phase 0 — Document (this file)

- Keep this SoT updated when layers or commands change.
- Point agents here from `AGENTS.md`.

### Phase 1 — L0/L1 green on Cloud ✅ (toolchain checked in)

- `.cursor/environment.json` + `.cursor/Dockerfile` (Ubuntu 24.04, Node 20, JDK 17).
- `scripts/cloud-install.sh` → `npm ci`, `scripts/setup-android-sdk.sh` (SDK 35), disposable debug keystore, `npm run verify:l0`, `gradlew testDebugUnitTest`.
- Canonical commands live in `AGENTS.md` Build & Test (`verify:l0`, `test:omoserv`, `pack`, `sim`).
- Do **not** require adb devices or emulators in Cloud install.

### Phase 2 — L2a Hub Simulator daily + automation ✅

```bash
npm run verify:l2a
# manual:
npm run dev
npm run sim          # or npm run sim:auto for automation port
```

- `@evenrealities/evenhub-simulator` is a devDependency.
- L2a automation is `@penta2himajin/even-deskless` (`npm run verify:l2a` → `even-deskless verify-l2a`):
  ping → `[omochat] ready` console → lit-pixel framebuffer → gesture sequence (down/up/click) → still alive.
  Config: `package.json` `evenDeskless.readyMarker` / `evenDeskless.appUrl` (`?companionProbe=0`).
  (System exit-dialog on double-tap is L4 / Beta QA — omochat consumes double_click for view toggle.)
- Headless Linux uses `xvfb-run` (installed in `.cursor/Dockerfile`).
- Smoke loads `?companionProbe=0` so it does not require omoserv on :8765.

### Phase 3 — L2b omoserv API contract ✅ (JVM live HTTP)

Priority order:

1. ~~JVM against `/hello`, `/health`, `/v1/models`, `/v1/chat/completions` (stub LLM).~~  
   `CompanionHttpServerContractTest` — real NanoHTTPD on ephemeral port, no Context / GPU.  
   Covered by `npm run test:omoserv` / `scripts/cloud-install.sh`.
2. Same contract via omochat `createOpenAiClient` + `browserConfigStorage` (optional follow-up).
3. Optional: emulator APK + thin WebView (no GPU expectation).

### Phase 4 — Desk ritual (outside Cloud)

**Feature complete / daily:**

1. Install omoserv on device → load model (GPU).
2. `evenhub qr` → glasses chat 1–2 turns + one tool under test.
3. Watch omoserv logcat for the feature tag.

**Pre-release:**

4. `npm run pack` (version bump) → Private/Beta.
5. Lock phone 5 minutes; root double-tap exit dialog  
   ([App Submission & QA](https://hub.evenrealities.com/docs/ship/app-submission)).

---

## 7. First implementation slice (for the main session)

1. ~~Scripts + AGENTS Build & Test + `.cursor/environment.json` for L0–L1.~~
2. ~~Add Hub Simulator to the toolchain; standardize manual `sim` usage.~~
3. ~~Minimal simulator automation smoke (L2a).~~
4. ~~omoserv HTTP contract tests (L2b JVM).~~
5. Optional: client+storage Vitest against live omoserv; emulator WebView only if still needed.

**Deskless gate before merge:** `npm run verify:deskless` (L0 + L2b + L2a). L3/L4 remain desk-only.

---

## 8. Risks (accepted)

| Risk | Mitigation |
|---|---|
| Simulator ≠ BLE / font perfection | Desk L4 before ship |
| QR ≠ packaged network / permissions | Pack path before submit; document localhost as dev-only |
| Background / locked WebView fragility | Beta checklist only; not L0–L2 |
| Cloud agents over-claim device verification | AGENTS + this SoT forbid L3/L4 in managed Cloud |

---

## 9. References

- Even Hub: [Overview](https://hub.evenrealities.com/docs/get-started/overview), [Architecture](https://hub.evenrealities.com/docs/get-started/architecture), [Test](https://hub.evenrealities.com/docs/test/), [Simulator](https://hub.evenrealities.com/docs/test/simulator), [Local Testing](https://hub.evenrealities.com/docs/test/local-testing), [Beta Testing](https://hub.evenrealities.com/docs/test/beta-testing)
- Community: [gpsnmeajp Even G2 scrap](https://zenn.dev/gpsnmeajp/scraps/beb45043a2d731), [miyaura intro](https://zenn.dev/miyaura/articles/eveng2-part1-getstarted-0ed90d3aa144e8), [bigdra SDK notes](https://zenn.dev/bigdra/articles/eveng2-sdk-features)
- In-repo: `companion/docs/design.md`, `docs/handoff-protocol.md`
- Cursor Cloud: [Cloud Agents](https://cursor.com/docs/cloud-agent.md), [Setup](https://cursor.com/docs/cloud-agent/setup.md), [My Machines](https://cursor.com/docs/cloud-agent/my-machines.md)
