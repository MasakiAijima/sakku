# Sakku — ローカル開発プロジェクト

本人が書いた情景文から英語Haikuの候補を生成し、選んだHaikuと情景文を記録するアプリです。
「01 情景を書く → 02 Haikuを選ぶ → 03 記録する」の画面構成を維持しています。

## 起動

Node.js 24以降とpnpm 11.25.0を使います。ダウンロードしたZIPを解凍し、`sakku`フォルダをCodexのプロジェクトとして開いてください。

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm db:local
pnpm dev
```

表示されたローカルURL（通常 http://localhost:5173）を開きます。ローカル用のサインインを選んで進めてください。開発用の固定ユーザーで動作し、実際のChatGPTアカウントには接続しません。
Corepackが未導入の場合は、先に `npm install --global corepack` を実行してください。

## APIキーの入力

プロジェクト直下に `.env.local` を作成済みです。キーの値は空です。Codexのファイル一覧で開いて、ご自身のPC上で記入してください。

```dotenv
AI_PROVIDER=groq
HAIKU_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=
HAIKU_USER_DAILY_LIMIT=20
HAIKU_SERVICE_DAILY_LIMIT=1000
HAIKU_SERVICE_DAILY_TOKEN_LIMIT=1000000
HAIKU_MAX_OUTPUT_TOKENS=1800
HAIKU_PAID_MODE=false
```

`GROQ_API_KEY=` の右側に保存済みのキーを記入します。`AI_PROVIDER=groq` と `HAIKU_MODEL=openai/gpt-oss-20b` を保存して開発サーバーを再起動すると生成が有効になります。未設定の間は生成APIが503を返します。OpenAI APIを使う場合は `AI_PROVIDER=openai` と `OPENAI_API_KEY` に切り替えられます。
このファイルはGitの管理対象外です。チャットへの貼り付けや配布ZIPへの再同梱は避けてください。
本番サイトの環境変数とは別の設定です。このファイルを編集しても、公開済みSakkuの設定は変更されません。

Groq は OpenAI 互換の Chat Completions API と JSON Schema Structured Outputs を使います。キーはサーバー環境だけで読み、ブラウザーへの応答やログには含めません。生成は UTC 日ごとに本人20回、サービス全体1,000回／予約トークン100万を既定上限として、外部APIを呼ぶ前に原子的に枠を予約します。同じ `requestKey` の再送は保存済み結果を返し、失敗・429・45秒タイムアウトを同じキーで自動再試行しません。

無料運用から有料モデルへ自動切替はしません。有料利用を明示的に有効にする場合だけ `HAIKU_PAID_MODE=true`、`HAIKU_DAILY_BUDGET_MICRO_USD`（1 USD = 1,000,000）、1回分の最大予約額 `HAIKU_RESERVE_MICRO_USD` を設定してください。いずれかが未設定、または日次予約額が予算を超える場合は外部APIを呼ばず停止します。

生成履歴には、情景文と補助条件、3候補、provider/model、プロンプト版、使用量、状態、日時を保存します。完成記録には生成ジョブ、選択候補番号、実際に保存した編集稿を関連付けます。候補履歴は認証済みの本人だけが最新50件を再閲覧できます。現時点では自動削除を行わず記録と同期間保持します。削除機能を導入するまでは D1 管理者による本人単位の削除を運用手順とし、候補だけを先に消す場合は完成記録側の編集稿を残します。

## ローカル保存

DBはD1のローカルエミュレーション、写真はR2のローカルエミュレーションを使い、データは `.wrangler/` に保存します。本番の記録や写真はダウンロードしていません。
`pnpm db:local` はローカルDBにのみSQLマイグレーションを適用します。

## 実装済み

- 本人が書く情景文と、任意・初期非表示の補助入力。
- 3つのHaiku候補の生成処理、選択・編集・記録、下書き保存。
- 記録・設定・写真・生成履歴の保存、本人別のアクセス制御。
- 期間取得・ページ分割、再送による重複防止と編集競合の検出。
- React / TypeScript / Vinext、Cloudflare Workers、D1、R2。
- スマートフォン版へ共有できるAPI契約と検証処理。

## 未完了

実生成の品質評価、スマートフォンの実装・認証、正式な二十四節気・七十二候の暦、生成画像の検証は未完了です。Issue #6の期間閲覧は日付・暦年・手入力期間による試作です。工程3Bの比較欄はCSS図形で、最終採用ではありません。

## 確認コマンド

```bash
pnpm typecheck
pnpm test
pnpm build
```

API仕様は `docs/record-api.md`、構成方針は `docs/architecture.md` を参照してください。
工程2・3Bの確定した方向、試作、未検証事項は `docs/issue-6-design-spec.md`、検証結果は `docs/issue-6-verification.md` に記録しています。

画面試験は `pnpm dev` で起動したローカル画面を使います。PlaywrightとChromeが別途必要です。Playwrightがプロジェクトの依存パッケージにない場合は、インストール済みモジュールの絶対パスを `PLAYWRIGHT_MODULE` に指定します。

```bash
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs pnpm test:screen
```

`TEST_BASE_URL` の既定値は `http://127.0.0.1:5173`、`BROWSER_CHANNEL` は `chrome`。`SCREENSHOT_DIR` を指定すると画面を保存します。試験はAPIを固定応答に置き換え、実AI・本番データを使いません。

## 引き継ぎ

公開中のSakkuのコミット `7fa78ebd5d50388df006e5c2a2aa3277791e9d45` から作成し、ローカル設定を追加したコピーです。本番サイトは変更していません。Git履歴・依存パッケージ・認証情報・本番データ・ビルド済みファイルを含みません。

## この配布版の確認結果

型チェック、portable構成のビルド、3件のローカルD1マイグレーション適用が成功しました。依存パッケージは検証環境の既存インストールを使用しています。ご自身のPCでの新規インストールとブラウザー操作は未検証です。APIキーは空のため実APIへの通信はしていません。
