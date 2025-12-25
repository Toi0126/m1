# AWSへのデプロイ手順（MVP案）

## 前提
- まずは **Lambda + DynamoDB** を最小構成として想定する。
- HTTP公開は **Lambda Function URL** または **API Gateway** のどちらでも実現可能。
  - AWS公式の比較資料では、単純な用途は Function URL、より高度な要件（認証方式の選択肢、キャッシュ、変換など）が必要なら API Gateway が適するとされている。

## まずはローカル
- `config/.env_sample` を参考に環境変数を設定
- backend起動（uv利用）

## DynamoDB利用に切り替える場合
- 環境変数
  - `STORE_BACKEND=dynamodb`
  - `DDB_TABLE_NAME=<table>`

## 参考（AWS MCPで確認したいポイント）
- LambdaをHTTPで呼ぶ方法の選択（Function URL vs API Gateway）
- API Gateway HTTP API + Lambda の統合（payload format 2.0）
- DynamoDBのテーブル作成（オンデマンド推奨など）
