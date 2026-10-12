# Issue #11 の暦データ運用確認

確認日 2026-10-12。対象リポジトリは MasakiAijima/sakku。

## 確認できた動作

既定ブランチの手動実行 [38190565070](https://github.com/MasakiAijima/sakku/actions/runs/38190565070) は成功した。既存 CSV の正規化、暦データテスト、生成結果の一致、今年と翌年の収録確認を通過した。入力に変更がないため、生成データの更新 PR は作成されなかった。

変更時の処理は、main のデータに影響しない隔離ブランチで実行した。`codex/issue11-ops` のコミット `a19326a15583b615f9091a10cc1ae7e2f3485805` で生成済みポインターのみを削除し、手動正規化で復元させた。workflow はテスト用の base と生成ブランチ、テスト専用の通知 Issue タイトルを使用した。

[隔離実行 38190645646 の初回](https://github.com/MasakiAijima/sakku/actions/runs/38190645646/attempts/1) では、正規化、6 件のテスト、生成結果の一致、今年と翌年の収録確認が成功した。生成ブランチへ差分を push した後、PR 作成はリポジトリの権限設定により失敗した。失敗通知は成功し、[テスト Issue #20](https://github.com/MasakiAijima/sakku/issues/20) が作成された。

[同じ実行の再試行](https://github.com/MasakiAijima/sakku/actions/runs/38190645646/attempts/2) でも同じ権限エラーを再現した。失敗通知ステップは成功し、テスト Issue は #20 の 1 件のままで、重複しなかった。

## 完了していない確認

PR 作成時のエラーは `GitHub Actions is not permitted to create or approve pull requests.` だった。リポジトリ設定 API の取得結果は `default_workflow_permissions: read`、`can_approve_pull_request_reviews: false` だった。workflow の job に `pull-requests: write` を指定していても、このリポジトリ設定により PR 作成は許可されない。

この設定を有効にする変更は、自動承認レビューにより拒否された。PR の作成だけでなく承認も許可するため、Issue #11 の作成要件を超える権限拡張と判定された。設定変更は適用していない。ユーザーの明示承認後に権限設定を変更し、変更ありの隔離実行、生成 PR に対する Verify Sakku の明示実行、同一入力で PR が増えないことを確認する必要がある。

年次 cron は毎年 10 月 1 日 00:00 UTC、09:00 JST に設定されている。スケジュールイベント自体は今回実行していない。手動実行と共通の検証処理および失敗通知を確認したことと、cron の実発火を確認したことは区別する。

テスト用の Issue と remote ブランチは確認後に閉じて削除した。main と本番更新用の `codex/calendar-data-update` へテスト差分は投入していない。
