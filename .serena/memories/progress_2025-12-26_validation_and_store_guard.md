## 2025-12-26 進捗

### 変更点
- Pydanticリクエストモデルで入力のstrip/空白のみ禁止を追加
  - `CreateEventRequest.title`: strip後に空は不可
  - `CreateEventRequest.entries`: 各要素をstripし空白行を除外、結果が空は不可
  - `JoinEventRequest.name`: strip後に空は不可
- Storeを直接使う場合の保険として、`InMemoryStore.create_event` / `DynamoDBStore.create_event` に「非空エントリ必須」ガードを追加

### テスト
- `backend/tests/test_requests_validation.py` を追加し、上記バリデーションを固定
- `uv run pytest ./tests` / `uv run ruff check` / `uv run mypy ./src` を実行し、全て成功

### ドキュメント
- `docs/developer_guide/spec.md` に入力ルールを追記
