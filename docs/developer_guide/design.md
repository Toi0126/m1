# 設計概要（MVP）

## 方針
- まずは最小機能（採点→集計→順位表示）に限定する。
- 環境依存（永続化）はアダプタ層（Store実装）に分離する。

## 構成
- `backend/`: FastAPI（API + 静的HTML配信）
- `web/`: 1枚HTML + JS（スマホブラウザで動く）

## 主要モジュール
- `m1.domain`: リクエスト/レスポンス、ドメインモデル
- `m1.ranking`: 合計点・順位計算（Pure）
- `m1.store`: 永続化（InMemory / DynamoDB）
- `m1.main`: FastAPI エンドポイント

## データモデル（DynamoDB想定）
単一テーブル（PK/SK）でイベント単位に集約。
- Event
  - pk: `EVENT#{event_id}`
  - sk: `META`
- Participant
  - pk: `EVENT#{event_id}`
  - sk: `PARTICIPANT#{participant_id}`
- Score
  - pk: `EVENT#{event_id}`
  - sk: `SCORE#{participant_id}#{entry_id}`

## 認証（MVP）
- 参加時に `participant_key` を発行し、採点保存時に `X-Participant-Key` で照合する。
- 本番での利用を広げる場合は Cognito 等に置き換え可能。
