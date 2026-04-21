---
name: docker-debug
description: Docker Compose 環境のデバッグ。step-ca や step-ui コンテナの問題調査に使う。
---

以下の順でデバッグを進めてください：

1. `docker compose ps` でコンテナ状態確認
2. `docker compose logs step-ca --tail=50` で step-ca ログ確認
3. `docker compose logs step-ui --tail=50` で step-ui ログ確認
4. 証明書関連の問題は `docker exec step-ca step ca health` で CA 疎通確認
5. データリセットが必要な場合のみ: `docker compose down -v && docker compose up --build`（ユーザーに確認を取ること）
