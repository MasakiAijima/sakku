> 採用仕様と現在の実行手順は [seasonal-release.md](seasonal-release.md)。C/C′・成長・静止idleの正式出力はc-v2。以下のPoC仕様・予算条件は制作履歴として保持する。

## A / B / C の四季比較

Aは自然な現行配色、Bは主役色を強色にした案、Cは既存の小面積の第3色だけを強色にした案。第3色はパレット配列順ではなく、主役と第2色以外の補助色面を指す。前回10候に春の2候を補い、12候で四季を比べる。前回Bの10画像は維持し、春B2画像を追加した。

Cの仮アクセント色は春の青 `#155DD8`、夏の朱 `#F24B20`、秋の橙 `#F48708`、冬の桃色 `#E73E73`。定義と編集指示は `data/seasonal-color-study-c.json`。実行は `scripts/generate-seasonal-color-study.py --study color-study-c --execute`。元画像・参照画像・指示・履歴・比較一覧は `output/seasonal-assets/color-study-c/`、公開画像は `public/seasonal-assets/color-study-c/`。比較ページは `public/seasonal-assets/color-abc.html`。

主役と第2色、構図を維持し、枝・茎・卵鞘・小さな陰・割れ目・頬などだけを色替えする。現行72候と固定配置には反映しない。実請求額は未取得。

## 強色10候の比較試作

現行案を維持したまま、乱数シード197210で選んだ10候の色だけを変える比較版。定義は `data/seasonal-color-study-10.json`、実行は `scripts/generate-seasonal-color-study.py --execute`。各候の現行画像を参照し、朱・青・橙のうち1色だけを指定の色面へ使う。bundled CLI の `gpt-image-2 / high` を使用する。

元画像・編集指示・参照スナップショット・生成履歴・新旧一覧は `output/seasonal-assets/color-study-10/`、透過画像と比較manifestは `public/seasonal-assets/color-study-10/`。比較ページは `public/seasonal-assets/color-study.html`。採用済み72候の画像、ギャラリーmanifest、固定配置は変更しない。実請求額は未取得。

## 追加3候の修正版

麦・鮭・乃東生ずの最新修正は `data/seasonal-artwork-revision-3.json` に定義する。麦は雪から数本の茎が伸びる形、鮭は紡錘形の魚体と二股の尾びれ、乃東生ずはウツボグサの紫の花穂へ変更した。画像・履歴は `revision-3` に保存する。

```sh
python3 scripts/revise-seasonal-gallery.py --revision revision-3 --execute
python3 scripts/revise-seasonal-gallery.py --revision revision-3 --publish
python3 scripts/update-seasonal-fixed-layout.py
```

反映時に対象外69候の行・画像ハッシュを確認する。現在のギャラリーは初回画像、12候修正、追加3候修正を候IDごとに参照する。過去の修正を再公開する場合は最新結果を上書きしないよう、対象外の一致検証で処理を拒否する。

## 対象12候の修正版

2026-10-12のユーザーレビューを反映した現在のギャラリーは、初回72候のうち12候を `revision-12` の画像へ差し替えている。修正定義は `data/seasonal-artwork-revision-12.json`、実行と反映は `scripts/revise-seasonal-gallery.py` が担当する。初回用の `generate-seasonal-gallery.py --publish` は修正前の一覧を再構築するため、修正後のギャラリーの公開には使用しない。

この修正だけはユーザーが従来の予算上限の適用を解除した。初回の予算台帳は変更せず、修正の履歴へ `budgetPolicy=user-waived-for-targeted-revision` と実請求額未取得を記録する。

生成は従来と同じ bundled imagegen CLI、`gpt-image-2 / high / 1024x1024`。修正前の画像は保存し、新画像・元画像・生成指示・参照画像・履歴を `output/seasonal-assets/revision-12/` と `public/seasonal-assets/revision-12/` へ保存する。`--execute` で生成し、全12候を視認確認してから `--publish` で一覧へ反映する。残り60候の行と画像ハッシュが一致することを反映時に検証する。

# 72候generatorの実行仕様 v2

2026-10-12。Issue #19。費用上限はユーザーの追加承認により累計10,000円。現行の実行定義と検証記録を含む。最終形式や図案の採用を示さない。


## v3の意味に即した配色と72候案

2026-10-12の追加指定により、配色は候の意味を優先する。`楓蔦黄ばむ` は黄金色の楓と小さなオリーブ色の蔦、`東風凍を解く` は淡青緑の風と淡青の氷・滴を用いる。v2の朱の風、赤い楓、青い蔦は現行の配色指示として使わない。

全72候の現行生成入力は `data/seasonal-artwork-v3.json` とする。主役1点、補助1〜2点以内、一つの季節の関係、有機的な非対称の輪郭を維持し、候ごとに自然な主役色とその理由を指定する。画風の基準は承認済み3図案。kou-01・32・54を先に生成・確認し、残る69候はその配色修正版を画風参照に使う。

実行は `scripts/generate-seasonal-gallery.py` が既存のbundled imagegen CLIを呼び出す。実行するPython環境には `openai`・`numpy`・`Pillow` が必要で、SDK不在は予約とAPI呼出しの前に拒否する。モデルは `gpt-image-2`、1024 × 1024、`quality=high`、PNG。CLIの透過指定を使わず、マゼンタ背景を抜いて透過原本を保存し、512 × 512・可視長辺306へ統一した公開画像も作る。

[公式の画像生成料金](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs) では1024正方形のhigh出力は約0.211USDで、入力画像・テキスト料金は別途。予算台帳は実請求ではなく保守的な予約額を記録する。1候130円をSDKの最大3試行と入力分の余裕として確保し、既存360円と72候9360円の累計9720円を計画額とする。承認上限10000円を超える選択はAPIを呼ぶ前に拒否する。追加の自動再生成は行わず、API到達後または到達が不確かな失敗でも予約額は残す。SDK不足などAPIクライアント作成前と確認できた失敗のみ、根拠を記録して予約を0円へ戻す。請求額はAPIの利用明細で確認する。

実行例は以下。初回の3候を目視確認してから全件へ進む。`--all` は同じプロンプト・参照・条件・原本ハッシュで成功済みの画像を再生成しない。

```sh
python scripts/generate-seasonal-gallery.py --ids kou-01,kou-32,kou-54 --execute --concurrency 3
python scripts/generate-seasonal-gallery.py --all --execute --concurrency 4
python scripts/seasonal-gallery-contact-sheet.py
```

`output/seasonal-assets/poc-v3/<候ID>/` に生成原本・透過原本・プロンプト・ハッシュと生成条件を保存する。`public/seasonal-assets/poc-v3/gallery.json` が全72候の状態と公開画像を管理し、`gallery.html` が季節別・候名検索・拡大表示を行う。生成済み画像と未生成を明確に分ける。保存済み72候座標は維持し、全図案を配置へ採用する際に輪郭を再検証する。

## v2の表現定義と再生成

2026-10-12のユーザー指定を現行の制作基準とする。以下より後のv1のPoC記録は経緯であり、v2の生成指示を上書きしない。

| 項目 | 現行の定義 |
|---|---|
| 目指す表現 | 季節の一場面を、少数の大きな色面と有機的な輪郭で表す。輪郭そのものに表情を持たせる。 |
| 基準画像 | `output/imagegen/microseason-samples-v2/` の顔なし東風・蓮・楓の3点。色、面積差、曲線、重なり方を参照する。直近の `poc-v1` は比較対象とし、画風の基準にはしない。 |
| 主役 | 一つの大きなモチーフを先に決める。補助モチーフは原則1〜2個。主役より十分小さくする。 |
| 形 | 長い曲線、不均等な膨らみ、浅深のあるくびれ。均等な花びら、同形の葉、機械的な反復を避ける。 |
| 構図 | 傾きや張り出しで流れをつくる。中央配置でも内部を左右対称にしない。 |
| 配色 | 必要な色だけを共通パレットから選び、主役色へ広い面積を与える。全色を毎回使わない。 |
| 季節性 | 候名の全要素を列挙せず、候を感じさせる一つの関係や変化を選ぶ。 |
| 質感 | 色面内に控えめな印刷むらを残す。形の弱さを質感で補わない。 |
| アニメーション | 静止画を先に成立させる。動かしやすさのために部品や隙間を増やさない。今回の再生成は静止画を対象とする。 |
| 評価 | 同じ背景・同じ見かけの大きさで前案と比較し、その後に実際の円環サイズで確認する。 |

### 3候の場面と主従関係

| ID | 選ぶ一つの関係・変化 | 主役 | 補助 | 避ける構成 |
|---|---|---|---|---|
| kou-01 | 春風が凍った輪郭をほどく。 | 大きな朱の風の一面。長く伸びる端と不均等に膨らむ端を持つ。 | 小さい淡青の氷片と、さらに小さい青い滴。 | 平行な風帯の反復、氷片の上下対称、中央の大きな滴。 |
| kou-32 | 蓮が片側からほどけるように開く。 | 一つの傾いた花。大小の異なる2〜3枚の広い色面が、深さの異なるくびれをつくる。 | 主役より小さい一枚の浮葉。 | 正面対称の三弁、均等な尖った花弁、立体の花托、波や粒の追加。 |
| kou-54 | 色づいた楓に小さな蔦が重なる。 | 朱の大きな楓一葉。裂片は長短とくびれの深さが異なる。 | 小さい青い蔦葉一枚。 | 五つの等間隔の裂片、黄色い小枝や葉の追加、装飾葉脈。 |

### 入力・出力と実行条件

`assetVersion=poc-v2`、`promptVersion=2`。サービスは既に設定したOpenAI API、モデルは `IMAGE_MODEL=gpt-image-2` を維持する。今回は画風の画像参照を入力するため、付属imagegen CLIのeditを使い、参照は対応する前案一枚とする。画像は画風の参照であり、輪郭をそのまま複製する対象ではない。参照パスとSHA-256、完全な指示を候別に保存する。

静止画は1024角、quality medium。lowからmediumへ上げるが、モデルは変更しない。APIでの直接透過指定は使わず、単色マゼンタ背景を生成してalphaへ加工する。マゼンタを作品色に含めない。参照画像の背景の紙目や影を出力背景に引き継がない。

原本・指示・生成履歴は `output/seasonal-assets/poc-v2/<kouId>/`、検証用completedは `public/seasonal-assets/poc-v2/<kouId>/completed.png`。旧版は保持する。承認前のinitial・transition・idleを自動生成しない。今回の対象3候はこの節の主従関係を使い、旧一覧の詳細要素の全列挙を結合しない。

予算上限は既存の累計1,000円を維持する。参照画像の入力とmedium出力を考慮し、今回の再生成は一件90円を安全側に予約する。3件の追加予約270円、従来90円と合わせて360円。実請求額とは区別し、失敗や不明な請求分を自動で予約解除しない。APIエラーによる手動の自動再実行は行わない。

### 比較条件と採否

同じ生成り背景に、alphaの見える範囲の長辺を同じ長さへ正規化して並べる。旧PoCと新版の作品の見かけサイズを揃える。基準画像3点も別枠で明示する。比較画面の拡大を本番の識別性の証拠にしない。

円環は既存レイアウトの600角viewBox、中心300、半径220、起点−135度、5度刻みを使う。アート枠24×24、キャンバス内の主題占有率60%も一致させる。3候はそれぞれの固定IDの位置に表示し、残る69候は仮マーカーとする。これは全72候のアートが完成した景色ではない。320px幅とデスクトップ幅で確認する。

主役の面積優位、補助の小ささ、曲線とくびれの差、非対称な流れ、不要な色・細部の少なさを目視で評価する。生成完了を採用完了にしない。円環で輪郭が消える場合は、まず輪郭と重なりを見直し、部品や質感を追加する修正へ逃げない。

## サービスとモデルの選定状況

利用可能サービスはGroq。公式の[対応モデル一覧](https://console.groq.com/docs/models)、[画像認識の説明](https://console.groq.com/docs/vision)、[APIリファレンス](https://console.groq.com/docs/api-reference)を確認した。画像認識は画像を入力して文章で回答する機能であり、制作する画像を出力する機能ではない。今回の静止画生成に適したGroqのモデルと画像生成APIは確認できない。

2026-10-12の追加指定でOpenAI API、`IMAGE_MODEL=gpt-image-2`を選定した。ユーザー設定の`OPENAI_API_KEY`を使用する。Groqの文章モデルを画像生成モデルとして記録しない。当初の無料枠限定は、ユーザーの許可により累計1,000円へ変更した。指定モデル以外への自動切替は行わない。無料枠のある別サービスを選ぶ場合も、アカウントの対象枠と利用条件を確認してから実行する。APIキーが設定されていることだけでは無料プランを確認できない。

既存のv2画像を利用する検証は、過去の生成物を使う加工・保存・ロード検証として記録する。新規のGroq生成実績や、新規生成からの一貫したPoCとして数えない。

## 入力契約の案

入力は版付きの制作ジョブJSONとする。サービスとモデルはジョブごとに固定し、品質比較で変更する場合は新しい版を作る。

| 項目 | 内容 |
|---|---|
| schemaVersion | 入力契約の版。初版は1。 |
| assetVersion | 制作一式の版。既存版を上書きしない識別子。 |
| masterVersion | 採用72候マスターの版。候入り日の版とは分ける。 |
| promptVersion | `seasonal-motif-spec.md` の版。初版は1。 |
| kouIds | PoCは `kou-01`、`kou-32`、`kou-54`。全件実行は採用済みの72ID。 |
| provider、model | 確認済みの画像生成サービス名と正確なモデルID。未指定なら生成を開始しない。 |
| generation | サイズ・背景指定・品質・seedなどサービスが対応する条件。非対応のseedを記録しない。 |
| budget | 通貨JPY、上限1,000円。まず1024角・lowで3候を一件ずつ検証する。予算超過の実行を停止する。 |
| sourceMode | 新規生成と既存画像取り込みを区別する。 |
| sources | 既存画像取り込み時の候ID・原本パス・ハッシュ・生成履歴。モデル不明なら不明と記録する。 |
| outputRoot | 制作途中の保存先。公開先と分ける。 |

各候の意味・主モチーフ・構図・生成指示は[モチーフ仕様](seasonal-motif-spec.md)から解決する。ジョブ実行時の入力と組み立てた指示を保存し、後の仕様変更で履歴を書き換えない。秘密鍵は環境変数から読み、ジョブやmanifestへ出力しない。

## 出力契約の案

制作中は `output/seasonal-assets/<assetVersion>/<kouId>/` に保存する。承認後のWeb同梱先は `public/seasonal-assets/<assetVersion>/<kouId>/` を候補とする。リモートストレージの採用先は未決定。ローカル保存だけでリモート保存を完了としない。

| 出力 | 内容 |
|---|---|
| 原本 | サービスから受け取った画像。加工前の内容とハッシュを保持する。 |
| initial | Muted Popの静止画。completedと同じキャンバス・アンカー。 |
| completed | 透過加工と品質確認を行った完成静止画。 |
| transition | 承認したinitialからcompletedへ変わるアニメーション。 |
| idle | completedの小さなそよぎのループ。 |
| provenance.json | 候ID、各版、サービス・モデル、指示、生成条件・日時、取り込み日時、権利情報、各ファイルのSHA-256、費用の根拠。 |
| manifest.json | IDごとの4種の相対パス、形式・寸法・色域・透過、アンカー・余白・最大可動範囲、版と権利情報。最終スキーマは #14 の実装で検証する。 |
| review.json | 候別の生成・加工・検証・承認の状態、失敗理由、確認した画像と再生の結果。 |
| contact-sheet | 生成物の比較一覧。全72候の視覚的重複レビューに使用する。 |

失敗した候は候別の失敗として残す。通常の再実行は入力・版・ファイルハッシュが一致する成功済み結果を再利用する。再生成やモデル変更は新しいassetVersionに保存する。未承認の出力で公開対象を置換しない。

## 3候PoCの実行手順

1. サービスの画像生成対応と無料枠を確認し、ジョブのproviderとmodelを確定する。新規生成の場合は3候を一件ずつ生成する。
2. 原本・条件・実測費用の根拠を保存する。既存画像を取り込む場合は、その旨と既存の生成指示の所在を記録する。
3. 透過を確認し、生成りの花・葉・色面を誤って消さずに背景を加工する。中心・余白・寸法を揃える。
4. 同一構図からinitial・completed・transition・idleを制作する。4種を別々の画像生成で作って形を不一致にしない。
5. PNG、透過WebP、アニメーションWebPまたはSpriteの候補を比較する。比較対象を実際に書き出すまで採用形式は仮とする。
6. 候別のハッシュ・メタデータ・manifestを保存し、3候の参照先と4種の欠損を検査する。
7. #14のロード基盤で静止画を先に表示する。選択候のアニメーションを遅延読み込みし、欠損時のcompletedへの復帰を確認する。
8. ブラウザーで透過・質感・開始終了・ループ・アンカー固定・動きの抑制・通信なしの再表示を確認する。実機の測定をブラウザー測定で代用しない。
9. ファイルサイズ、ロード条件、時間、メモリの測定方法と結果を記録し、採用形式を確定する。
10. 採用した条件を72候のジョブへ適用する。全件の欠損・参照・重複とコンタクトシートをレビューし、承認済み一式を同梱対象にする。

## ロード基盤の現在地

確認した `shared/orbit-layout.ts` は仮アートとupcomingSrc・completedSrcの静止画参照を持つ。`app/seasonal-orbit.tsx` はSVGのimage要素でその静止画を描画する。4種のmanifest読み込みとtransition・idleの遅延ロードは、この確認時点では実装されていない。

そのため #14 の実装もPoCの依存作業となる。アプリ起動・候切替で生成APIを呼ばず、保存済み静止画とアニメーションを読み込む構成を維持する。モデルの変更は制作ジョブの変更とし、アプリのロード処理にモデル依存を持ち込まない。

## 検証状態

3候の新規生成API呼び出しと単色背景からの透過加工を実施した。使用モデルはgpt-image-2、1024角、quality low。原本と実際の生成指示をoutput/seasonal-assets/poc-v1へ保存した。秘密値は出力していない。料金は出力分の目安3枚合計$0.018に入力分が加わる。CLIがusageを保存しないため、実請求額は未確認。予算台帳では安全側の予約額として3件合計90円を計上する。全72候展開は未実施。


## OpenAI APIでの初回試行

モデルは `gpt-image-2`、サイズは1024×1024、qualityはlow。公式画像生成ガイドの出力目安は1枚$0.006で、入力テキスト料金が別途かかる。料金根拠は [OpenAI画像生成ガイド](https://developers.openai.com/api/docs/guides/image-generation/index.html) と [料金表](https://developers.openai.com/api/docs/pricing)。円換算と税・為替差の余裕を含めて上限を管理し、見積もりを実請求と混同しない。

本モデルの直接透過出力は使わず、背景を単色マゼンタとして生成し、付属のクロマキー除去ツールでalphaへ加工する。生成指示では被写体のマゼンタを禁止する。輪郭・色かぶり・欠損を確認できるまで採用しない。

初回対象はkou-01。原本の保存先は `output/seasonal-assets/poc-v1/kou-01/original.png`、実行指示は同ディレクトリの `prompt.txt`。実行にはimagegenスキル付属の `scripts/image_gen.py generate` を使用し、独自の画像生成SDK実装は追加しない。


## 3候の加工・保存結果

`public/seasonal-assets/poc-v1/manifest.json` に3候の4種アセットを保存した。全画像は512角、中心アンカーは0.5・0.5。completedは実生成画像の透過加工、initialは最大4つの大きな幾何形へ簡略化した試作、transitionは試作クロスフェード、idleは中心固定の±1.5度の全体回転。部品別のそよぎや最終アートの制作完了ではない。

`scripts/package-seasonal-assets.py` が3候をまとめて加工・検証し、出力先が存在する場合は上書きを拒否する。原本・指示・出力のハッシュ、寸法、alpha範囲、各アニメーションの12フレーム、Spriteのフレーム一致を検査する。

| 候ID | completed PNG bytes | completed WebP bytes | idle WebP bytes | idle Sprite PNG bytes |
|---|---|---|---|---|
| kou-01 | 60470 | 44090 | 521024 | 429586 |
| kou-32 | 78440 | 54668 | 624360 | 559776 |
| kou-54 | 75946 | 50386 | 605450 | 533217 |

上表は今回の実ファイルのbyte数。静止WebPはPNGより小さく、idleはSprite PNGがアニメーションWebPより小さかった。PoCでは簡単に読み込めるPNGとアニメーションWebPを使用する。最終採用は実機でのメモリ・テクスチャ・ロードの比較後に判断する。

`public/seasonal-assets/poc.html` は保存済みmanifestを読む専用検証ページ。アプリのホームとは別であり、#14の本番ロード基盤への統合完了ではない。3候の選択・4種切替・動きを減らす設定・アニメーション欠損時のcompleted表示を検証する。

品質レビューでは、解氷の風帯の追加、蓮の花芯の立体感、楓の余分な小枝、細い陰影が残る。initialの配置も3候で似ている。`review.json` はchanges requiredのまま。画像・形式を採用したことにはせず、全72候の追加生成は保留する。

## 再実行コマンド

生成計画はAPIを呼ばず、入力と予算予約額を表示する。

```sh
python3 scripts/generate-seasonal-assets.py --ids kou-01,kou-32,kou-54 --version draft-v2
python3 scripts/generate-seasonal-assets.py --all --version draft-v2
```

新規生成時だけ `--execute` を付ける。OpenAI SDKの入ったPython環境で実行し、付属imagegen CLIを利用する。今回SDKは `/tmp/sakku-image-deps` に導入した一時依存であり、恒久的なインストールではない。今回の実行環境では `PYTHONPATH=/tmp/sakku-image-deps` を付ける。秘密鍵は `.env.local` または環境変数から読み、CLI出力はログへ転記しない。モデルを変更した場合は料金の再確認まで実行を拒否する。

生成CLIは候別のoriginal.png・prompt.txt・generation.jsonを保存する。プロンプト・条件・ハッシュが同じ成功済み出力は再利用する。新規PoC原本は付属CLIを直接実行して作ったため、wrapperのgeneration.jsonがない。それらをwrapperで上書きせず、新版へ生成する。

背景除去はimagegen付属 `remove_chroma_key.py` を使用し、`--key-color '#FF00FF' --soft-matte --spill-cleanup` で原本からcutout.pngへ書き出す。

```sh
/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/package-seasonal-assets.py --input-root output/seasonal-assets/poc-v1 --output-root public/seasonal-assets/別の出力先
node --test tests/seasonal-assets-poc.test.mjs
/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s tests -p test_seasonal_generator.py
```

出力先を公開承認と扱わず、manifestのstatusとreviewはdraft・pendingのまま保つ。

## 予算管理の実装と制限

`output/seasonal-assets/budget-ledger.json` に累計予約額を保存する。現在の3件は各30円、合計90円の安全側の予約であり、実請求額ではない。SDK内部の最大2回の再試行も考慮し、wrapper側は追加再試行をしない。失敗・中断しても予約を自動で戻さない。ファイルロック中に予算を確認して、API呼び出しの前に予約を保存する。

この保守的な条件では残り72候を一括予約すると累計2,250円となり、上限1,000円で実行を拒否する。実画像の低品質出力料金から算出した見積もりとは異なる。全72候へ進む前に、usageまたは請求の証拠を保存する方法と予約額の妥当性を確定する必要がある。自動的に予算を増やさない。

実画像のブラウザー検証は `tests/seasonal-assets-poc-live.test.mjs` で実施。3候の512角画像を復号し、4状態を表示した。選択候だけのアニメーション要求、選択変更と動きを減らす設定、320pxでの横はみ出しなし、Chrome ImageDecoderによる12フレームと画素変化を確認した。欠損アニメーションからの復帰は別のfixture画面テストで確認した。スクリーンショットは `output/seasonal-assets/poc-v1/live-review.png`。オフラインでのページ再読み込み、iOS・Android、本番ホーム統合、メモリの測定は未検証。

独立レビューで破損PNGの成功扱いを指摘され、署名だけの確認をPillowによる完全復号と1024角の検査へ変更した。生成済み再利用にも同じ検査を適用する。生成制御7件とローダー3件のテストが通過した。Build the Leverの原則に従って再実行可能な生成・加工CLIを残し、Model the Domainの原則に従って候ID別manifestで制作と表示を分離した。


## v2の生成・比較結果

3候を既存の顔なし基準画像一枚ずつを入力して再生成した。modelはgpt-image-2、quality medium。モデルの変更はしていない。候別の `generation.json` に実行時刻、完全な指示、参照パス・ハッシュ、出力ハッシュを保存した。画像生成の実行方式は付属imagegen CLIのedit。基準画像と今回の指示を渡し、新版の静止画を出力した。

比較は [図案比較ページ](../public/seasonal-assets/revision-review.html)。前回PoCを左、新版を右に配置し、背景は生成り、見える範囲の長辺は各306pxに揃えた。基準の顔なし3点も別枠に掲載した。比較画像は `output/seasonal-assets/poc-v2/comparison.png`。

- 東風は主役の風を一面にまとめ、帯の反復をなくした。氷と滴は小さくなった。滴は指示した青より淡く、採用時に確認する。
- 蓮は花弁の幅・高さと重なりを不均等にし、立体花芯と水面を省いた。花に対して浮葉が小さくなった。
- 楓は裂片の長短・くびれの深さを変え、小さい青葉一枚を重ねた。黄色い枝や細い葉脈を省いた。

同じ600角viewBox・固定アンカー・24角枠で、デスクトップと320px幅の円環をブラウザー表示した。320pxではSVGが262pxで、モチーフの長辺は約6.26pxとなる。大きなシルエットは確認できるが、細かな輪郭や重なりの評価には小さすぎる。円環を拡大して識別できたことにはしない。残る69候は仮の点なので、全72候の重なり・景色のレビューは未実施。円環スクリーンショットを同じ出力ディレクトリへ保存した。

ブラウザーで6枚の比較画像と3枚の基準画像を復号し、両円環の3画像・69仮マーカー、同じCSS表示幅、320pxで横はみ出しなし、ページエラーなしを確認した。生成制御の8テストも通過した。画像・形式の独立した承認や本番への公開はしていない。静止画の採否が決まるまで、新版アニメーションと全72候の生成を行わない。

累計の安全側予約額は360円。実請求額はusageが保存されないため未確認。medium1024角の出力料金の目安は1枚$0.053、入力画像と入力テキストは別料金である。[OpenAI画像生成ガイド](https://developers.openai.com/api/docs/guides/image-generation/index.html)、[料金表](https://developers.openai.com/api/docs/pricing)。90円の候別予約は課金結果ではなく、参照入力とSDK内部再試行への余裕を持たせた運用値である。

Prove It Worksの原則に従い、生成した実PNGと実ブラウザーの表示を確認した。比較処理は画像の見かけサイズだけを揃え、モチーフの輪郭や重なりを加工で変更していない。


## C案72候の季節別アクセント（2026-10-12）

A案の形・主役色・副色を参照し、既存の小さな補助色面だけを置き換える。春は桃 `#E73E73`、夏は朱 `#F24B20`、秋は橙 `#F48708`、冬は青 `#155DD8`。前のC案12候から春・冬の色を交換した設定を、全72候に適用する。第3色は既存の補助モチーフまたは小色面を指す。色面や部品を追加しない。

入力は `data/seasonal-color-study-c72.json`。各候のA画像、候別の色替え対象、季節色、構図保持の生成指示を保存する。付属imagegen CLIのedit、gpt-image-2、高品質1024角を使用する。加工後の公開用PNG/WebPは512角・透明背景・見える長辺306px。

```sh
/private/tmp/sakku-imagegen-runtime/bin/python scripts/generate-seasonal-color-study.py --study color-study-c72 --execute --concurrency 3
/private/tmp/sakku-imagegen-runtime/bin/python scripts/update-seasonal-fixed-layout.py --gallery public/seasonal-assets/color-study-c72/manifest.json
```

原本・参照画像・指示・生成条件・ハッシュは `output/seasonal-assets/color-study-c72/`、公開画像とmanifestは `public/seasonal-assets/color-study-c72/` に保存する。夏・秋の設定が一致する4候は成功済みC画像を再利用し、68候を新規生成する。目視確認で見つかった6候を対象に、計7回の追加生成で色替え漏れ・欠落・主役への色の広がりを修正する。差し替え前の画像と生成記録は `review/superseded/` に保存する。前回のC案12候のファイルも保存する。

A案は `gallery.html` と `revision-review.html#filled-preview` を維持し、C案は `c-gallery.html` と `c-fixed.html` に分離する。Cの固定配置はAと同じ72座標を使い、全画像の輪郭に合わせて共通サイズを決める。`color-abc.html` は従来の12候について更新後のCとA/Bを比較する。

今回の生成は利用者の予算制限解除の指示に基づく。実請求額は生成記録からは確定できない。
