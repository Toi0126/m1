# copilot-instructions.md
description: This file describes the development guidelines for the project.

## Primary Directive
- 英語で考え、応答は日本語で行うこと

## 作業の進め方
- t_wadaのTDDで、YAGNIの原則に従い、Baby stepsで進める
- AWSの各種サービスの仕様はAWSのMCPを活用して最新情報を確認する
- フレームワークやライブラリの仕様はContext7で最新版を確認しながら実装を進める
- serenaも積極的に活用し、効率よく開発を進める
- 進捗は元のドキュメントと serena のメモリに適宜記録しながら進める

## 方針
- 設計時の参考にするGeminiのResearch結果: `docs/developer_guide/researches/research_report_by_gemini.md`
- 方針は以下にまとめる。実装が現状の方針と変化した場合は、必ずドキュメントを更新すること
    - 仕様概要：`docs/developer_guide/spec.md`
    - 設計概要：`docs/developer_guide/design.md`

### 作業環境
- Python3.12
- パッケージマネージャー: `uv`（`pip`は使用しない）
- 仮想環境: `uv sync`で作成された`.venv`
- パラメータ: `config/.env`内の環境変数（`config/.env_sample`からコピー）
- 実行: アプリケーションを起動するには`uv run`を使用

### 文書
- テキストファイルにMarkdown、図にはmermaidを使用
- ファイル名は指定のない限り英語とし、snake_caseを採用する
- 構成は下記に従う。修正が必要な場合はそれを示す。
    ```markdown
    docs
    ├─developer_guide/          : 開発者向けガイド
    │  ├─requirements
    │  │  ├─analyses
    │  │  │  ├─xxx_design_detail.md  : 下記機能ごとに個別に定義され、かつコード中コメントとして記載が難しい内容について記載
    │  │  │  └─...
    │  │  └─...
    |  ├─sequences/                  : シーケンス図
    |  ├─design.md                   : 設計仕様
    |  ├─devops.md                   : 開発・運用手順書
    |  ├─spec.md                     : 機能仕様
    |  └─deploy_operation.md         : AWSへのデプロイ手順
    ├─plans/                         : 修正・実装計画
    └─researches/                     : 調査
    ```

### 設計原則
- マイクロサービスアーキテクチャを採用し、機能ごとに独立したサービスとして実装する
- AWS上での稼働を前提としつつ、オンプレミス展開を想定して環境依存処理はアダプタ層に抽象化する
- コードコメントはgoogleスタイルのdocstringで統一する

### 設計ガイドライン
- 共通仕様を変更する場合は`spec.md`と`design.md`双方の更新を伴うことを前提とし、破壊的変更有無を明示する

### 検証
- 単体テスト、統合テスト: `cd backend && uv run pytest ./tests`
- テスト関数にはそのテストで何を検証するかを示す1行程度の日本語コメントをdocstringで記載する

### コード品質
- リント: `uv run ruff check`
- フォーマッティング: `uv run ruff format`
- 型チェック: `cd backend && uv run mypy ./src`