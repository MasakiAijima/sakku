# 記録APIの契約
全操作でサーバーが認証された本人を取得する。クライアントは所有者IDを送らない。
現在のSites認証が必要。任意のBearerトークンを送れば使えるAPIではない。
非公開範囲を保ち、モバイルの認証・CORS対応を未確認で追加しない。

## 一覧
GET /api/records?from=2026-01-01&to=2027-01-01&limit=100
fromは含む、toは含まない。有効なYYYY-MM-DD。両方とも省略可能。
limitは1〜100、初期値100。次ページは返されたnextCursorをcursorにURLエンコードして渡す。
次ページでも同じfrom/toを渡す。nextCursorがnullなら最後。
recordsの形式はshared/contracts.tsのRecordView。owner_id・create_keyは返さない。
カーソルは継続位置のみで権限ではない。全ページをサーバーの本人IDで絞る。

## 作成・更新
POST /api/records: CreateRecordInput。
PATCH /api/records/:id: UpdateRecordInput。
GET /api/records/:id: {record: RecordView}。
sceneTextとhaikuText、recordDate、statusは必須。completedは空白でない本文と3行のhaikuが必要。
eventText・emotionTextは任意の補助メモ（各5,000文字以内）。本文を生成・置換しない。
補助メモだけの保存はdraftとして可能。completedにはできない。
作成時に省略した補助メモは空文字。更新時の省略は既存値を維持し、空文字は明示削除。
createKeyはUUIDで同じ作成の再送を識別。内容を変えて再送した場合は409。
revisionが古ければ409。他人の記録・存在しない記録は404。未認証401。
入力検証422、入力JSON不正400、Content-Type不正415、過大入力413。
API応答はprivate,no-store。例外の内部情報を返さない。

## 生成
POST /api/haikuは現在503 AI_NOT_CONFIGURED。生成済みとは扱わない。
画像生成・暦取得・同期APIは未実装。

画面は01→02→03。Haiku入力欄は設けない。将来の生成応答はcandidates:[{title:string,lines:[string,string,string]}]の3候補として検証する。現在の503に対して架空の候補へフォールバックしない。候補履歴の保存や、本番生成の応答は未実装。

## 追加した基盤API
GET /api/settings、PUT /api/settings：本人の名前・style・expression・appLanguage・parameters。
parametersはjuxtaposition・cut_strength・ambiguity・concretenessの0〜4整数。本人別に永続保存し、初期値は順に2・2・2・3。PUTでparametersを省略した旧クライアントは保存済みの値を保持する。不正値は422で拒否する。
POST /api/photos：multipartのphoto。1MB以内、縦横1000px以内の静止JPEG・PNG・WebPを構造検証しid・urlを返す。
GET /api/photosは本人の写真を状態付きでページ取得し、DELETE /api/photos/:idは未参照の写真を明示削除する。POST /api/photos/recoverはdeletingの写真のみを再試行し、uploadingは保留する。
先頭写真とphotoIdsの全写真に参照保護を適用する。新規添付には本人のready写真が必要で、二枚目以降も削除開始との競合をDBトリガーで防ぐ。既知の参照競合のみ409を返す。既存の不正参照は変更せず、同じ写真の編集を許可する。
GET /api/photos/:id：本人の写真のみ返す。他人は404。Cache-Controlはprivate,no-store。
記録のphotoIdsは表示順のUUID配列。最大12枚で重複不可。全写真を本人の所有で検証する。
応答のphoto_idsは順序を保つ配列、photo_idは先頭のID、写真なしなら空文字。DB用のphoto_ids_jsonは返さない。
更新でphotoIdsとphotoIdを両方省略すると全写真を保持。photoIds: []で全写真を解除する。
旧photoIdも受け付ける。同じ先頭IDなら残りの写真も保持し、別IDなら1枚に置き換え、空文字なら全解除する。
両方指定した場合はphotoIdがphotoIdsの先頭、空配列なら空文字と一致する必要がある。
同一createKeyの再送では写真の順序も同じ内容として検証する。
POST /api/haiku：sceneText、requestKey(UUID)、任意refine・previousHaiku・context・seasonal_context・parameters。contextとseasonal_contextは各2000文字以内。
生成にはSakku Haiku Generation Prompt v0.3を使う。parametersはjuxtaposition、cut_strength、ambiguity、concretenessの各0〜4の整数。省略した項目は本人の保存設定を採用し、明示した値は変更しない。不正な値は422で拒否する。
設定画面から4条件を編集できる。「初期値に戻す」はフォームのみを変更し、「設定を保存」で確定する。生成画面は保存済みの条件を明示して送る。設定保存後の生成は新しいrequestKeyを使う。
本人設定は補助的な文脈として扱い、v0.3や数値条件を上書きしない。季節文脈がなければ補完しない。情景文・文脈・確定した数値条件とプロンプト版を生成履歴へ保存する。
画面の選択・保存契約を維持するため、応答は従来の見出し付き3候補JSONとし、各候補の本文にv0.3を適用する。本文は英語3行とし、説明や数値条件を含めない。
鍵／モデルなしは503。成功済み同一requestKeyの再送は保持結果を返し、異なる入力なら409。
実APIコードは実装済みだが本番疎通は未確認。金額計測とモデル採用は設定後に検証する。
