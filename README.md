# step-ui

Smallstep CA (`step-ca`) をブラウザから操作するための Web UI です。証明書の発行・更新・失効、ACME プロビジョナーの追加/削除、CA 証明書のダウンロードをまとめて扱えます。

## できること

- 証明書の発行 / 更新 / 失効
- ACME プロビジョナーの管理
- Root / Intermediate CA 証明書のダウンロード

## 必要なもの

- Docker
- Docker Compose
- Node.js 20+（ローカル開発する場合）

## セットアップ

1. `.env.example` を `.env` としてコピーする
2. `.env` で次の値を設定する
   - `NEXTAUTH_SECRET`
   - `UI_PASSWORD_HASH`（ログイン用 bcrypt hash）
   - 必要なら `CA_FINGERPRINT`
   - `DOCKER_STEPCA_INIT_NAME` は任意（未設定時は `Step CA` を使用）
   - `DOCKER_STEPCA_INIT_PASSWORD` は任意（未設定時は `StepCAPassword123!` を使用）
   - 本番で nginx を使う場合は `PUBLIC_DOMAIN` / `PUBLIC_URL`
3. ログイン用パスワードの `bcrypt hash` を作る

```bash
node -e "const b=require('bcryptjs'); b.hash('任意のパスワード',10).then(h=>console.log(Buffer.from(h).toString('base64')))"
```

4. 起動する

```bash
docker compose down -v
docker compose up --build
```

`CA_FINGERPRINT` を確認したい場合は、step-ca 起動後に次を実行します。

```bash
docker exec step-ca step certificate fingerprint /home/step/certs/root_ca.crt
```

## 本番公開 (nginx 有効化)

```bash
docker compose up --build
```

`.env` で `NGINX_ENABLED=true` にすると nginx が起動します。ローカル検証なら `PUBLIC_DOMAIN=localhost`、外部公開なら実ホスト名を設定してください。

`PUBLIC_DOMAIN` は nginx の受け口です。`PUBLIC_URL` は任意の上書き値で、未設定なら `https://PUBLIC_DOMAIN` を使います。

nginx の証明書は step-ca から直接発行します。必要なら step-ca の ACME provisioner も使えますが、proxy 自体は ACME に依存しません。

`/` は step-ui に、`/step-ca/acme/*` は step-ca にルーティングされます。step-ca 自体は外部公開しません。

### 証明書の更新

- **nginx の入口証明書**: `docker compose up --force-recreate nginx-cert-bootstrap nginx` で再発行します。
- **step-ui で発行した証明書**: 証明書詳細画面の「証明書を更新」を使います。更新は元の有効期限を引き継ぎます。
- 発行時の PEM は `cert-store` にも保存するので、詳細画面の PEM ダウンロードが使えます。
- 失効した証明書は一覧・詳細から削除できます。active な証明書は削除できません。

### ACME プロビジョナーの表示

ACME 管理画面では各 provisioner の `default / min / max` の有効期間を表示します。`step-ca` の provisioner claims に入っていない項目は `未設定` として扱います。

## ログイン

- URL: http://localhost:3000
- デフォルトユーザー: `admin`
- デフォルトパスワード: `admin123`

## ローカル開発

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

ローカルで `npm run dev` を使う場合は、別途 step-ca を起動するか、Docker Compose での起動を使ってください。

## 補足

- `CA_PROVISIONER_PASSWORD` は個別設定不要です。Compose が `DOCKER_STEPCA_INIT_PASSWORD` をそのまま step-ca と step-ui に渡します。
- 初回起動時は `step-ca-bootstrap` が admin provisioner の claims を自動更新します。

## License

MIT License. See [LICENSE](LICENSE).
