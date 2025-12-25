# 設計概要（MVP）

## 方針
- まずは最小機能（採点→集計→順位表示）に限定する。
- サーバーレス前提で、**AWS Amplify Gen 2 + AWS AppSync(GraphQL) + Amazon DynamoDB** を本流とする。
- 「誰かが投票した瞬間に他の参加者へ反映」を実現するため、**AppSync Subscription** を利用する。
- ランキング（1,1,3方式）は候補数が小さいため、**クライアント側で純粋関数として計算**する。

## 構成
- フロントエンド: `web/`（静的HTML + JS。スマホブラウザで動く）
- バックエンド: Amplify Gen 2（TypeScriptでIaC）
  - Data: AppSync(GraphQL) + DynamoDB
  - Auth: Cognito（Identity Pool によるゲスト/IAM）
  - Hosting: Amplify Hosting（静的配信）

※ 既存の `backend/` はローカル実験や代替実装として残し得るが、本設計の本流は **AppSync(GraphQL)** とする。

## 主要モジュール（フロントエンド）
- `web/app.js`
  - AppSync への接続（Amplify client config 読み込み）
  - 候補一覧取得、投票送信、Subscription購読
  - ランキング計算（1,1,3方式）

## バックエンドリソース（Amplify Gen 2）
Amplify Gen 2 の `resource.ts` で定義する。

### データモデル（概念）
- Event
  - `title`
- Candidate
  - `eventId`
  - `name`
  - `totalScore`（集計済み合計点。Atomic Counterで更新）
- Vote
  - `eventId`
  - `candidateId`
  - `score`（整数）
  - `voterId`（Cognito IdentityId を格納）
- Participant（参加時の表示名保持）
  - `eventId`
  - `voterId`（IdentityId）
  - `displayName`

### 認証（MVP）
- アカウント登録なしで使うため、**未認証ID（ゲスト）** を採用する。
- クライアントは Cognito Identity Pool から IdentityId を取得し、IAM署名（SigV4）で AppSync を呼ぶ。
- `voterId = IdentityId` として Vote/Participant に保存し、「自分の採点」を識別できるようにする。

## 集計方式（Write-time Aggregation）
「全員合計」を都度集計（Read-time Aggregation）しない。

- 投票（Vote）作成/更新時に、Candidate の `totalScore` を **Atomic Counter** 的に増減させる。
- 更新値は `delta = newScore - oldScore` とし、oldScore が存在しない場合は 0 とみなす。

### AppSyncでの実現（概要）
Vote の upsert を **Pipeline Resolver**（または同等の手段）で実現し、概ね以下の順で処理する。

1. 既存Vote取得（存在しなければ oldScore=0）
2. Vote を作成/更新（score を newScore に）
3. Candidate の `totalScore` を `ADD totalScore :delta` で更新
4. Candidate 更新により Subscription で各クライアントへ通知
