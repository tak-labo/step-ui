# step-ui 設計書

**作成日**: 2026-04-13  
**参照リポジトリ**: https://github.com/needsone/step-ca-light-gui  
**ステータス**: 承認済み

---

## 概要

Smallstep CA（step-ca）の証明書管理をWebブラウザから操作できる軽量GUIをNext.js + Reactで新規開発する。既存のPHP実装（step-ca-light-gui）のコードを参考にしつつ、モダンなフルスタックNext.jsアプリとして再設計する。

---

## 要件

### 機能要件

| 機能 | 説明 |
|------|------|
| 証明書生成 | ホスト名・SAN・有効期限を指定してstep-caで証明書を発行 |
| 証明書一覧・詳細 | 発行済み証明書の一覧表示（期限切れ警告付き）と詳細情報表示 |
| 証明書更新（renew） | 既存証明書を更新して新しい証明書を発行 |
| 証明書失効（revoke） | 既存証明書を失効させる |
| ダウンロード | PEM形式（証明書・秘密鍵）とPKCS12（PFX）形式でのエクスポート |
| ACME対応 | ACMEプロビジョナーの一覧・作成・削除、接続エンドポイントURL表示 |
| ユーザー認証 | ユーザー名/パスワードによるUIログイン（NextAuth.js） |

### 非機能要件

- Docker Composeで一発起動できること
- step-caとNext.jsが同一Docker Composeで管理されること
- APIキー等の機密情報は環境変数または`.env`で管理し`.gitignore`に追加

---

## アーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────┐
│               Docker Compose                    │
│                                                 │
│  ┌─────────────────────┐   ┌─────────────────┐ │
│  │   Next.js (:3000)   │   │  step-ca (:9000)│ │
│  │                     │   │                 │ │
│  │  App Router         │──▶│  CA API         │ │
│  │  ├─ /login          │   │  Admin API      │ │
│  │  ├─ /certificates   │   │  ACME API       │ │
│  │  └─ /acme           │   │                 │ │
│  │                     │   └─────────────────┘ │
│  │  API Routes (/api)  │                       │
│  │  ├─ /certificates   │                       │
│  │  └─ /acme           │                       │
│  └─────────────────────┘                       │
└─────────────────────────────────────────────────┘
```

### データフロー

1. ブラウザ → Next.js UIページ（App Router / Server Components）
2. UIからのアクション → Next.js API Routes（`/api/...`）
3. Next.js API Routes → step-ca REST API（HTTPS、`CA_URL`環境変数で設定）
4. step-caが処理した結果 → API Routes → ブラウザへJSON/バイナリで返す

### 認証フロー

- **UI認証**: NextAuth.js（Credentials Provider）を使用。`.env`の`UI_USERNAME`/`UI_PASSWORD_HASH`（bcrypt）で検証
- **step-ca API認証**: JWKプロビジョナーのパスワードを環境変数から取得し、OTT（One-Time Token）を生成してAPIリクエストに添付

---

## ディレクトリ構造

```
step-ui/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # ログインページ
│   ├── (dashboard)/
│   │   ├── layout.tsx            # サイドバー付きレイアウト（要認証）
│   │   ├── certificates/
│   │   │   ├── page.tsx          # 証明書一覧
│   │   │   ├── [name]/
│   │   │   │   └── page.tsx      # 証明書詳細
│   │   │   └── new/
│   │   │       └── page.tsx      # 証明書生成フォーム
│   │   └── acme/
│   │       └── page.tsx          # ACMEプロビジョナー管理
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts      # NextAuth.js
│       ├── certificates/
│       │   ├── route.ts          # GET: 一覧 / POST: 生成
│       │   └── [name]/
│       │       ├── route.ts      # GET: 詳細 / DELETE: 削除
│       │       ├── renew/
│       │       │   └── route.ts  # POST: 更新
│       │       ├── revoke/
│       │       │   └── route.ts  # POST: 失効
│       │       └── export/
│       │           └── route.ts  # POST: PEM/PFXダウンロード
│       └── acme/
│           └── route.ts          # GET: 一覧 / POST: 作成 / DELETE: 削除
│
├── components/
│   ├── ui/                       # shadcn/ui（npx shadcn init で生成）
│   ├── certificates/
│   │   ├── cert-table.tsx        # 証明書一覧テーブル（検索・ソート付き）
│   │   ├── cert-form.tsx         # 証明書生成フォーム
│   │   └── cert-actions.tsx      # 更新・失効・DLアクションボタン群
│   └── layout/
│       └── sidebar.tsx           # ナビゲーションサイドバー
│
├── lib/
│   ├── step-ca.ts                # step-ca APIクライアント（全リクエストを集約）
│   └── auth.ts                   # NextAuth設定
│
├── docker-compose.yml
├── Dockerfile
├── .env.example                  # 環境変数テンプレート（実際の値は.envに、.gitignore対象）
└── .gitignore
```

---

## 主要コンポーネント設計

### `lib/step-ca.ts` — APIクライアント

step-caへの全HTTPリクエストをここに集約する。責務：
- OTT（One-Time Token）の生成と管理
- CA URLへのfetch（TLS証明書検証をフィンガープリントで制御）
- エラーハンドリングとレスポンス正規化

### `cert-table.tsx` — 証明書一覧テーブル

- shadcn/ui の `DataTable` を使用
- 有効期限が30日以内の証明書に警告バッジを表示
- クライアント側での検索・ソート機能

### `cert-form.tsx` — 証明書生成フォーム

入力項目：
- ホスト名（必須）
- SAN（コンマ区切り、任意）
- 有効期限（24h〜10y、セレクト）

### `cert-actions.tsx` — アクションボタン群

証明書詳細ページに配置：
- 更新ボタン → `POST /api/certificates/[name]/renew`
- 失効ボタン（確認ダイアログ付き）→ `POST /api/certificates/[name]/revoke`
- PEMダウンロード → `POST /api/certificates/[name]/export?format=pem`
- PFXダウンロード（パスワード入力ダイアログ付き）→ `POST /api/certificates/[name]/export?format=pfx`

### ACME管理ページ（`acme/page.tsx`）

- ACMEプロビジョナー一覧をカードで表示
- 各プロビジョナーの接続エンドポイントURL表示（certbot等で使用）
- プロビジョナーの作成・削除フォーム

---

## step-ca API連携

### 使用するstep-ca APIエンドポイント

| 操作 | step-ca APIエンドポイント |
|------|------------------------|
| 証明書署名 | `POST /1.0/sign` |
| 証明書一覧（Admin） | `GET /admin/certs` |
| 証明書失効（Admin） | `DELETE /admin/certs/{serial}` |
| プロビジョナー一覧（Admin） | `GET /admin/provisioners` |
| プロビジョナー作成（Admin） | `POST /admin/provisioners` |
| プロビジョナー削除（Admin） | `DELETE /admin/provisioners/{name}` |
| ACMEディレクトリ | `GET /acme/{prov}/directory` |

### 証明書生成フロー

1. Next.js API Route でCSR（Certificate Signing Request）をNode.js Cryptoで生成
2. step-caのJWKプロビジョナーを使ってOTT（One-Time Token）を生成
3. `POST /1.0/sign`にCSRとOTTを送信
4. レスポンスのPEM形式証明書と秘密鍵をブラウザに返す

---

## 環境変数

```env
# step-ca接続
CA_URL=https://step-ca:9000
CA_FINGERPRINT=<root CAのフィンガープリント>
CA_PROVISIONER=admin
CA_PROVISIONER_PASSWORD=<JWKプロビジョナーのパスワード>

# NextAuth
NEXTAUTH_SECRET=<ランダム文字列>
NEXTAUTH_URL=http://localhost:3000

# UIログイン
UI_USERNAME=admin
UI_PASSWORD_HASH=<bcryptハッシュ>
```

`.env`ファイルは`.gitignore`に必ず追加する。

---

## Dockerセットアップ

### docker-compose.yml 構成

```yaml
services:
  step-ca:
    image: smallstep/step-ca:latest
    ports: ["9000:9000"]
    volumes:
      - step-data:/home/step
    environment:
      - DOCKER_STEPCA_INIT_NAME=Step CA
      - DOCKER_STEPCA_INIT_DNS_NAMES=step-ca,localhost
      - DOCKER_STEPCA_INIT_PROVISIONER_NAME=admin
      - DOCKER_STEPCA_INIT_PASSWORD=<password>

  step-ui:
    build: .
    ports: ["3000:3000"]
    depends_on: [step-ca]
    env_file: .env
    volumes:
      - step-data:/home/step:ro  # root CAの証明書をフィンガープリント取得に使用

volumes:
  step-data:
```

---

## 検証方法

1. `docker compose up --build` で起動
2. `http://localhost:3000` にアクセスしてログインページが表示されること
3. ユーザー名/パスワードでログインできること
4. 証明書生成フォームでテスト証明書を発行できること
5. 証明書一覧に発行した証明書が表示されること
6. PEMダウンロードで`.crt`と`.key`ファイルが取得できること
7. PFXエクスポートで`.pfx`ファイルが取得できること
8. 失効操作後、証明書の状態が変わること
9. ACMEページでプロビジョナーが表示されること
