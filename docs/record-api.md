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
画像生成・写真アップロード・削除・暦取得・同期APIは未実装。

画面は01→02→03。Haiku入力欄は設けない。将来の生成応答はcandidates:[{title:string,lines:[string,string,string]}]の3候補として検証する。現在の503に対して架空の候補へフォールバックしない。候補履歴の保存や、本番生成の応答は未実装。

## 追加した基盤API
GET /api/settings、PUT /api/settings：本人の名前・style・expression。
POST /api/photos：multipartのphoto。縮小した写真をアップロードしid・urlを返す。
GET /api/photos/:id：本人の写真のみ返す。他人は404。Cache-Controlはprivate,no-store。
記録にphotoIdを追加。省略更新は保持、空文字は添付解除。他人のphotoIdは拒否。
POST /api/haiku：sceneText、requestKey(UUID)、任意refine・previousHaiku。本人設定も入力に含む。
鍵／モデルなしは503。成功済み同一requestKeyの再送は保持結果を返し、異なる入力なら409。
実APIコードは実装済みだが本番疎通は未確認。金額計測とモデル採用は設定後に検証する。
