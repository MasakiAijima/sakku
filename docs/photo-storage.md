# 写真保存API

写真は認証された本人だけが一覧・取得・削除できる。所有者IDはクライアントから受け取らない。
画面の写真入力と縮小処理は既存のまま。今回の変更は保存API、保存状態、記録との参照制約に限る。

## アップロードと検証

`POST /api/photos` はmultipartの `photo` にJPEG、PNG、WebPの静止画を受け取る。
ファイルは1,000,000バイト以内、縦横それぞれ1〜1000px。multipart本文は1,100,000バイト以内。
実際のバイトから形式と寸法を判断する。拡張子や送信されたMIME typeは判断に使わない。
PNGのCRC、IHDRの合法値、チャンク長と順序、JPEGのセグメント・SOF・SOS・終端、WebPのRIFF長・チャンク・寸法を検証する。
APNG、アニメーションWebP、対応していないJPEG符号化は拒否する。
既存のブラウザ入力はcanvasでJPEGへ再エンコードしてから送信するため、元ファイルのメタデータを引き継がない。
直接APIへ送信したファイルは検証したバイトをそのまま保存し、EXIFなどのメタデータ除去は行わない。
この検証は構造と寸法の検証。圧縮データの完全な画素デコードや画像再エンコードは実行しない。
既存の写真は移行時に再検証しない。

成功は201で `{photo:{id,url}}` を返す。URLは `/api/photos/:id`。
multipart不正は400、形式・寸法・ファイルサイズ不正は422、リクエスト本文超過は413。
保存処理の失敗は内部情報を含まない503。

## 所有者の一覧

`GET /api/photos?limit=50` は `{photos,nextCursor}` を返す。
limitは1〜50、既定50。次ページのcursorにnextCursorをURLエンコードして渡す。
各写真は `id,status,createdAt,size,mimeType,unused` を持つ。readyだけが `url` を持つ。
object_keyやowner_idは返さない。cursorは読み取り位置であり権限ではない。
一覧はcreatedAtとidの昇順。新しい挿入を含む厳密なスナップショットではない。
`unused` は保存済み記録が参照していないという意味。別のブラウザやオフライン下書きが未使用という意味ではない。

## 状態と削除

D1のattachmentsがR2書き込みの状態を保持する。各アップロードは新しいUUIDと変更できないobject_keyを使う。

| 状態 | 保存状況 | APIでの扱い |
| --- | --- | --- |
| uploading | R2書き込みの完了、または公開の確認が終わっていない | 一覧のみ。取得は404、削除は409 |
| ready | R2 putの成功後、D1で公開済み | 取得と記録への新しい添付が可能 |
| deleting | 書き込みは終了し、明示削除か公開失敗後の削除を開始済み | 取得・新しい添付不可。削除の再試行が可能 |

アップロードはD1にuploadingを作ってから一度だけR2 putを行う。成功後に条件付きでreadyへ進める。
putが失敗した場合、書き込みが遅れて完了する可能性を消せないためuploadingとキーを保持する。
put成功後に公開処理が失敗した場合、uploadingからdeletingを確認できたときだけR2削除を試す。
削除が失敗しても元の公開失敗を返す。すでにreadyになっている写真はこの補償処理で削除しない。

`DELETE /api/photos/:id` は本人のreadyかdeletingだけが対象。
保存済み記録からの参照がないreadyを一度の条件付き更新でdeletingにする。
R2 deleteの成功を確認してからD1行を削除する。存在しないR2オブジェクトの削除も成功。
完了は204。R2削除またはD1行の削除が失敗した場合は202で `{photo:{id,status:"deleting"},retryable:true}`。
再試行は同じDELETE。完了済みのIDは404。他人のIDも404。
参照中の写真やuploadingは409。削除開始を確認できない保存障害は503。

DBのトリガーは記録追加・添付変更時に同じ所有者のready写真を要求する。
写真の状態変更・行削除もすべての記録参照を確認する。
新しい行で既存IDやobject_keyを再利用できない。移行前から同じキーを共有する写真は削除開始を拒否する。既存の所有者不一致も削除を防ぐ。
記録への添付と写真削除のどちらが先でも、参照中の写真を物理削除する状態にならない。
既存の壊れた参照は移行で変更しない。photoIdを変更しない記録編集は引き続き可能。

## 削除の再試行

`POST /api/photos/recover?limit=50` は本人のdeletingを順に再試行する。
`{outcomes:[{id,deleted}],nextCursor,unresolvedUploading}` を返す。
limitとcursorは一覧と同じ形式。失敗した写真がある場合も、nextCursorで後続を処理できる。
最後のページの後、先頭から再実行すると前の失敗を再試行できる。
readyは明示DELETEなしに削除しない。uploadingは自動昇格・自動削除しない。
古さだけを理由に写真を削除しない。画面での添付解除・置換も写真の削除許可にはならない。
変更系APIはOriginが存在する場合、同じOriginだけを許可する。

## 未確定uploadingの運用手順

1. 新しい写真アップロードを停止する。
2. 古いアップローダーのすべてのバージョンとバックグラウンド処理を停止または完了させる。
3. ストレージサービスの保証により、受け付け済みの古いputが今後完了しないことを確認する。
4. 所有者とIDを限定し、D1のuploadingとR2の実物を照合する。
5. 書き込み停止を証明できた場合だけ、再検証した実物の公開か、許可された放棄写真の削除と行削除を実施する。

Worker停止や一定時間の待機だけでは、リモートputの終了を証明できない。
終了を証明できないuploadingは保持し、未解決として記録する。
移行前にD1行を持たないR2オブジェクトの所有者は復元できないため、別の監査が必要。
本番での移行・削除・保管期限・アカウント削除は今回の変更に含まれない。

## ローカルでの確認

Node 24で `node scripts/test-unit.mjs` と `node node_modules/typescript/bin/tsc --noEmit` を実行する。
写真テストは実SQLiteとメモリ内R2代替を使い、保存・削除の失敗と参照順序を確認する。
小さな実画像fixtureはsharp 0.35.4で生成済み。sharpは本番の検証処理には使わない。

ローカルD1にすべての移行を適用してから、ビルドしたWorkerを起動する。

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.jsonc
node scripts/run-framework.mjs build
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --port 3000 --inspector-port 0
```

別のターミナルで `node scripts/verify-photo-api.mjs` を実行する。
`PHOTO_API_BASE` はローカルHTTPのloopback URLだけを指定できる。
ビルドしたローカルWorkerに対して、スクリプトは検証用の本人ヘッダーを渡す。
Viteの開発サーバーを使う場合は `PHOTO_API_COOKIE=__sites_local_auth=1` を指定する。
このcookie認証はViteの開発サーバーだけが対応する。
このスクリプトは実HTTP経由でアップロード、実物取得、一覧、参照中の削除拒否、写真置換、添付解除後の削除を確認する。
置換後も古い写真を取得できることと、明示DELETE後だけ取得できなくなることを確認する。
APIレスポンスの差し替えは使わない。スクリプト自身が作った写真だけを最後に削除する。
記録APIにDELETEがないため、添付解除済みの検証記録を1件残し、そのIDを表示する。
本番D1・R2の動作確認はデプロイ前の別の確認事項。

## 複数写真と移行順序

既存の`0005_record_photo_ids.sql`と`0006_haiku_parameters.sql`はファイル名と内容を保持しています。新しい`0007_photo_lifecycle.sql`をその後に適用します。既存DBで0006まで適用済みの場合は、未適用の0007だけを適用できます。新規DBは0000から0007まで順に適用します。

複数写真の保存、参照確認、削除保護は先頭だけでなく`photo_ids_json`内の全写真を対象にします。移行前からある不正参照は保持しますが、新しい写真の追加は本人のready写真に限ります。既存の写真ID配列と生成パラメータの設定は移行後も保持します。

検証では独立したDBに既存の0000から0006までの移行履歴とダミーの写真・設定を作り、未適用の0007だけを実行して保持を確認します。利用者の作業用DBは今回変更していません。
