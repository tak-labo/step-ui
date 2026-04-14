# step-ui 引き継ぎ資料

## 概要

`step-ui` は Smallstep CA（step-ca）の Web GUI。複雑な CLI 操作をブラウザから行えるようにする。

- **URL**: `http://localhost:3000`
- **デフォルト認証**: admin / admin123
- **本番公開**: `docker compose up --build` で nginx を入口にし、`.env` の `NGINX_ENABLED=true` と `PUBLIC_DOMAIN=<host>` で有効化する。ローカル検証は `PUBLIC_DOMAIN=localhost` でも可
- **nginx 証明書**: step-ca から直接発行する

---

## アーキテクチャ

```
ブラウザ
  ↓ HTTP / HTTPS
nginx (NGINX_ENABLED=true 時の公開入口。ローカルは `localhost`、公開は実ホスト名)
  ├── 証明書           → step-ca の直接発行
  ├── /                → step-ui
  └── /step-ca/acme/*   → step-ca
        ↓ HTTP
Next.js App Router (step-ui コンテナ :3000)
  ├── app/(auth)/login/        … ログインページ
  ├── app/(dashboard)/         … 認証必須ページ
  │   ├── certificates/        … 証明書一覧・生成
  │   └── acme/                … ACMEプロビジョナー管理
  ├── app/api/certificates/    … 証明書 CRUD API
  ├── app/api/acme/            … ACMEプロビジョナー API
  └── app/api/ca-certs/        … CA証明書ダウンロード API
        ↓ execFileSync('step', [...])
step CLI v0.28.7 (step-ui コンテナ内 /usr/local/bin/step)
        ↓ HTTPS :9000
step-ca コンテナ (smallstep/step-ca:latest)
```

### Docker ボリューム構成

| ボリューム | マウント先 | 説明 |
|-----------|-----------|------|
| `step-data` | step-ca: `/home/step`<br>step-ui: `/home/step` | CA の証明書・設定・鍵（両コンテナ共有） |
| `cert-store` | step-ui: `/app/data` | 発行済み証明書のメタデータ JSON と PEM バンドル（step-ui 専用・書き込み可） |
| `nginx-certs` | nginx: `/etc/nginx/certs` | nginx の証明書・秘密鍵 |

---

## 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Next.js | 15 (App Router) | フレームワーク |
| React | 19 | UI |
| TypeScript | 5 | 型安全 |
| shadcn/ui + Tailwind CSS | latest | UI コンポーネント |
| NextAuth.js | v5 | 認証（JWT セッション） |
| bcryptjs | latest | パスワードハッシュ |
| @peculiar/x509 | latest | CSR 生成 |
| step CLI | **v0.28.7** | step-ca との通信 |
| step-ca | **latest** (0.30.x) | PKI サーバー |

---

## 重要ファイル一覧

| ファイル | 役割 |
|---------|------|
| `lib/step-ca.ts` | step-ca クライアント（全 CLI/API 操作の中核） |
| `lib/cert-store.ts` | ローカル証明書メタデータストア (`/app/data/certs.json`) |
| `lib/auth.ts` | NextAuth v5 設定（Credentials Provider） |
| `app/api/certificates/route.ts` | 証明書一覧 GET / 生成 POST |
| `app/api/certificates/[name]/revoke/route.ts` | 証明書失効 POST |
| `app/api/certificates/[name]/renew/route.ts` | 証明書更新 POST |
| `app/api/acme/route.ts` | ACME プロビジョナー GET/POST/DELETE |
| `app/api/ca-certs/route.ts` | CA 証明書ダウンロード GET |
| `docker-compose.yml` | コンテナ構成 |
| `Dockerfile` | step-ui イメージビルド |
| `.env` | 環境変数（gitignore 対象） |
| `.env.example` | 環境変数テンプレート |

---

## 環境変数（.env）

```env
# step-ca 接続情報
DOCKER_STEPCA_INIT_NAME=Step CA
CA_URL=https://step-ca:9000
CA_FINGERPRINT=<フィンガープリント>
CA_PROVISIONER=admin
# step-ui は Compose 内で DOCKER_STEPCA_INIT_PASSWORD をそのまま使う

# 本番で nginx を使う場合
PUBLIC_DOMAIN=<domain>
PUBLIC_URL=https://<domain>
NGINX_ENABLED=true
# PUBLIC_URL は任意。未設定なら https://PUBLIC_DOMAIN を使う

# NextAuth
NEXTAUTH_SECRET=<ランダム文字列>
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# UI ログイン
UI_USERNAME=admin
# bcrypt hash を Base64 エンコードした値（下記「パスワード変更方法」参照）
UI_PASSWORD_HASH=<Base64(bcrypt(パスワード))>

# フロントエンド用
NEXT_PUBLIC_CA_URL=https://step-ca:9000

# step-ca 初期化パスワード（step-ui の CA_PROVISIONER_PASSWORD もこれを使う）
DOCKER_STEPCA_INIT_PASSWORD=<step-ca パスワード>
```

### パスワード変更方法

```bash
node -e "const b=require('bcryptjs'); b.hash('新パスワード',10).then(h=>console.log(Buffer.from(h).toString('base64')))"
```

出力された文字列を `UI_PASSWORD_HASH` に設定する。

**なぜ Base64 エンコードするか**: Docker Compose は env ファイルの値中の `$` を変数展開する。bcrypt hash には `$2b$10$...` のような `$` が含まれるため、そのまま設定すると壊れる。Base64 に変換して `$` を除去し、`lib/auth.ts` で `Buffer.from(hashB64, 'base64').toString()` でデコードしている。

---

## 起動方法

```bash
# 初回（またはデータをリセットしたい時）
docker compose down -v
docker compose up --build

# 2回目以降
docker compose up --build

# バックグラウンド起動
docker compose up --build -d
```

### 初回起動時の注意

step-ca 初回起動時に `step ca init` が実行され `/home/step/config/ca.json` が生成される。
`CA_FINGERPRINT` は初回起動後に以下で確認して `.env` に設定する:

```bash
docker exec step-ca step certificate fingerprint /home/step/certs/root_ca.crt
```

---

## 主要実装の詳細

### 1. 証明書生成フロー（`lib/step-ca.ts` の `generateCertificate`）

1. `crypto.subtle.generateKey` で RSA-2048 鍵ペア生成
2. `@peculiar/x509` で CSR 生成（SAN を DNS/IP に振り分け）
3. `getOneTimeToken(hostname)` で JWK OTT 取得
4. `POST /1.0/sign` で step-ca に署名要求
5. 発行された証明書のメタデータを `/app/data/certs.json` に保存

**注意**: `@peculiar/x509` は `import 'reflect-metadata'` が必要（`lib/step-ca.ts` の先頭に記載）。

### 2. OTT 生成（`getOneTimeToken`）

```typescript
execFileSync('step', [
  'ca', 'token',
  '--ca-url', this.config.caUrl,
  '--root', '/home/step/certs/root_ca.crt',
  '--provisioner', this.config.provisioner,
  '--provisioner-password-file', passFile,
  subject,
], { encoding: 'utf-8', timeout: 15000 })
```

パスワードは一時ファイル（`/tmp/step-pass-XXXX`）に書き込み、コールバック実行後に確実に削除する（`withPassFile<T>`）。配列引数で `execFileSync` を呼ぶためシェルインジェクションなし。

### 3. 証明書失効（`revokeCertificate`）

step-ca が要求するシリアル番号は**10進数**だが、`@peculiar/x509` は**16進数**で返す。

```typescript
const decimalSerial = BigInt('0x' + serialNumber).toString(10)
```

`step ca revoke` は `--provisioner-password-file` を受け付けないため、先に `step ca token --revoke` で OTT を取得し、`--token` フラグで渡す。

### 4. ACME プロビジョナー管理（`withAdminCert`）

step-ca の Admin API（`/admin/provisioners`）は x5c（クライアント証明書）認証が必要。JWK OTT では認証できない。

解決策:
1. `step ca certificate step` で "Admin JWK" プロビジョナーを使い、有効期限 5 分の短命な管理者証明書を取得
2. その証明書を `--admin-cert` / `--admin-key` フラグで `step ca provisioner add/remove` に渡す
3. 処理後に一時ファイルを削除

**前提条件**: step-ca が `--remote-management` フラグ付きで初期化されていること（`docker-compose.yml` で設定済み）。これにより "Admin JWK" プロビジョナーと "step" スーパー管理者が作成される。

### 5. 証明書ストア（`lib/cert-store.ts`）

step-ca Admin API は証明書一覧取得にも x5c 認証が必要なため、管理画面での一覧表示には使わない。代わりに証明書発行時のメタデータと PEM を `/app/data/certs.json` に保存し、それを一覧表示・再ダウンロードに使用する。詳細画面では証明書(.crt) / 鍵(.key) / 一体型(.pem) を選べる。
失効した証明書はローカルストアから削除できるが、active な証明書は削除不可。
Root / Intermediate CA 証明書は `/api/ca-certs?type=root` と `type=intermediate` で認証なしに取得できる。nginx 経由では `-k` 付きで叩く。Ubuntu は `/usr/local/share/ca-certificates` + `update-ca-certificates`、RHEL 系は `/etc/pki/ca-trust/source/anchors` + `update-ca-trust extract` で root CA をインストールする。

```json
[
  {
    "serialNumber": "1a2b3c...",
    "commonName": "example.local",
    "notBefore": "2026-04-14T00:00:00.000Z",
    "notAfter": "2027-04-14T00:00:00.000Z",
    "sans": ["example.local", "192.168.1.1"],
    "status": "active"
  }
]
```

### 6. 証明書有効期間設定

`docker-compose.yml` の `step-ca-bootstrap` サービスで `step ca provisioner update admin` を実行し、admin JWK プロビジョナーの claims を更新する。

```bash
step ca provisioner update admin \
  --x509-min-dur=5m \
  --x509-max-dur=87600h \
  --x509-default-dur=720h \
  --admin-password-file /home/step/secrets/password \
  --admin-provisioner admin \
  --admin-subject step \
  --ca-url https://step-ca:9000 \
  --root /home/step/certs/root_ca.crt
```

- `defaultTLSCertDuration: 720h` = 30日
- `maxTLSCertDuration: 87600h` = 10年まで発行可能
- 更新ロジックは `docker/step-ca-bootstrap.sh` に分離して、`docker-compose.yml` を薄く保つ
- `nginx` は `.env` の `NGINX_ENABLED=true` で起動し、外向け URL は `PUBLIC_URL` で切り替える

### 6-1. 証明書更新方法

- **nginx の入口証明書**: `docker compose up --force-recreate nginx-cert-bootstrap nginx` で再発行する
- **step-ui で発行した証明書**: 証明書詳細画面の「証明書を更新」を使う。更新時は元の有効期間をそのまま使う

### 6-2. ACME プロビジョナーの有効期間表示

ACME 管理画面では provisioner の claims から `default / min / max` の有効期間を表示する。claims に値がない場合は `未設定` と表示する。

### 7. TLS 証明書の信頼

step-ui コンテナの Node.js が step-ca（自己署名 TLS）に接続するため:

```yaml
environment:
  - NODE_EXTRA_CA_CERTS=/home/step/certs/root_ca.crt
volumes:
  - step-data:/home/step  # CA 証明書共有
```

### 8. Dockerfile の注意点

- step CLI バイナリは glibc が必要なため runner ステージは `node:20-slim`（Debian）を使用。Alpine (musl) では動作しない。
- step CLI v0.28.7 を GitHub Releases からダウンロード。tarball 内のディレクトリ名が変わる可能性があるため `find /tmp -name step -type f -executable | head -1` で実行ファイルを探す。

---

## 既知の問題と解決済みの課題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| step CLI 0.27.4 で `--provisioner "Admin JWK"` エラー | スペースを含むプロビジョナー名を `--issuer` として扱うバグ | step CLI **0.28.7** にアップグレード（CHANGELOG で修正を確認）|
| Alpine で step CLI 動作せず | glibc vs musl 非互換 | runner を `node:20-slim` (Debian) に変更 |
| `reflect-metadata` エラー | @peculiar/x509 の依存 | `lib/step-ca.ts` 先頭に `import 'reflect-metadata'` |
| bcrypt hash が Docker Compose で壊れる | `$` 文字の変数展開 | Base64 エンコードで回避 |
| AUTH_TRUST_HOST エラー | NextAuth v5 の要件 | `docker-compose.yml` に `AUTH_TRUST_HOST=true` を追加 |
| root_ca.crt が見つからない | step-ui に step-data ボリューム未マウント | `step-data:/home/step` を step-ui にも追加 |
| cert-store 書き込みエラー | step-data を :ro でマウント | 書き込み専用の `cert-store` ボリューム (`/app/data`) を別途追加 |
| 失効 "too many positional arguments" | `step ca revoke` は `--provisioner-password-file` 非対応 | `step ca token --revoke` で OTT 取得後、`--token` で渡す |
| 失効「シリアル番号が不正」 | step-ca は 10 進数要求、x509 は 16 進数返却 | `BigInt('0x' + serial).toString(10)` で変換 |
| 更新「authorized maximum 超過」 | 更新時に固定 8760h を指定していた | `notAfter - notBefore` から元の有効期間を計算して再利用 |
| maxTLSCertDuration が 24h のまま | admin JWK の claims が未更新 | `step ca provisioner update admin` を bootstrap で実行 |
| ACME 追加 404 | Admin API が `enableAdmin: true` を要求 | `--remote-management` フラグで初期化（`enableAdmin: true` 自動設定） |
| ACME 追加 x5c エラー | Admin API は JWK OTT 非対応 | `withAdminCert` で短命管理者証明書を取得して使用 |
| ca.json 直接編集が反映されない | `enableAdmin: true` 時は DB が優先 | Admin API 経由（`step ca provisioner add`）で管理 |

---

## 未テストの機能（要確認）

step CLI 0.28.7 + step-ca:latest にアップグレード後、以下を実際に確認する:

1. **ACME プロビジョナーの追加・削除** — `--provisioner "Admin JWK"` の空白問題が 0.28.7 で修正済みのはず
2. **24 時間超の証明書生成** — `step ca provisioner update admin` の claims が反映されているか
3. **証明書失効** — `--revoke` OTT → `step ca revoke --token` フローの動作確認

確認手順:
```bash
docker compose down -v
docker compose up --build
# ブラウザで http://localhost:3000 を開き各機能を確認
```

---

## API エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/certificates` | 証明書一覧（ローカルストアから） |
| POST | `/api/certificates` | 証明書生成 |
| POST | `/api/certificates/{serial}/revoke` | 証明書失効 |
| POST | `/api/certificates/{serial}/renew` | 証明書更新 |
| GET | `/api/acme` | ACME プロビジョナー一覧 |
| POST | `/api/acme` | ACME プロビジョナー作成 |
| DELETE | `/api/acme` | ACME プロビジョナー削除 |
| GET | `/api/ca-certs?type=root` | Root CA 証明書ダウンロード |
| GET | `/api/ca-certs?type=intermediate` | 中間 CA 証明書ダウンロード |

すべてのエンドポイントは認証必須（401 返却）。

---

## 証明書生成 API リクエスト例

```bash
# 証明書生成
curl -s -X POST http://localhost:3000/api/certificates \
  -H 'Content-Type: application/json' \
  -b 'next-auth.session-token=...' \
  -d '{"hostname":"example.local","sans":["alt.example.local","192.168.1.1"],"duration":"8760h"}'

# ACME プロビジョナー追加
curl -s -X POST http://localhost:3000/api/acme \
  -H 'Content-Type: application/json' \
  -b 'next-auth.session-token=...' \
  -d '{"name":"acme"}'
```

---

## step-ca 設定（ca.json の重要部分）

```json
{
  "authority": {
    "claims": {
      "minTLSCertDuration": "5m",
      "maxTLSCertDuration": "87600h",
      "defaultTLSCertDuration": "24h"
    },
    "enableAdmin": true,
    "provisioners": [...]
  }
}
```

`enableAdmin: true` により DB 経由でプロビジョナーを管理。ca.json の `provisioners` 配列を直接編集しても反映されない。

---

## 参考ドキュメント

- [step-ca ドキュメント](https://smallstep.com/docs/step-ca/)
- [step-ca プロビジョナー管理](https://smallstep.com/docs/step-ca/provisioners/#remote-provisioner-management)
- [step CLI CHANGELOG](https://github.com/smallstep/cli/blob/master/CHANGELOG.md)
- [step-ca Docker Hub](https://hub.docker.com/r/smallstep/step-ca)
