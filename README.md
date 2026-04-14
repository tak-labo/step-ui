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
   - `UI_PASSWORD_HASH`
   - 必要なら `CA_FINGERPRINT`
   - `DOCKER_STEPCA_INIT_PASSWORD` は任意（未設定時は `StepCAPassword123!` を使用）
   - 本番で Caddy を使う場合は `PUBLIC_DOMAIN` / `PUBLIC_URL`
3. `UI_PASSWORD_HASH` を作る

```bash
node -e "const b=require('bcryptjs'); b.hash('パスワード',10).then(h=>console.log(Buffer.from(h).toString('base64')))"
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

## 本番公開 (Caddy proxy profile)

```bash
docker compose --profile proxy up --build
```

`PUBLIC_DOMAIN` は Caddy の受け口です。`PUBLIC_URL` は任意の上書き値で、未設定なら `https://PUBLIC_DOMAIN` を使います。

`/` は step-ui に、`/acme/*` は step-ca にルーティングされます。step-ca 自体は外部公開しません。

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
