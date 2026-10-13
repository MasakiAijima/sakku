# 採用済み72候アセットを更新・配布する

#19の正式出力は `public/seasonal-assets/releases/c-v2/`。採用版は `public/seasonal-assets/current.json` で選ぶ。旧版c-v1と試作A/B/C/C′を保存している。利用者はC/C′と成長表現を承認し、idleは静止Cを維持することを選択した。

| 状態 | 形式 | 内容 |
| --- | --- | --- |
| initial | 透過PNG | C′の差し色パーツのみ |
| completed | 透過PNG | C全体 |
| transition | lossless animated WebP | C′からCへの有機的成長、計720ms、1回再生 |
| idle | 透過PNG | completedと同じ静止C |

全72候、288状態ファイル。512×512、sRGB、同じキャンバス中心アンカー。C′自身の可視範囲を拡大・中央寄せしない。manifestのplacementは保存済み700角配置の座標、Cの可視中心・長辺を持つ。固定配置の共通可視長辺は43.24。transitionはC′パーツの中心から揺らぐ境界を広げる。画像自体を移動させない。

## 更新

Python 3.13、`scripts/seasonal-requirements.txt` のPillow/NumPyを用意する。下記の `python3` はその環境のPythonを指定する。Nodeはプロジェクト指定の24以上を使う。

1. 候別の意味・主モチーフ・構図・パレットを `data/seasonal-artwork-v3.json` と修正データに記録する。C配色の入力は `data/seasonal-color-study-c72.json`。主モチーフ名と全候のコンタクトシートを確認する。
2. 意図的な新規生成・指示変更は、新しい `color-study-*` 名の入力JSONを作る。出力は同じstudy名の別ディレクトリとなる。既存の成功済み画像を上書きしない。
3. 生成サービスはOpenAI、モデルgpt-image-2、高品質1024角。既存のimagegen付属CLIを使う。`.env.local`の既存キーは読込時だけ利用し、記録に出さない。通常表示にはキーも生成サービスも不要。

```sh
# 計画のみ。生成APIを呼ばない
python3 scripts/generate-seasonal-color-study.py --study color-study-c72
# 指定候の制作。成功済みは原本・公開画像のハッシュを確認して再利用
python3 scripts/generate-seasonal-color-study.py --study color-study-new --ids kou-01,kou-32,kou-54 --execute
# 失敗・中断試行を確認した後だけ、指定候を再実行
python3 scripts/generate-seasonal-color-study.py --study color-study-new --ids kou-01 --execute --retry-failed
```

`--retry-failed`は`--execute`と明示的な`--ids`が必要。旧試行の原本・公開出力・費用不明の記録を`review/retries/`へ退避し、成功済みは退避しない。指示や参照のハッシュが変わっていれば、新studyが必要。通常の失敗後再実行で不確かなAPI試行を勝手に課金し直さない。

4. 次の原画セットには、先にCの固定配置を保存する。

```sh
python3 scripts/update-seasonal-fixed-layout.py --gallery public/seasonal-assets/color-study-new/manifest.json
python3 scripts/extract-seasonal-cprime.py --completed-study color-study-new --output-study color-study-new-prime --rules data/seasonal-cprime-extraction.json
```

C′は既存Cから `scripts/extract-seasonal-cprime.py` で抽出する。色域と候別領域の条件は `data/seasonal-cprime-extraction.json`。残った画素がCの同じ位置と一致することを検査する。既定の入力はC72/Cprime72の承認済みディレクトリ。別の原画セットでは抽出規則もレビューして指定する。
5. 次の未使用アセット版へ加工する。最初は3候で確認してから全72候へ進む。

```sh
python3 scripts/package-seasonal-release.py --version c-v3 --completed-study color-study-new --initial-study color-study-new-prime --ids kou-01,kou-32,kou-54
python3 scripts/package-seasonal-release.py --version c-v3 --completed-study color-study-new --initial-study color-study-new-prime --all
python3 scripts/package-seasonal-release.py --version c-v3 --check
```

加工は候ごとの一時ディレクトリから原子的に確定する。同じ入力の成功済み候は再利用し、中断後は不足分から再開できる。版別ロックで重複実行を防ぐ。入力変更は同じ版へ書けない。全72候の検証完了までmanifestは公開せず、完成後もstatusはreview。`current.json`には触れない。

## 確認・切替・復元

`/seasonal-assets/release-review.html?candidate=c-v3` で候補版を確認する。正式ローダーはschemaVersion2の72候・配置・状態参照を検証する。静止画を先に表示し、選択した候のtransitionだけを遅延読み込みする。欠損時と動きを減らす設定ではcompletedへ戻る。

```sh
SEASONAL_PYTHON=python3 node scripts/seasonal-release.mjs validate --version c-v3
# アート確認後に承認して採用版へ切替
SEASONAL_PYTHON=python3 node scripts/seasonal-release.mjs promote --version c-v3 --approve-art
# 以前の採用版へ復元。以前のmanifestハッシュと全画像を再検証する
SEASONAL_PYTHON=python3 node scripts/seasonal-release.mjs rollback
```

manifest・全状態・provenanceのハッシュ、ID欠損、外部パス・シンボリックリンク逃避、実PNG/WebPの復号、透過、アンカー、余白、Cの可視範囲内に収まる全フレーム、720ms、始点・終点を検査する。承認ポインターはロック下で原子的に切り替える。失敗で現在版を壊さない。履歴は `release-history.json`。

## 保存・配布・オフライン

採用ストレージはリポジトリ同梱の版付き `public/seasonal-assets/releases/`。外部のリモートストレージへのアップロードは採用していない。制作原本は `output/seasonal-assets/`、公開配布物には秘密キーとローカル絶対パスを含めない。

```sh
SEASONAL_PYTHON=python3 node scripts/seasonal-release.mjs export --version c-v2 --output output/seasonal-assets/distribution/c-v2-new
```

書き出し先は新規ディレクトリに限る。`public/seasonal-assets/`へ4状態・provenance・再検証記録・manifest・currentポインター・公開確認画面をまとめる。書き出した一式も再検証する。同梱ファイルをアプリのpublicへ配置すれば配布できる。今回の検証済み出力は `output/seasonal-assets/distribution/c-v2/`。

正式確認画面は `/seasonal-assets/release-review.html`。「オフライン用に保存」で216静止画をハッシュ検証して保存する。未保存の新しい版が失敗した場合は、前の保存済み版を維持する。通信なしで再読み込みしてC′/C/静止idleを表示できる。transitionは選択時に保存し、未保存ならオフラインではCへ戻る。認証付きホーム全体をキャッシュする機能は含まない。

## 制作記録と運用

provenanceにはアセット版、provider/model、生成条件・指示、指示のSHA-256版、生成日時、UTC加工日時、原本参照のハッシュ、権利情報を記録する。参照画像は利用者提供で、所有権の独立した法的調査は実施していない。アート承認と権利の調査は別に記録している。

画像生成費用は当初の無料枠、1,000円、10,000円の検討後、利用者が上限を解除した履歴を保持する。CLIからusageや実請求額を取得できなかったため `actualCost:null`。予約額・料金表による推定を実測とは扱わない。今回のパッケージ・復元・配布では生成APIを呼んでいない。

アセット更新は必要時の手動実行。年1回の見直しは可能だが、毎年の再生成を必須にしない。暦データの年次更新とアセット版を分離し、承認済みの同じ版を再利用する。未レビューの生成物を自動採用しない。

c-v2の実ファイルは21,482,492bytes。状態別はinitial644,559、completed5,985,205、transition8,353,248、idle5,985,205bytes。これはファイルサイズで、実機メモリや速度の測定値ではない。

## 検証と担当Issue

- `tests/test_seasonal_release.py`: 実3候の加工、再利用、失敗再開、改変、排他、旧版互換、別studyの入力。
- `tests/test_seasonal_color_resume.py`: 生成APIをモックし、選択再実行・成功再利用・旧試行保存を検証。
- `tests/seasonal-release-loader.test.mjs`: 正式manifest契約と不正データ拒否。
- `tests/seasonal-release-promotion.test.mjs`: 切替・復元・書き出しと失敗時のcurrent不変。
- `tests/seasonal-release-live.test.mjs`: Chromeで3候の実WebPの始点・終点、選択時のみの読込、欠損復帰。
- `tests/seasonal-release-offline.test.mjs`: 保存後の通信なし再読込、全72初期/完成の復号、不正な新manifestで旧版維持。

ローカルの上記検証と既存unit55件を通過。画像検査とオフライン検査のCI設定は `.github/workflows/seasonal-assets.yml`。リモートCIの実行完了とは扱わない。

#19は制作・版付き保存・正式出力とロード検証を担当する。本体ホームの72候描画への統合とE2Eは、Issueの役割定義に従い#16で追跡する。請求額の照合は利用者の指示で#19の完了条件から除外した。actualCostは未確認のnullを維持する。
