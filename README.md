# m1
Saiten Web App

## ローカル実行（本流: Amplify Gen 2 + AppSync）

本MVPの本流は **Amplify Gen 2 + AppSync(GraphQL) + DynamoDB + Cognito(ゲスト/IAM)** です。

### 1) 依存関係
- Node.js（`npx` が使えること）

### 2) Sandbox起動（バックエンド）
- `npm install`
- `npm run sandbox`

`amplify_outputs.json` が生成されます（フロントはこれを読み込みます）。

### 3) Web起動
- `cd web`
- `npm install`
- `npm run dev`

ブラウザで `http://localhost:8000/` を開きます。

## ローカル実行（代替: REST版バックエンド）

このリポジトリにはローカル実験/代替実装として `backend/` に FastAPI + DynamoDB ストアがあります。

### 1) 環境変数
- `config/.env_sample` を `config/.env` にコピーし、必要に応じて編集します。
	- `STORE_BACKEND=dynamodb`
	- `DDB_TABLE_NAME=m1` など

### 2) テーブル作成（初回のみ）
`backend/` で以下を実行します。

- `cd backend`
- `uv sync --extra dev`
- `uv run python scripts/create_dynamodb_table.py`

### 3) 起動
- `cd backend`
- `uv run uvicorn --app-dir src m1.main:app --reload --port 8000`

## メモ
- デフォルトは in-memory 永続化です。
- DynamoDBを使う場合は `config/.env_sample` を参照。
