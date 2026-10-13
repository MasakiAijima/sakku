> 採用済みC/C′と正式bundleの配置契約は [seasonal-release.md](seasonal-release.md) を参照。以下のA案配置も比較用に保持する。

# 72候の固定座標

Issue #19 の配置プレビュー。現在の表示データは `public/seasonal-assets/poc-v3/layout.json`。修正12候を含む最新の全72画像を、候IDに対応する保存済み位置へ描画する。本体への反映はこの試作に含まない。

## 保存データ

座標系は700 × 700。`x` と `y` は図案の可視範囲の中心。全72候の座標は初回の `public/seasonal-assets/poc-v2/layout.json` と一致する。

`entries` は `kou-01` から `kou-72` の候名、節気ID、季節、座標、同じ候IDの `sourceId` を持つ。全件が実際の画像案で、仮画像はない。`sources` は現在のギャラリーから画像パス、SHA-256、キャンバス寸法、可視範囲とその中心を保存する。

座標を維持して新しい72輪郭の凸包を検証し、図案同士と半径285の外周に3座標単位以上の余裕を残す共通サイズを計算する。現在の可視長辺は43.29。旧3図案の55.31から縮小し、幅の広い新図案も重ならないようにした。表示時には配置を再計算せず、保存データを読む。円・線・文字は表示せず、図案を切り抜かない。

## 画像差し替え後の更新

NumPyとPillowが使えるPythonで実行する。

```sh
python3 scripts/update-seasonal-fixed-layout.py
```

このスクリプトは現在の `poc-v3/gallery.json` の画像を読む。修正版の別ディレクトリも候IDで対応づける。初回座標の生成に使った `scripts/build-seasonal-layout.py` は履歴用に維持する。

## 表示の検証

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/seasonal-fixed-layout-live.test.mjs
```

テストは全72候の画像ハッシュとギャラリーとの一致、初回からの座標不変、共通サイズ、再ロード後の一致を確認する。ブラウザーでアルファ画素を調べ、重複と円外へのはみ出しがないことも確認する。PCと幅320pxの表示画像を `/tmp/sakku-fixed-layout` に保存する。


## C案72候

C案は `public/seasonal-assets/color-study-c72/manifest.json` の画像を使い、A案とは別の `color-study-c72/layout.json` に同じ72座標を保存する。

```sh
python3 scripts/update-seasonal-fixed-layout.py --gallery public/seasonal-assets/color-study-c72/manifest.json
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/seasonal-c-fixed-layout-live.test.mjs
```

表示URLは `/seasonal-assets/c-fixed.html`。A案の画像・配置データは変更しない。C案の検証も座標、全72画像のハッシュ、重なり、円外へのはみ出し、320px幅での表示を確認する。
