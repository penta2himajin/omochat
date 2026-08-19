# templates

> Source: README.md @ e0c3741933be6029765c21caeb84cb2b69966df9
>
> [English](./README.md)

penta2himajin のリポジトリ群で共通利用する作業規約とテンプレートを集めた中央リポジトリ。

## このリポジトリの位置付け

- **対象読者**: penta2himajin のプロジェクトで作業する AI コーディングエージェント（Claude Code, Cursor, GitHub Copilot, OpenAI Codex）、および人間の作者。
- **役割**: `AGENTS.md`（または `CLAUDE.md`）、`.rules/`、`.github/ISSUE_TEMPLATE/`、PR テンプレートの正本テキスト供給元。
- **ライセンス**: MIT — 自由に再利用可。

各テンプレートは出発点であり、消費側リポジトリで自由に上書きしてよい。

## レイアウト

| パス | 用途 |
|---|---|
| `.github/ISSUE_TEMPLATE/handoff.md` | セッションハンドオフ用 Issue テンプレート。消費側にコピーする。本リポジトリ自身でも採用（ドッグフード）。 |
| `.github/PULL_REQUEST_TEMPLATE.md` | `Closes #N` での Issue 紐付けを要求する PR テンプレート。 |
| `AGENTS.md` | 共通開発規約（TDD, コミット規約, PR ワークフロー）。プロジェクトルートに配置。Claude Code 互換のため `CLAUDE.md` からシンボリックリンクされている。 |
| `CLAUDE.md` | `AGENTS.md` へのシンボリックリンク。Claude Code 後方互換用。 |
| `.rules/` | パススコープルール（該当ファイル読み込み時にオンデマンドでロード）。 |
| `.claude/rules/` | `.rules/` へのシンボリックリンク。Claude Code 互換用。 |
| `claude-rules/` | `.rules/` へのシンボリックリンク。後方互換用のレガシー名。 |
| `AGENTS-project-skeleton.md` | プロジェクトルート `AGENTS.md` の雛形。 |
| `git-hooks/pre-push` | フォーマット / リント / clippy を実行する共有 pre-push フック。`git config core.hooksPath git-hooks` で有効化。 |
| `docs/handoff-protocol.md` | Issue ベースのセッションハンドオフの詳細プロトコル。 |
| `docs/i18n-policy.md` | サフィックス方式の翻訳ポリシー（`README.ja.md` を `README.md` の隣に置く）。 |

## 使い方

新規リポジトリで使う場合:

1. `AGENTS-project-skeleton.md` をリポジトリ直下に `AGENTS.md` としてコピーし、プレースホルダを埋める。
2. `.github/ISSUE_TEMPLATE/handoff.md` と `.github/PULL_REQUEST_TEMPLATE.md` をそのままコピーする。
3. 必要に応じて `.rules/examples/*` を `.rules/` に取り込み、`globs` を調整する。
4. `git-hooks/pre-push` を消費側リポジトリの `git-hooks/` に置き、`git config core.hooksPath git-hooks` を実行する。
5. 日本語読者を想定する場合は `docs/i18n-policy.md` に従って `README.ja.md` を追加する。

既存リポジトリに導入する場合:

- 段階的に取り込む。一括置換ではなく、既存 `AGENTS.md`（または `CLAUDE.md`）との差分マージで対応する。

## SSOT 優先順位

このリポジトリのテンプレートと消費側リポジトリのファイルが食い違う場合、**消費側が勝つ**。テンプレートは記述的であって権威的ではない。詳細な優先順位は `docs/handoff-protocol.md` を参照。

## ライセンス

MIT。詳細は `LICENSE` を参照。
