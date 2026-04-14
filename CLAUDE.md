# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
# 開発サーバー（ローカル）
npm run dev

# ビルド
npm run build

# Lint
npm run lint

# テスト全件実行
npm test

# テスト（ウォッチモード）
npm run test:watch

# 特定テストファイルのみ実行
npx jest __tests__/lib/step-ca.test.ts

# Docker でフル起動（step-ca + step-ui）
docker compose up --build

# データをリセットして起動
docker compose down -v && docker compose up --build
```

## アーキテクチャ概要

Next.js 16 App Router（`output: 'standalone'`）で動作する。ブラウザ → Next.js API Routes → step CLI（コンテナ内 `/usr/local/bin/step`）→ step-ca（別コンテナ）という流れ。

### ルーティング構造

- `app/(auth)/login/` — 未認証ユーザー向けログインページ
- `app/(dashboard)/` — 認証必須エリア。`layout.tsx` でセッション確認→未認証なら `/login` にリダイレクト
- `app/api/` — API Routes（全エンドポイントで `auth()` による認証確認が必要）

### コアライブラリ

**`lib/step-ca.ts`** — step-ca とのすべての通信を担う。ここを変更するときは最も注意が必要。

- `withPassFile<T>()` — プロビジョナーパスワードを一時ファイルに書き、コールバック後に必ず削除。シェルインジェクション対策として `execFileSync` に配列形式で渡す。
- `withAdminCert<T>()` — `CA_PROVISIONER` で指定した JWK プロビジョナー（このリポジトリの初期値は `admin`）で有効期限5分の管理者証明書を取得し、コールバック後に削除する。
- `getOneTimeToken()` — JWK OTT を取得（`execFileSync` 配列形式）
- `revokeCertificate()` — @peculiar/x509 が16進数でシリアルを返すのに対し `step ca revoke` は10進数を要求するため `BigInt('0x' + serial).toString(10)` で変換する。また `step ca revoke` は `--provisioner-password-file` 非対応なので `step ca token --revoke` で OTT を取ってから `--token` で渡す。

**`lib/cert-store.ts`** — step-ca の Admin API が x5c 認証必須のため証明書一覧を直接取得できない。代わりに証明書発行時にメタデータを `/app/data/certs.json` に保存し、一覧表示はこのファイルから行う。

**`lib/auth.ts`** — NextAuth v5 Credentials Provider。`UI_PASSWORD_HASH` 環境変数は bcrypt ハッシュを Base64 エンコードした値。Docker Compose が env 値中の `$` を変数展開するため、そのまま設定するとハッシュが破損する。

### 環境変数の注意点

`.env` の `UI_PASSWORD_HASH` は `Buffer.from(hash).toString('base64')` した値を設定する。変更方法:

```bash
node -e "const b=require('bcryptjs'); b.hash('パスワード',10).then(h=>console.log(Buffer.from(h).toString('base64')))"
```

### Docker 構成

| ボリューム | 用途 |
|-----------|------|
| `step-data` | step-ca と step-ui が共有。CA 証明書（`/home/step/certs/`）と設定ファイルを含む |
| `cert-store` | step-ui 専用書き込み可能領域（`/app/data/certs.json`） |
| `caddy-data` / `caddy-config` | 本番 proxy profile でのみ使う Caddy の永続データ |

`NODE_EXTRA_CA_CERTS=/home/step/certs/root_ca.crt` で step-ca の自己署名 TLS を Node.js が信頼する。

step-ui コンテナの runner ステージは `node:20-slim`（Debian）。step CLI バイナリが glibc 依存のため Alpine では動作しない。

### step-ca の Admin API と Remote Management

`step ca init --remote-management` により:
- 初期 JWK プロビジョナーが管理用に昇格される（このリポジトリでは `admin`）
- スーパー管理者 `step` がそのプロビジョナーにリンクされる
- `enableAdmin: true` が ca.json に設定され、プロビジョナー設定は DB 管理になる（ca.json の `provisioners` 配列を直接編集しても反映されない）

Docker Compose は `DOCKER_STEPCA_INIT_*` で初期化し、claims の調整だけを `step-ca-bootstrap` の one-shot ジョブで行う。
本番公開では `docker compose --profile proxy up --build` で Caddy を入口にし、`PUBLIC_URL` が未設定なら `https://${PUBLIC_DOMAIN}` を step-ui の外向け URL に使う。
同じ bootstrap ジョブで `caddy` 用 ACME provisioner も作成し、Caddy の証明書も step-ca から取得する。

プロビジョナー追加・削除は `withAdminCert` 経由で `step ca provisioner add/remove --admin-cert --admin-key` を使う。

### テスト

テストファイルは `__tests__/` 配下に配置。`jest.config.ts` で `reflect-metadata` を setupFiles に含めている（@peculiar/x509 の要件）。API Route のテストは `__tests__/api/`、lib のテストは `__tests__/lib/`。
