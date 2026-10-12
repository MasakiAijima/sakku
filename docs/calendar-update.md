# 季節暦データを更新する

原本の取得と採用ルールは[暦仕様](calendar-spec.md)を参照する。Node 24以降を使う。

1. [七十二候計算ページ](https://koyomi8.com/sub/72kou.html)で必要年を指定し、計算結果のCSVを保存する。翌年の季節年には翌々年の立春境界も必要になる。
2. 原本を`data/calendar/raw/`へ保存する。`data/calendar/manifest.json`に指定年・出典URL・取得情報・SHA256・行数・実際の開始／終了日を記録する。元の取得時刻が不明なら`retrievedAt`を`null`とし、受領確認時刻を別に残す。
3. `coverage.calendarYears`と`coverage.seasonalYears`に公開対応年を追加する。前後の境界が揃っていない年は追加しない。
4. `npm run calendar:generate`を実行する。エラーなら原本・取得情報を修正する。古い版付きJSONを削除しない。
5. `npm run test:calendar`と`npm run calendar:check`を実行する。`node scripts/calendar.mjs --check --require-year=2026`の年を現在の西暦に置き換え、今年と翌年の収録を確認する。
6. 原本・manifest・現在版ポインター・追加された版付きJSONの差分を確認してPRにする。名称・読みの変更を確認する。同じ原本を再実行しただけなら生成物の差分は出ない。

原本とmanifestを先にブランチへ登録した場合は、GitHub Actionsの`Calendar data`をそのブランチで手動実行してもよい。正規化・検証後に生成物が変わった場合だけ更新PRを作る。ブランチは`codex/calendar-data-update`を使い、同じ更新のPRを増やさない。リポジトリのActions設定で、`GITHUB_TOKEN`によるPR作成が許可されている必要がある。

自動作成PRの通常イベントに検証を任せず、生成ブランチの`Verify Sakku`を`workflow_dispatch`で明示的に起動する。検証結果を確認してからマージする。標準トークンのイベント制限と例外は[GitHubの説明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)を参照する。

年次チェックは10月1日00:00 UTC、日本時間09:00を指定する。GitHubのスケジュール実行は既定ブランチにマージした後に有効になる。実際の起動時刻はGitHub側で遅延する場合がある。検証失敗や翌年不足は既存の未完了通知Issueへまとめ、新しい通知Issueを重複して作らない。

取り込みに失敗した場合は、`data/calendar/current.json`を維持する。外部取得ができない場合も前年の日付や固定5日計算で補わず、既存の対応範囲を保持する。
