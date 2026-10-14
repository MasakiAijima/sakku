# Seasonal Orbit — 状態と固定アンカー

`shared/seasonal-orbit.ts`は季節年の72候を計算し、`app/seasonal-orbit.tsx`がホーム画面に表示する。`lib/orbit-calendar.ts`は`data/calendar/current.json`が指す採用版をビルド時に収集した版から選ぶ。候名・読み・実日付は採用データに由来し、JSTの候入りで進行する。現在のホームは承認済みc-v2のC/C′アートを使用する。表示・オフラインの正本は `docs/seasonal-home.md`、受入状況は `docs/seasonal-acceptance.md`。

## 入力契約

`seasonalOrbit({calendar, year, now})`の`calendar`は外部データとして検証する。

- `version`は候入り日データの版。年次日付を訂正する場合は、候名のマスター版とは別に更新する。成功時の`calendarVersion`に保持する。
- `timeZone`は候入り日を定義する明示的な時間帯。このアダプターは`Asia/Tokyo`と`UTC`のみ対応する。`Asia/Tokyo`はサマータイム終了後の1952年以降のデータに限る。他の時間帯とそれ以前の東京の暦は`unavailable`。画面はIssue #2/#11で採用した暦の時間帯を渡す。端末や日記設定の時間帯で置き換えない。日付だけの候入りデータを別時間帯へ変換しない。
- `master.version`は採用マスターの版。`risshunId`は最初の候のID。
- `master.kou`は72件。`id`は一意、`order`は1〜72。`sekkiId`で24節気を識別し、連続する3候の`position`を1〜3とする。
- `years`の各行は`year`、`masterVersion`、72件の`entries`、`nextRisshunDate`を持つ。`entries`は`kouId`と実際の候入り日`date`（YYYY-MM-DD）の組。
- `year`は立春が属する西暦。最初の候入り日は当年2月、`nextRisshunDate`は翌年2月。実日付の正しさと出典は暦提供側の責任で、計算で天文日付を推定しない。

配列順は問わない。マスター順に並べ、各IDの実日付を結び付ける。72件、節気内順序、一意性、日付の有効性、厳密な増加、版の一致を検証する。翌年のデータもある場合は、終了境界が翌年の立春と一致する必要がある。翌年全体がなくても明示された終了境界で選択年を計算できる。

## 出力と利用

成功は`kind: 'ready'`と72枠を返す。各枠は開始を含み終了を含まない。`upcoming`は未完成、`current`と`visited`は完成。haikuや記録件数を入力に含めないため、詠んだかどうかで進行は変わらない。過去年はすべて訪問済み、未来年はすべて未到来になる。

失敗は`kind: 'unavailable'`と理由を返し、枠を返さない。日付・版・年が欠けても5日刻みや前年の暦で補わない。画面側は暦未利用の状態を表示する。

`seasonalYear({calendar, now})`は供給済みの年境界から現在の季節年を求める。立春前は前年を選ぶ。該当する暦がない、または複数年が重なる場合は`null`。端末の西暦年だけで補完しない。保存済みの記録日は変更しない。

`shared/seasonal-orbit-browser.ts`の`watchSeasonalOrbit`は、指定年の結果を開始時と`pageshow`・`focus`・`visibilitychange`時に発行する。対応時間帯では現地日付が逆行しないため、次の候入り日の開始時刻を二分探索で求め、タイマーでも再評価する。長い待機はブラウザーのタイマー上限で区切る。バックグラウンドで遅延したタイマーは復帰時に現在時刻で再評価する。返された関数でタイマーと購読を解除する。現在年を追従する画面は、復帰時に`seasonalYear`を再解決し、選択年が変われば購読を作り直す。

## 検証

`npm test`は実在の暦ではないと明記した合成fixtureを使う。72枠の順序、立春前後、候入りのミリ秒境界、閏日、年越し、端末時間帯からの独立性、異なる現在時刻、欠損・重複・不正版・矛盾した翌年境界、遠い未来、非対応時間帯と歴史的な東京の暦の拒否、ブラウザー復帰と購読解除を検証する。採用日付の出典照合は`tests/calendar.test.mjs`で別途検証する。


## Issue #13 表示契約

ホームは `viewBox="0 0 700 700"` と、採用manifestの72固定座標を使用する。`shared/seasonal-art-runtime.js` がPNG静止画とマスクによる有機的成長を描画し、Reactと公開オフライン画面で共有する。完成数・年・選択によって座標を変えない。通常の重なり順はmanifestの規定順で、選択候だけ最後へ移す。

初期=C′、完成=C、idle=静止C。成長は720ms、開始間隔45ms。初回・年変更は到来済みの候を古い順に成長させ、同一年は新たに到来した候だけを再生する。非表示・Reduced Motionでは直ちに完成表示へ戻す。暦判定は記録保存と独立している。

画像と同じ候IDを持つ一覧で小画面の選択を補う。SVGからは矢印、Home/End、Enter/Spaceで操作でき、候名・読み・節気・状態を読み上げ名へ渡す。現在候にはaria-currentを付ける。アプリのホーム以外は非表示。候名と読みは採用データを保持し、日英で説明・操作ラベルを切り替える。

「現在の季節年」は実立春境界とブラウザー復帰で翌年へ追従し、明示的に選んだ年は固定する。未対応年・欠損は利用不可を表示する。

旧 `shared/orbit-layout.ts` と `tests/orbit-layout.test.mjs` は円周5°配置の試作契約と検証を保持する。現在のホーム描画の正本ではない。ホームの検証は `tests/seasonal-home-live.test.mjs`、オフラインは `tests/seasonal-home-offline.test.mjs`。旧 `tests/orbit-screen.test.mjs` はホーム試験へ委譲する。

実機iOS/Android・実スクリーンリーダー・負荷の測定は、Chrome上の幅検証と区別して#13〜#16に残す。
