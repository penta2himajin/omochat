# templates

[日本語](./README.ja.md)

Central repository for working conventions and templates used across penta2himajin's repos.

## What this is

- **Audience**: AI coding agents (Claude Code, Cursor, GitHub Copilot, OpenAI Codex) working on penta2himajin's projects, plus the human author.
- **Role**: source of canonical text for `AGENTS.md` (or `CLAUDE.md`), `.rules/`, `.github/ISSUE_TEMPLATE/`, and PR templates.
- **License**: MIT — reuse freely.

Each template is a starting point. Consumer repos override as needed.

## Layout

| Path | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/handoff.md` | Session-handoff issue template. Copy to consumer repos. Also active for this repo (dogfood). |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template requiring `Closes #N` linkage. |
| `AGENTS.md` | Common development rules (TDD, commit conventions, PR workflow). Place at project root. Symlinked from `CLAUDE.md` for Claude Code compatibility. |
| `CLAUDE.md` | Symlink to `AGENTS.md`. Kept for Claude Code backward compatibility. |
| `.rules/` | Path-scoped rules (loaded on demand when matching files are read). |
| `.claude/rules/` | Symlink to `.rules/`. For Claude Code compatibility. |
| `claude-rules/` | Symlink to `.rules/`. Legacy name, kept for backward compatibility. |
| `AGENTS-project-skeleton.md` | Skeleton for project-root `AGENTS.md`. |
| `git-hooks/pre-push` | Shareable pre-push hook running format / lint / clippy. Install with `git config core.hooksPath git-hooks`. |
| `docs/handoff-protocol.md` | Detailed protocol for issue-based session handoff. |
| `docs/i18n-policy.md` | Suffix-file translation policy (`README.ja.md` next to `README.md`). |

## How to use

For a new repo:

1. Copy `AGENTS-project-skeleton.md` to the repo root as `AGENTS.md` and fill in the placeholders.
2. Copy `.github/ISSUE_TEMPLATE/handoff.md` and `.github/PULL_REQUEST_TEMPLATE.md` verbatim.
3. Optionally pull `.rules/examples/*` into `.rules/` and adjust globs.
4. Copy `git-hooks/pre-push` into a `git-hooks/` directory in the consumer repo and run `git config core.hooksPath git-hooks`.
5. If a Japanese audience is in scope, follow `docs/i18n-policy.md` to add `README.ja.md`.

For an existing repo:

- Adopt incrementally. Diff-merge against the existing `AGENTS.md` (or `CLAUDE.md`) rather than replacing wholesale.

## SSOT precedence

When templates here and consumer-repo files diverge, the consumer wins. Templates are descriptive, not authoritative. See `docs/handoff-protocol.md` for the full precedence rule.

## License

MIT. See `LICENSE`.
