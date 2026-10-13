# C′案72候

C′は候が訪れる前の状態を表す。C案の差し色パーツだけを残し、主役・他の補助モチーフを透明にする。AIによる再描画は行わず、利用者が承認した既存画像の抽出で作成した。

PNGとWebPは `public/seasonal-assets/color-study-cprime72/kou-01/completed.png` から全72候を保存する。候ID、元C画像とハッシュ、対象パーツ、実測の可視範囲を同ディレクトリのmanifest.jsonに記録する。抽出条件は `data/seasonal-cprime-extraction.json`、再実行は `scripts/extract-seasonal-cprime.py`。NumPyとPillowを使用する。季節色の色域、候ごとの領域、小さな色にじみの除去、印刷むらの穴埋めを適用する。残した画素のRGBAはCと同一である。

512角のキャンバスを維持し、小さなパーツを拡大・中央寄せしない。固定配置の座標と、CのvisibleCenter・visibleLongEdge・commonVisibleLongEdgeを引き継ぐ。C′の実測範囲はprecursorVisibleBoundsに分けて保存する。この区別により、C′とCの切り替えでパーツの場所がずれない。Model the Domainの方針で、候別の抽出条件を候IDの表として保存した。

- `/seasonal-assets/cprime-gallery.html`: C′、C、横並び比較、季節別・検索・拡大
- `/seasonal-assets/cprime-fixed.html`: 同じ72座標でC′とCを切り替え

```sh
python3 scripts/extract-seasonal-cprime.py
python3 tests/seasonal-cprime-artifacts.py
node tests/seasonal-cprime-live.test.mjs
```

検証結果は全72候の非空透過画像、残存画素の一致、C画像ハッシュ不変、固定配置の変換一致。Chromeで72画像の復号、144画像の比較、各季節18候、検索・拡大、320px幅の表示を確認した。資料は `output/seasonal-assets/color-study-cprime72/review/` に保存する。


## 成長アニメーションの試作

`/seasonal-assets/cprime-growth.html` でC′からCへの順次表示を確認できる。初期値は50候到来の想定で、到来済み候数を0〜72で変更できる。候01の立春から順に開始する。未来の候はC′のまま。標準は1候720ms、開始間隔45ms。ゆっくりは両方を2倍にする。

差し色パーツの可視範囲の中心から、揺らぐ有機的なマスクを広げてCを見せる。C′と画像全体の位置・倍率は動かさない。完成時はマスクとC′の重ね表示を外し、元のCだけを表示する。再生・一時停止・再開・完成状態・C′に戻す操作を用意した。動きを減らす設定では直接完成状態を表示する。

`tests/seasonal-growth-live.test.mjs` は実ブラウザーで3候の途中・停止・完成と残り69候の保持、全72候の開始順、0候・50候、スマートフォン幅、動きを減らす設定を検証する。途中画像と完成画像の実画素変化も確認した。検証資料は `output/seasonal-assets/seasonal-growth/review/` に保存する。
