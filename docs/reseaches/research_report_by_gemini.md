AWSサーバーレスアーキテクチャを用いたリアルタイム・ソーシャル投票システムの設計と実装に関する包括的レポート

1. 序論

1.1 背景と目的

現代のウェブアプリケーション開発において、リアルタイム性とコスト効率の両立は極めて重要な課題である。特に、友人同士の集まりや小規模なイベント（例：M-1グランプリの同時視聴会など）において、参加者が手元のスマートフォンを用いてリアルタイムに相互作用する「ソーシャル投票アプリケーション」の需要は、エンターテインメント体験の共有という文脈で高まっている。

本レポートは、クライアントより提示された「スマホでみんなが使えるWebアプリを作りたい」という要望に対し、AWS（Amazon Web Services）を活用して安価かつ高機能なMVP（Minimum Viable Product）を実現するための技術的構成を包括的に論じるものである。特に、全員の合計点と順位、および個人の順位を即座にフィードバックするという要件を満たすため、低レイテンシなデータ同期と効率的な集計ロジックの実装が求められる。

1.2 レポートの範囲と構成

本稿では、AWS Amplify Gen 2、AWS AppSync、Amazon DynamoDBを中心としたサーバーレスアーキテクチャを採用し、インフラストラクチャの管理コストを最小限に抑えつつ、スケーラビリティとリアルタイム性を確保する設計を提案する。

レポートは以下の構成で展開される。

要件分析: ユーザー体験（UX）と技術的制約の整理。

アーキテクチャ設計: 選定技術の根拠と競合技術との比較。

データモデリング: DynamoDBにおけるシングルテーブル設計（Single Table Design）の詳細。

実装詳細: Amplify Gen 2を用いたバックエンド構築とランキングアルゴリズムの実装。

コスト分析: 無料枠の活用とオンデマンド料金による経済性の評価。

2. 要件定義と分析

2.1 機能要件の深掘り

提示されたMVP（Minimum Viable Product）の仕様に基づき、システムが満たすべき具体的な機能を定義する。

2.1.1 イベント管理と参加フロー

「イベント」は、特定の採点会（例：M-1 2025 決勝）を指すコンテナである。

作成: 主催者はイベントタイトルと採点対象（出場者リスト）を定義する。

参加: 参加者は「イベントID」と「名前」のみで参加可能である必要がある。ここで重要なのは、煩雑なアカウント登録（メールアドレス認証やパスワード設定）を強制しないことである。ユーザビリティを阻害する認証フローは、カジュアルな利用シーンにおいて致命的な離脱要因となる。

2.1.2 投票とリアルタイム集計

採点: 各参加者は、各採点対象に対して整数のスコアを入力する。未入力は0点として扱われるため、NULLハンドリングの実装が必要となる。

結果表示（全体）: 全参加者のスコア合計と、それに基づく順位を表示する。

結果表示（個人）: 参加者自身のスコアと、それに基づく順位を表示する。

2.1.3 ランキングロジック（標準競技ランキング）

順位付けのルールとして「同点は同順位、次の順位は飛ばす（例: 1位, 1位, 3位）」が指定されている。これは競技プログラミングやスポーツ統計において「Standard Competition Ranking（1224方式）」と呼ばれる標準的なアルゴリズムである。このロジックはデータベースのクエリだけで解決することが難しく、アプリケーション層での処理が必要となる重要な技術ポイントである。

2.2 非機能要件

コスト効率: 「AWSを使って安く実現する」という制約は、単に安いインスタンスを選ぶことではなく、アイドルタイム（使用されていない時間）のコストをゼロにすることを意味する。イベントは断続的に開催されるため、常時稼働するサーバー（EC2やRDS）は不適当である。

リアルタイム性: 誰かが投票した瞬間、他の参加者の画面上の「全員合計」が変わるようなライブ感が求められる。

デバイス対応: スマホからのアクセスが前提となるため、レスポンシブなSPA（Single Page Application）またはPWA（Progressive Web App）としての提供が望ましい。

3. アーキテクチャ選定とトレードオフ分析

コストと開発効率、そしてリアルタイム性を最大化するために、本プロジェクトでは「フルサーバーレス構成」を採用する。以下に主要コンポーネントの選定理由と比較分析を示す。

3.1 API層: AWS AppSync vs Amazon API Gateway

リアルタイムなデータ同期を実現するための技術選定である。

3.1.1 比較分析

特徴

AWS AppSync (GraphQL)

Amazon API Gateway (WebSocket)

通信プロトコル

GraphQL Subscriptions (WebSocket over MQTT)

Raw WebSocket

開発工数

低: データ変更に対するサブスクリプションが自動生成される。

高: コネクション管理、切断処理、メッセージのファンアウト（配信）ロジックを自前で実装する必要がある。

コスト構造

リアルタイム更新100万回あたり$2.00 + 接続分。

メッセージ100万件あたり$1.00 + 接続分。

データ取得

クライアントが必要なデータのみを指定して取得可能（Over-fetching防止）。

REST形式またはカスタムJSON。全データを送受信しがち。

3.1.2 選定理由

本プロジェクトでは AWS AppSync を選定する。 API GatewayのWebSocket APIはメッセージ単価こそ安いものの、接続状態の管理（Connection IDをDynamoDBに保存し、Lambdaでループして送信するなど）の実装コストが高い。一方、AppSyncはGraphQLのSubscription機能により、バックエンドのデータ変更をトリガーとして、接続している全クライアントへ自動的にデータをプッシュする機構がマネージドサービスとして提供されている。 また、AppSyncの無料枠（12ヶ月間、月間25万回のクエリ/変異、25万回のリアルタイム更新）は、小規模なグループ利用においては十分すぎる容量であり、実質的なコストはゼロに抑えられる可能性が高い。

3.2 データベース層: Amazon DynamoDB

ステートレスなサーバーレスアプリケーションのデータストアとして、RDBMS（Relational Database Management System）ではなくNoSQLのDynamoDBを採用する。

3.2.1 選定理由

コストモデル: DynamoDBのオンデマンドモードは、リクエストごとの課金であり、待機コストが発生しない。これは不定期に開催されるイベント投票アプリの特性と完全に合致する。

スケーラビリティ: イベント参加者が数人でも数千人でも、設定変更なしにリクエストを処理できる。

AppSyncとの親和性: AppSyncのリゾルバ（処理ロジック）はDynamoDBと直接統合されており、Lambda関数を介さずにデータベース操作が可能であるため、レイテンシ（遅延）とコスト（Lambda実行料）を削減できる。

3.3 アプリケーション構築・管理: AWS Amplify Gen 2

AWS Amplifyは、フロントエンドとバックエンドの統合開発プラットフォームである。従来のGen 1（CLIベース）から進化した Amplify Gen 2 を採用する。

3.3.1 Gen 2の優位性

Gen 2は「Code-First」のアプローチを採用しており、TypeScriptでバックエンドのリソース（データモデル、認証設定）を定義するだけで、適切なCloudFormationテンプレートが生成・デプロイされる。

開発速度: amplify/data/resource.ts にスキーマを書くだけで、DynamoDBテーブルとAppSync APIが自動構築される。

型安全性: フロントエンドとバックエンドで型定義を共有できるため、バグの混入を防ぎやすい。

サンドボックス環境: 開発者ごとに独立したクラウドサンドボックス環境を瞬時に展開でき、チーム開発や個人の実験が容易である。

4. データベース設計とデータモデリング

NoSQLデータベースであるDynamoDBを最大限に活用し、コストとパフォーマンスを最適化するためには、「シングルテーブル設計（Single Table Design）」の採用が不可欠である。RDBMSのように正規化してテーブルを分割すると、結合（JOIN）操作ができないDynamoDBでは複数のリクエストが発生し、料金とレイテンシが増加する。

4.1 エンティティ関係図（ERD）の分析

アプリケーションには以下の主要エンティティが存在する。

Event (イベント): 投票会の親オブジェクト。

Candidate (採点対象): M-1出場者など。Eventに属する。

Vote (投票): 参加者がCandidateに対して投じた点数。Event, Candidate, Userに紐づく。

これらは 1対多 (Event -> Candidate) および 多対多 (User <-> Candidate via Vote) の関係を持つ。

4.2 シングルテーブル設計のスキーマ

全てのデータを単一のテーブル（例: VotingAppTable）に格納し、パーティションキー（PK）とソートキー（SK）の組み合わせでデータを区別する。

4.2.1 キー構造の定義

エンティティ

PK (Partition Key)

SK (Sort Key)

属性 (Attributes)

アクセスパターン

Event

EVENT#<eventId>

META

Title, Status, CreatedAt

イベント詳細の取得

Candidate

EVENT#<eventId>

CAND#<candidateId>

Name, Description, TotalScore

イベント内の全候補者取得

Vote

EVENT#<eventId>

VOTE#<userId>#CAND#<candidateId>

Score, UserId, CandidateId

特定ユーザーの投票一覧取得

この設計により、PK = EVENT#<eventId> でクエリを行うだけで、そのイベントに関連する情報（メタデータ、候補者リスト、投票データ）を一括、あるいは条件付きで効率的に取得できる。

4.3 集計戦略：Atomic Counters（原子的カウンタ）

「全員の合計点」をリアルタイムに表示するためには、読み取り時の集計（Read-time Aggregation）を避けるべきである。毎回全ての Vote レコードを読み込んで合計を計算するのは、読み込みコスト（RCU）が膨大になり、参加者が増えると破綻する。

代わりに、書き込み時の集計（Write-time Aggregation）を採用する。

手法: ユーザーが投票（Voteアイテムの作成/更新）を行った際、同時に Candidate アイテムの TotalScore 属性を増減させる。

実装: DynamoDBの「Atomic Counter」機能を利用する。これは ADD TotalScore :val のような更新式を用いることで、現在の値を読み取ることなく、アトミックに数値を加算する機能である。

メリット:

コスト削減: 集計済みのスコアが Candidate アイテムに保持されているため、結果表示画面では Candidate アイテムを読み込むだけで済む。数千件の投票データを読み込む必要がない。

リアルタイム性: スコアの更新が即座に反映され、AppSync経由でサブスクリプション通知が飛ぶ。

4.4 セカンダリインデックス（GSI）の検討

「各参加者ごとの順位」を表示するためには、特定のユーザーがどの候補者に何点入れたかを知る必要がある。 上記の主キー設計では、PK=EVENT#<eventId> と SK begins_with "VOTE#<userId>" でクエリが可能であるが、ユーザーIDを知っている前提となる。 もし「あるユーザーが過去に参加した全イベント」を取得したい要件が出た場合は、GSI（Global Secondary Index）として PK=USER#<userId>, SK=EVENT#<eventId> を設定する必要があるが、今回のMVP要件（イベントIDを知っている前提での参加）では、主キー設計のみでカバー可能である。

5. バックエンド実装戦略（Amplify Gen 2）

Amplify Gen 2の「Code-First」アプローチを用いた具体的な実装構成を詳述する。TypeScriptによるスキーマ定義がインフラ構築の設計図となる。

5.1 データスキーマ定義（amplify/data/resource.ts）

以下は、MVP要件を満たすためのAmplify Gen 2用データモデル定義である。

import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Event: a.model({
    title: a.string().required(),
    // イベントは複数の候補者を持つ
    candidates: a.hasMany('Candidate', 'eventId'),
    // イベントは複数の投票を持つ
    votes: a.hasMany('Vote', 'eventId'),
  })
 .authorization(allow => [
    // 誰でも閲覧可能（イベント参加のため）
    allow.guest().to(['read']),
    // 作成者は更新・削除可能
    allow.owner(),
  ]),

  Candidate: a.model({
    name: a.string().required(),
    eventId: a.id().required(),
    event: a.belongsTo('Event', 'eventId'),
    // 合計スコア（Atomic Counterで更新される）
    totalScore: a.integer().default(0),
    votes: a.hasMany('Vote', 'candidateId'),
  })
 .authorization(allow => [
    allow.guest().to(['read']),
    allow.authenticated().to(['read']),
  ]),

  Vote: a.model({
    score: a.integer().required(),
    eventId: a.id().required(),
    candidateId: a.id().required(),
    event: a.belongsTo('Event', 'eventId'),
    candidate: a.belongsTo('Candidate', 'candidateId'),
    // 投票者の識別子（Cognito Identity ID等）
    voterId: a.string(),
  })
 .authorization(allow => [
    // ゲストユーザーも投票（作成）が可能
    allow.guest().to(['create', 'read', 'update']),
    allow.authenticated().to(['create', 'read', 'update']),
    // 他人の投票は見れないように制御（必要に応じて）
    // allow.owner(), 
  ])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'iam', // ゲストアクセス用
    apiKeyAuthorizationMode: { expiresInDays: 30 },
  },
});


このスキーマ定義のポイントは以下の通りである。

allow.guest(): 未認証ユーザー（ゲスト）に対するアクセス許可を明示的に与えている。これにより、アカウント登録なしでのアプリ利用が可能となる。

リレーションシップ: hasMany と belongsTo を用いて、イベント・候補者・投票の階層構造を定義している。Amplifyはこれを解析し、DynamoDB上で効率的なクエリが可能なように自動的にGSIやリゾルバを設定する。

5.2 認証とユーザー管理（Guest Access）

要件にある「友達同士で集まったとき」というシチュエーションにおいて、全員にサインアップを強いるのはUX上の大きな障壁である。そこで、Cognito Identity Pools（IDプール）の「未認証ID（Unauthenticated Identities）」 を活用する。

5.2.1 ゲストアクセスの仕組み

ユーザーがアプリを開くと、Amplify AuthライブラリがバックグラウンドでCognito IDプールにリクエストを送る。

Cognitoは一時的な「Identity ID」とAWSクレデンシャルを発行する。

このIDはブラウザ（Local Storage等）に保存され、セッションとして維持される。

AppSyncへのリクエストはこのクレデンシャルを用いて署名（SigV4）され、IAM認証として処理される。

バックエンド側では、このIdentity IDを voterId として記録することで、アカウントレスでも「誰の投票か」を識別でき、重複投票の防止や自分の投票の読み出しが可能となる。

実装設定（amplify/auth/resource.ts）:

import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true, // 管理者用など
  },
  // ゲストアクセスの有効化はバックエンド設定ファイルで行う
});


※ Amplify Gen 2ではゲストアクセスがデフォルトで有効化されるケースもあるが、明示的な許可設定が必要な場合がある。

6. フロントエンドアーキテクチャとロジック

フロントエンドはReact（Next.js）を採用し、Amplify Client Libraryを使用してバックエンドと通信する。ここで最も重要なロジックは「ランキング計算」である。

6.1 ランキングアルゴリズムの実装（1224方式）

要件にある「同点は同順位、次は飛ばす（1, 1, 3）」というルールは、サーバーサイド（DynamoDB）で計算して保存するよりも、クライアントサイドで計算する方がコスト効率が良い。候補者数（例：M-1なら10組程度）は少なく、ブラウザの計算リソースで十分瞬時に処理可能だからである。

6.1.1 実装ロジック（TypeScript）

以下は、取得した候補者リスト（スコア付き）をフロントエンドでソートし、ランクを付与する関数である。

interface Candidate {
  id: string;
  name: string;
  totalScore: number;
  rank?: number;
}

/**
 * 標準競技ランキング（1224方式）を計算する
 */
function calculateRanking(candidates: Candidate): Candidate {
  // 1. スコアの降順でソート
  const sorted = [...candidates].sort((a, b) => b.totalScore - a.totalScore);

  // 2. ランク付与ループ
  let currentRank = 1;
  
  return sorted.map((candidate, index) => {
    // 2つ目以降の要素で、かつ前の要素とスコアが同じ場合
    if (index > 0 && candidate.totalScore === sorted[index - 1].totalScore) {
      // 前の人と同じランク（同率）
      candidate.rank = currentRank;
    } else {
      // 新しいランクは「現在のインデックス + 1」
      // 例: インデックス2（3人目）ならランク3
      currentRank = index + 1;
      candidate.rank = currentRank;
    }
    return candidate;
  });
}


このロジックの検証：

スコア: ``

index 0: 100点 -> rank 1

index 1: 100点 -> 前と同じ -> rank 1

index 2: 80点 -> 前と違う -> rank = index(2) + 1 = 3

結果: 1位, 1位, 3位 となり、要件を満たす。

6.2 リアルタイム更新の統合

AppSyncのサブスクリプション機能を用いて、画面を自動更新する。

初期表示: client.models.Candidate.list() で全候補者を取得。

購読開始: client.models.Candidate.onCreate や onUpdate を購読。

イベント発火: 誰かが投票し、Atomic Counterにより候補者の totalScore が更新されると、通知が届く。

再計算: 通知を受け取ったクライアントは、ローカルの候補者リストのスコアを更新し、再度 calculateRanking を実行して表示をリフレッシュする。

このフローにより、投票が行われるたびに手元のスマホで順位がリアルタイムに入れ替わる、臨場感あるUXが実現できる。

6.3 楽観的UI（Optimistic UI）

ユーザー自身の投票操作においては、サーバーからのレスポンスを待たずにUIを更新する「楽観的UI」を採用すべきである。

ユーザーがスライダー等で点数を決定した瞬間、画面上の「自分の採点」表示を更新する。

バックグラウンドで client.models.Vote.create() を実行する。

これにより、ネットワーク遅延を感じさせないスムーズな操作感を提供する。

7. コスト分析と最適化

「AWSを使って安く実現する」という要件に対する詳細な回答である。本構成は、アイドル時のコストがほぼゼロになるように設計されている。

7.1 AWS無料枠の活用

AWSの新規アカウント作成から12ヶ月間適用される無料枠（Free Tier）と、無期限の無料枠（Always Free）を最大限活用する。

サービス

無料枠の内容

本アプリでの想定カバー範囲

AppSync

月間25万クエリ/変異



月間25万リアルタイム更新

数千人規模のイベントでも無料。友人の集まり（10〜20人）なら余裕で範囲内。

DynamoDB

25GBストレージ



25 WCU / 25 RCU (プロビジョニング)

データ量はテキストのみで極小。プロビジョニングモードなら永年無料で稼働可能。

Amplify Hosting

12ヶ月間: 15GBデータ転送/月



500,000リクエスト/月

静的資産（JS/CSS）の配信のみ。個人利用では使い切れない量。

Cognito

月間50,000 MAU（IDプール）

全く問題なし。

7.2 オンデマンドモードのコスト試算

無料期間終了後、またはアクセスがスパイクする場合を想定し、DynamoDBを「オンデマンドキャパシティモード」にした場合のコストを試算する。

シナリオ:

参加者: 20人

採点対象: 10組

1人あたり操作: 各対象に1回投票 + 何度か修正（計15回書き込みと仮定）

閲覧: リアルタイム更新を常時受信

書き込みコスト (Write Request Units - WRU):

総書き込み数: 20人 × 15回 = 300回

DynamoDB Atomic Counter更新を含めると倍の600回。

単価: $1.25 / 100万書き込み

コスト: $1.25 × (600 / 1,000,000) = **$0.00075** (0.1円以下)

読み込みコスト (Read Request Units - RRU):

AppSyncのサブスクリプションによる更新通知は、DynamoDBの読み込みを発生させない（書き込みストリームからの通知）ため、追加の読み込みコストはかからない。

初期ロード時の読み込みのみ発生。

コストは同様に微々たるものである。

結論: この規模のアプリケーションであれば、AWSの利用料は実質的に 数円〜数十円/月 のレベルに収まる。最もコストがかかる可能性があるのは、画像などのメディアファイルを多用した場合の転送量（CloudFront）であるが、テキストベースの投票アプリであれば無視できる範囲である。

7.3 コスト最適化のテクニック

TTL（Time To Live）の設定: DynamoDBのデータに有効期限（例：イベント終了から30日）を設定し、自動削除することでストレージコストを抑制する。

プロビジョニングモードの活用: イベントが開催されていない期間は、DynamoDBを「プロビジョニングモード（WCU=1, RCU=1）」に設定しておけば、無料枠内で完全にコストをゼロにできる（オンデマンドは保持しているだけで課金されるわけではないが、プロビジョニングの無料枠を使うほうが確実な場合がある）。ただし、設定切り替えの手間を考えると、小規模ならオンデマンドのままで問題ない。

8. セキュリティと実装上の注意点

8.1 ゲストアクセスのセキュリティリスク

認証なしでアクセスできるということは、悪意あるユーザーがスクリプトを用いて大量の不正投票を行うリスクがあることを意味する。

対策:

IAMポリシーの最小権限: ゲストユーザー（Unauthenticated Role）には、Vote の create と、Event/Candidate の read のみを許可し、delete や Event の create 権限を与えない。これはAmplifyの .authorization(allow => [allow.guest().to(['read', 'create'])]) で制御可能である。

IPアドレス制限（WAF）: 必要であればAWS WAFをAppSyncの前に配置し、レート制限（Rate Limiting）をかけることでDoS攻撃を防ぐ。ただしWAFはコスト（月額$5〜）がかかるため、MVPではオーバースペックかもしれない。

アプリ側でのバリデーション: 入力値が整数であるか、範囲内（例: 0〜100点）であるかをAppSyncのリゾルバまたはスキーマレベルで検証する。

8.2 データ整合性

「未入力は0点として扱う」という要件に対し、フロントエンドで null や空文字が送られた場合、バックエンド（AppSync/DynamoDB）でデフォルト値を適用するか、クライアント側で 0 に変換して送信する実装が必要である。Atomic Counterを利用する場合、null の加算はエラーになるため、クライアント側で確実に数値型（0）に変換して送信する設計とする。

9. 結論

本レポートで提案したアーキテクチャは、AWS Amplify Gen 2、AppSync、DynamoDBを組み合わせることで、開発の容易さ、運用コストの最小化、ユーザー体験（リアルタイム性・ゲスト利用） のすべての要件を高次元で満たすものである。

特に、シングルテーブル設計による効率的なデータアクセスと、クライアントサイドでのランキング計算、Atomic Counterによる書き込み時集計を組み合わせることで、AWSの課金リソース消費を極限まで抑えることが可能である。

この構成は、単なるMVPにとどまらず、将来的に数千人規模のイベントへスケールアップする際にも、アーキテクチャの大幅な変更なしに対応できる堅牢性を備えている。開発者はインフラ管理から解放され、アプリケーションの機能開発とUI/UXの向上に集中できる環境が整うことになる。

推奨される次のステップ

Amplify Gen 2のサンドボックス環境を用いたプロトタイピング。

DynamoDBのデータモデル（特にGSIとAtomic Counter）のPoC実装。

友人数名でのベータテストによるリアルタイム同期の動作確認。

以上をもって、本プロジェクトの技術基盤に関する提案とする。

付録：技術構成要約表

コンポーネント

選定技術

役割・メリット

Frontend

React / Next.js

UI構築、ランキングロジック実行

Backend / API

AWS AppSync

GraphQLによるリアルタイム通信、データ操作

Database

Amazon DynamoDB

スケーラブルなデータ保存、Atomic Counterによる集計

Auth

Amazon Cognito

Identity Poolによるゲスト認証（アカウントレス利用）

Infrastructure

AWS Amplify Gen 2

TypeScriptによるIaC、CI/CD、ホスティング

Cost Strategy

Free Tier & On-Demand

待機コストゼロ、無料枠の最大活用