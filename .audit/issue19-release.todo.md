# #19 正式アセット制作・配布

- [x] Ground: Issue #19/#14、既存PoCローダーとC/C′を確認
- [x] Agree: C/C′と成長採用、idle=C静止、Issueへ記録
- [x] Implement: 全72候・4状態の版付きbundleとprovenance、再開・検証
- [x] Implement: 正式manifestローダー、選択時のみtransition、静止fallback
- [x] Implement: 承認ポインターの原子的切替・復元、同梱export
- [x] Verify: 3候の実ロード・transition復号、全72参照とハッシュ、オフライン
- [x] Verify: 成功済み再利用、欠損・破損・失敗でcurrent維持
- [x] Document: 手順・保存先・サイズ・費用情報の限界・受け入れ状態

節目: 3候bundle→4状態検証→全72bundle→正式loader→offline→公開ポインター。

実請求額の照合は未完了としてIssue #19に残した。ホーム統合は#16の範囲。
