# 実装検証・デプロイ作業（別PCでの再開手順）

このドキュメントは、別PCでこのリポジトリを clone したあとに、実装検証〜デプロイ作業をスムーズに再開するためのチェックリストです。

> 本流は Amplify Gen 2 + AppSync(GraphQL) です。`backend/`（FastAPI）はローカル実験/代替実装として残っています。

## 0. 手元に用意する情報（先にメモしておく）

- AWS アカウント
- 利用リージョン: `__________`
- Amplify App ID（本番/検証用）: `__________`
- Amplify のブランチ名（例: `main`）: `__________`

## 1. 別PCでの前提セットアップ（初回のみ）

### 必要ツール

- Node.js（`npm` / `npx` が使えること）
- Git

### AWS 認証（どれか1つ）

- AWS CLI のプロファイルを設定済み、または環境変数で認証できる状態
  - 例: `AWS_PROFILE` を使う / `AWS_ACCESS_KEY_ID` 等を設定する

> `ampx` 実行時に認証が必要です。認証方法はチームの標準に合わせてください。

## 2. clone 後の最短ルート（Amplify Sandboxで動作確認）

### 2.1 依存関係インストール

リポジトリ直下で:

- `npm install`
- `npm --prefix web install`

### 2.2 Sandbox 起動（バックエンド）

別ターミナルで（直下で）:

- `npm run sandbox -- --outputs-out-dir web/public --outputs-format json`

以下が生成/更新されることを確認します:

- `web/public/amplify_outputs.json`

### 2.3 Web 起動

別ターミナルで:

- `npm --prefix web run dev`

ブラウザで表示されたURL（Viteのログ）を開きます。

## 3. 実装検証（Python / REST 代替バックエンドを使う場合）

> 本流ではありませんが、別PCでの検証を続けたい場合の手順です。

### 3.1 環境変数

- `config/.env_sample` を `config/.env` にコピーして必要に応じて編集します（秘密情報はコミットしない）。

### 3.2 依存関係（uv）

`backend/` で:

- `uv sync --extra dev`

### 3.3 テーブル作成（DynamoDBを使う場合・初回のみ）

`backend/` で:

- `uv run python scripts/create_dynamodb_table.py`

### 3.4 起動

`backend/` で:

- `uv run uvicorn --app-dir src m1.main:app --reload --port 8000`

### 3.5 検証（テスト/静的解析）

`backend/` で:

- `uv run pytest ./tests`
- `uv run ruff check`
- `uv run ruff format`
- `uv run mypy ./src`

## 4. 本番デプロイ（Amplify Hosting + Branch Environment）

既存の概要は [deploy_operation.md](deploy_operation.md) を参照。

ここでは「別PCから再開する時に必要な最小チェック項目」だけをまとめます。

### 4.1 Amplify Console 側の確認

- 対象の Amplify App / Branch Environment を特定できている
- リポジトリ連携（GitHub等）が有効
- monorepo ビルド設定で `web/` をビルドできる（成果物は通常 `web/dist`）

### 4.2 ブランチ環境の outputs を生成

ローカルでブランチ環境の設定を出したい場合（直下で）:

- `npm run generate:outputs -- --app-id <app-id> --branch <branch> --format json --out-dir web/public`

### 4.3 デプロイ後の確認

- Hosting のURLで画面が表示される
- 投票（upsertVote）で合計点が更新される
- 他クライアントで Subscription（onCandidateUpdated）により更新が反映される

## 5. 再開メモ（作業ログ用）

- 再開日: `__________`
- どこまで完了したか:
  - [ ] Sandbox起動
  - [ ] Web表示
  - [ ] 投票→合計更新
  - [ ] 別端末でリアルタイム反映
  - [ ] Hosting で本番URL確認
  - [ ] （任意）backend/ テスト
