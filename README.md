# m1
Saiten Web App

## ローカル実行

### 1) 依存関係
`backend/` で uv を使います。

### 2) 起動
- `cd backend`
- `uv sync --extra dev`
- `uv run uvicorn --app-dir src m1.main:app --reload --port 8000`

ブラウザで `http://localhost:8000/` を開きます。

## メモ
- デフォルトは in-memory 永続化です。
- DynamoDBを使う場合は `config/.env_sample` を参照。
