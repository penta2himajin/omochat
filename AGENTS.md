# omochat / omoserv

## Overview

**omochat** is an Even G2 Hub plugin (`.ehpk`): thin OpenAI-compatible client + glasses UI.  
**omoserv** is the Android companion under `companion/`: LiteRT-LM + `127.0.0.1:8765` API that omochat calls on-device.

Verification layers and Cloud vs desk split: [`docs/dev-verification.md`](docs/dev-verification.md).  
omoserv design: [`companion/docs/design.md`](companion/docs/design.md).

## Project Structure

```
src/                 # omochat (Vite + Even Hub SDK)
companion/android/   # omoserv Android app
docs/                # engineering SoT (verification, handoff, i18n)
scripts/             # Cloud install + Android SDK bootstrap
.cursor/             # Cursor Cloud environment (Dockerfile + environment.json)
```

## Development Setup

```bash
npm ci
# Optional pre-push hook:
cp git-hooks/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push

# omoserv (desk or Cloud after scripts/setup-android-sdk.sh):
# ANDROID_SDK_ROOT must point at an SDK; companion/android/local.properties is gitignored.
```

Cursor Cloud: `.cursor/environment.json` runs `scripts/cloud-install.sh` on Builds (Node 20, JDK 17, Android SDK 35, `npm ci`, vitest, Gradle unit tests). **No USB / Even Hub / GPU in managed Cloud VMs.**

## Build & Test

Canonical L0–L1 (agents must self-verify with these):

```bash
# omochat L0
npm run verify:l0          # typecheck + vitest
npm run pack               # .ehpk (bump patch versions when shipping)

# omoserv L0 + L2b HTTP contract (needs Android SDK + local.properties sdk.dir)
npm run test:omoserv       # ./gradlew testDebugUnitTest (includes CompanionHttpServerContractTest)

# Hub Simulator (L2a daily)
npm run dev                # terminal A
npm run sim                # terminal B → evenhub-simulator http://localhost:5173
```

Desk L3/L4 only: install omoserv APK, `evenhub qr` / private / Beta + glasses. See `docs/dev-verification.md`.

## Development Principles

- Follow TDD (Red → Green → Refactor) for all implementation work. Write a failing test first; do not ship behaviour without a regression test.
- When packing `omochat.ehpk` for device upload, always bump the patch version in `package.json`, `app.json`, and `src/display.ts` (`APP_VERSION`) together. Even Hub rejects installs if the version is unchanged.
- omoserv (`companion/android` `versionName`) stays on the same **0.1.x** line as omochat. Bump only the **patch** when shipping an APK; never invent a new minor/major (e.g. 0.3 / 0.4) without an explicit user request. `versionCode` may still increase monotonically for Android installs.

## Verification & Cursor Cloud

Source of truth: [`docs/dev-verification.md`](docs/dev-verification.md).

- **Cloud / CI:** L0–L2 only (unit/static, pack/assemble, Hub Simulator automation, omoserv HTTP contract). Do not require USB devices, Even Hub UI, or GPU inference in managed Cloud VMs.
- **Desk:** L3 omoserv on device and L4 Even QR / private / Beta + glasses. That is where BLE, LiteRT GPU, and lock-screen behaviour are confirmed.
- Day-to-day Even plugin loop matches upstream: Vite → `evenhub-simulator` → `evenhub qr` → `evenhub pack`.

## Architectural Boundaries

<!-- Structural invariants that, if violated, break the design. Examples:
- "core crate stays domain-agnostic."
- "Generated code under gen/ is never hand-edited."
- "Layer X must not depend on layer Y." -->

## Prohibitions

<!-- Numbered list of "do not" rules, written so each is verifiable. Do not duplicate the common prohibitions below. -->

1. ...
2. ...

## Git Conventions

<!-- Differences from the common rules below. Examples: scoped Conventional Commits like `feat(phase1d):`, mandatory issue links in PR bodies. -->

## Session Handoff

Long-running workstreams use GitHub issues for cross-session continuity. See `docs/handoff-protocol.md` for the full protocol.

- Label: `session-handoff`
- One issue per workstream (not per session)
- On session start, read the relevant handoff issue and confirm the **Next action** with the user before executing.

## Internationalisation

If this project ships a Japanese-facing entry point, follow `docs/i18n-policy.md`:

- Translations are suffix files (`README.ja.md` next to `README.md`); no language directories.
- Only `README.md` and the user-facing introduction tier of `docs/` are in scope. Engineering docs and ADRs stay English-only.
- Each translated file carries a `> Source: <name>.md @ <sha>` header. PRs are never blocked on translation parity.

---

<!-- Common rules below this line apply to every project. -->

## Common Development Rules

### TDD (Red → Green → Refactor)

All implementation work proceeds in this cycle:

1. **Red**: write a failing test that captures the intended behaviour.
2. **Green**: write the minimum code that makes the test pass.
3. **Refactor**: tidy up while keeping tests green.

When a test fails, fix the production code — do not delete, skip, or weaken the test.

### Measure, Don't Conjecture

Base decisions on observed data, not assumptions. Before optimising, claiming a bottleneck, or asserting that something is slow or broken, measure it — profile, benchmark, log, or reproduce. When you report a cause, cite the measurement that supports it.

### Git Conventions

- **Conventional Commits**: `feat:` `fix:` `docs:` `refactor:` `test:` `ci:` `chore:`. Project-specific prefixes (e.g. `data:`, `experiments:`) live in the project's `AGENTS.md`.
- **Branch naming**: use a short prefix for the agent or author followed by a topic, e.g. `claude/<topic>`, `codex/<topic>`, or `human/<topic>`.
- **Trailer**: when an AI agent authors the commit, append a trailer crediting the agent. Do not embed model name or session info in the trailer; put those in the commit body if needed.
- **Pre-push hook**: install via `cp git-hooks/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push` (or `git config core.hooksPath git-hooks`). The hook runs format / lint / clippy before every push. Tests are intentionally omitted — TDD keeps them green at commit time.

### Pull Requests

- **Always ready for review.** Open PRs in the "ready" state, never as drafts. Draft PRs do not fire review-requested events and slow the loop.
- **Auto-subscribe after creating a PR.** Immediately after the PR is created, subscribe to its activity without asking the user. Rationale: the user explicitly opted into the "agent opens and watches its own PRs" workflow at the template level, so the per-PR confirmation is noise. Unsubscribe only when the user says to stop, when the PR merges, or when it is closed unmerged.
- **One PR per workstream**, matching the handoff issue. Reference the issue with `Closes #N` per `.github/PULL_REQUEST_TEMPLATE.md`.

### Stream Idle Timeout Mitigation

Cloud agent sessions occasionally fail with `Stream idle timeout - partial response received` on long output. To reduce risk:

1. **Stage long writes.** For long documents or source files, write the skeleton (headings, function signatures, trait stubs) first, then fill each section in follow-up edits. Avoid single blocks larger than ~200 lines.
2. **Watch out after large reads.** Reading a big file (e.g. `Cargo.lock`, large generated modules) and then immediately producing long output is a common trigger. Split into separate turns or excerpt only the relevant portion.
3. **Recover carefully.** A timeout can still leave the file write completed. Run `git status` before retrying so the same content is not written twice.

### Common Prohibitions

1. Do not delete, skip, or comment out existing tests.
2. Do not modify CI configuration without explicit instruction.
3. Do not weaken production code merely to make tests pass.
4. Do not commit credentials, API keys, signed URLs, or anything in `.env*`.
