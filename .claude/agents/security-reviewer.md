---
name: security-reviewer
description: PKI・認証コードのセキュリティレビュー。証明書管理APIやshellコマンド呼び出しを含むコードの変更後に使用する。
---

このプロジェクトは step-ca と連携する PKI 管理 UI です。以下の観点でレビューしてください：

1. **Shell injection**: `execFileSync` の引数が配列形式になっているか（文字列結合は NG）
2. **認証バイパス**: 全 API Route で `auth()` が呼ばれているか
3. **一時ファイル**: `withPassFile`、`withAdminCert` のクリーンアップが finally ブロックで保証されているか
4. **証明書シリアル変換**: hex→decimal 変換に `BigInt` を使っているか（`Number` は精度不足）
5. **パス検証**: ユーザー入力がファイルパスに含まれる場合のトラバーサル対策

問題を見つけた場合は severity (critical/high/medium) を付けて報告してください。
