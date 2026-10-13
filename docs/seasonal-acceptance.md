# Seasonal Orbitの受け入れ確認

2026-10-14 JST。#12〜#16の最新版を照合した記録。対象はPR #27とそのCI修正。暦は採用版ac9f68a、アートはc-v2。旧案の円周5°配置・幾何形initial・継続的なidleそよぎは、#16/#19で承認済みの700角固定配置・C′/C・静止idleへ置き換える。

## #12 状態判定

| 条件 | 根拠 | 判定 |
| --- | --- | --- |
| 72IDの欠損・重複なし、規定順 | tests/seasonal-orbit.test.mjs、tests/calendar.test.mjs | 確認済み |
| 実立春・JST午前0時・閏日・年越し・端末TZ・過去未来年 | 同上。合成fixtureと正式採用暦の試験を区別して実行 | 確認済み |
| 記録非依存でcurrent/visitedを完成扱い | seasonal-orbitの純関数は記録を参照せず、records追加時の不変性を自動試験 | 確認済み |
| 欠損・不正日付・未知版は推測せずunavailable | tests/seasonal-orbit.test.mjs、tests/seasonal-art.test.mjs | 確認済み |
| 起動・境界・focus/pageshow/visibilitychangeで再評価、解除で停止 | tests/seasonal-orbit.test.mjs、tests/seasonal-home-live.test.mjs | 確認済み |

#12の状態判定基盤はPR #17/#18/#25でmainに存在する。PR #27のアート統合の完了と、暦基盤の完了を区別する。

## #13 固定配置

| 条件 | 根拠 | 判定 |
| --- | --- | --- |
| 0/12/42/72候で座標・画像フレーム・通常重なり順が不変 | tests/seasonal-home-live.test.mjs | ローカルChrome確認済み |
| 選択候のみ前面、候ID・読み上げ名・矢印/Enter/Spaceと一覧 | 同上、shared/seasonal-art-runtime.js | ローカルChrome確認済み |
| 320〜1280px・ホーム内HTMLのフォントサイズをCSSで2倍にして横はみ出しなし | tests/seasonal-home-live.test.mjs | ローカルChrome確認済み |
| iOS/Android実機、実スクリーンリーダー | #1の対象端末・方式確定後に#16と共通実施 | 未確認 |

## #14 素材契約とロード

| 条件 | 根拠 | 判定 |
| --- | --- | --- |
| 正式manifest、72ID・状態・SHA-256・安全なパス・配置の検証 | tests/seasonal-art.test.mjs、seasonal-release-loader.test.mjs、test_seasonal_release.py | ローカル・修正後リモートCI確認済み |
| 3候のPNG/WebPを実復号、最初C′/最後C、選択分のみtransition読込 | tests/seasonal-release-live.test.mjs。制作時の記録はdocs/seasonal-release.md | 既存Chrome検証記録あり |
| CのRGBA画素と512角フレームをC′に保存 | tests/test_seasonal_cprime_inputs.py | 全72候の再抽出で確認済み |
| オフラインで全72候初期/完成、欠損時の静止fallback、旧保存版維持 | tests/seasonal-release-offline.test.mjs、seasonal-home-offline.test.mjs | ローカルChrome確認済み |
| 形式・サイズ | PNG静止、lossless animated WebP、512×512、sRGB。c-v2は21,482,492bytes、詳細はdocs/seasonal-release.md | 記録済み |
| ロード時間・メモリ、実機の質感・操作 | #1/#16と共通の実機確認 | 未計測・未確認 |

PNGの圧縮バイトは環境で変わる。再抽出結果はサイズ・モード・デコード後のRGBA画素で比較する。承認済み配布物そのものの完全性は、従来どおりSHA-256で検証する。どちらの比較も役割を維持する。

## #15 成長と静止

| 条件 | 根拠 | 判定 |
| --- | --- | --- |
| 初回・年変更時に到来済みを順次成長。manifest設定は720ms、45ms間隔 | tests/seasonal-home-live.test.mjs、shared/seasonal-art-runtime.js | ローカルChrome確認済み |
| 同一年は追加到来だけ再生、選択で再生しない、完成idleは無更新 | 同上 | ローカルChrome確認済み |
| 非表示・Reduced Motionで静止、欠損画像は利用可能な静止画 | shared/seasonal-art-runtime.js、素材・オフライン試験 | 実装と既存試験あり |
| Haiku保存による成長再生なし | tests/seasonal-home-live.test.mjsで生成・候補選択・完成保存・ホーム復帰を固定応答APIで操作 | ローカルChrome確認済み |
| 同時成長上限と低性能実機でのフレーム低下 | 重複更新で24候の同時成長を再現。既存キュー末尾への追加へ修正し、16候以下の上限と追加到来・年変更・非表示・Reduced MotionをChrome回帰試験で確認 | 上限は修正検証済み。低性能実機のフレームは未計測 |

## #16 次に必要な確認

- ホーム統合後の全体作品の最終目視承認。
- #1で選んだ端末・OS・ブラウザーで、タップ・回転・スクロール・バックグラウンド復帰・通信断を確認。
- VoiceOver/TalkBack等の実読み上げで、候名・選択・現在候・一覧を操作。
- 冷起動と再起動、成長中と静止中を分けてロード時間・メモリ・フレームを記録。

前回のローカル全体検証に加え、今回も単体58件と採用暦の4季節年を再検証した。CIのC′試験はPNGファイルバイト比較で失敗し、画素比較へ修正。修正コミット13d88f1でvalidate/verifyがともに成功。実機・目視承認が必要なIssueを自動で閉じない。

## 最初の実機対象

利用者が2026-10-14にiPhone SafariのWeb版を最初の対象として選択した。ネイティブ方式の採否・最低OS・共通認証の正式決定とは区別する。実施手順と未確認欄は `docs/iphone-safari-verification.md`。
