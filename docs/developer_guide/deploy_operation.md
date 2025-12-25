# AWSへのデプロイ手順（MVP案）

## 前提
- 本MVPは **Amplify Gen 2 + AppSync(GraphQL) + DynamoDB** を本流とする。
- リアルタイム更新は **AppSync Subscription** を利用する。
- 認証は **Cognito Identity Pool の未認証ID（ゲスト）** を用いた **IAM認証** を基本とする。

## 開発（Sandbox）
Amplify Gen 2 の Cloud Sandbox を使い、開発者ごとの一時環境で動作確認する。

- 端末を2つ用意し、フロントエンドと sandbox を並行で動かす。
- Sandbox起動:
  - `npx ampx sandbox --outputs-out-dir web/public --outputs-format json`
  - デプロイ完了後、クライアント設定として `web/public/amplify_outputs.json` が生成/更新される。

## フロントエンド設定（amplify_outputs.json）
`web/` は `GET /amplify_outputs.json` を実行時に読み込む。

- ローカル開発（Vite）: `web/public/amplify_outputs.json` に配置するとそのまま配信される
- ルートに出力された場合のコピー例:
  - `copy amplify_outputs.json web\public\amplify_outputs.json`

※ monorepo 等で出力先を変える場合は、`npx ampx sandbox --outputs-out-dir <dir>` 等を利用する（AWS公式ドキュメント参照）。

## 本番デプロイ（Hosting + Branch Environment）
- Amplify Hosting を利用して `web/` の静的アセットを配信する。
- 本番用のブランチ環境（Amplify Console）を用意し、必要な backend resource（AppSync/DynamoDB/Auth）をデプロイする。
- ブランチ環境に対するクライアント設定は以下で生成できる。
  - `npx ampx generate outputs --app-id <app-id> --branch main --format json --out-dir web/public`

### Amplify Hosting（monorepo）のビルド例（概念）
Amplify Console のビルド手順では、少なくとも以下が実行されるようにする。

- 依存関係インストール（ルート & web）
  - `npm install`
  - `npm --prefix web install`
- Branch Environment の `amplify_outputs.json` を `web/public` に生成
  - `npx ampx generate outputs --app-id <app-id> --branch <branch> --format json --out-dir web/public`
- web をビルド
  - `npm --prefix web run build`

## 生成されるAWSリソース（概略）
- AppSync(GraphQL API)
- DynamoDB（データストア。Candidate.totalScore を集計済みとして保持）
- Cognito（ゲストアクセス用のIdentity Pool 等）
- Amplify Hosting（静的配信）

## リアルタイム更新（Subscription）
本MVPのリアルタイム更新は、`upsertVote` mutation と紐付いたカスタム Subscription を購読する。

- `onCandidateUpdated(eventId)` を購読
- 投票が行われるたびにクライアントが結果を再取得して画面を更新する

## 運用上の注意（MVP）
- ゲストアクセスは不正利用リスクがあるため、レート制限や入力バリデーションは段階的に検討する。
- `score` は必ず整数（未入力は0）として送る。`null` の加算はエラーになり得るため、クライアント側で正規化する。
