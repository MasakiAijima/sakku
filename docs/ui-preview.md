# UI確認版をビルドする

LLM・DB・ログインを使わず、ブラウザからSakkuの画面を操作できます。記録・設定・写真は、そのブラウザのlocalStorageに保存します。生成候補と翻訳は固定サンプルです。実際の情景に合わせた生成は行いません。

## ローカルで開く

Node.js 24と、ロックファイルに従ってインストールした依存パッケージを使います。

```sh
pnpm build:preview
pnpm serve:preview
```

`http://127.0.0.1:4173/sakku/`を開きます。別のパスへ配置する場合は、ビルド時と起動時に同じ`PREVIEW_BASE_PATH`を指定します。

```sh
PREVIEW_BASE_PATH=/sakku-preview/ pnpm build:preview
PREVIEW_BASE_PATH=/sakku-preview/ pnpm serve:preview
```

## スマートフォンで確認する

配置後のHTTPS URLをSafariやChromeで開き、次の操作を確認します。

1. OrbitとHaikuの表示を切り替え、候や記録を選びます。
2. Haikuカードをタップし、翻訳と情景を表示します。
3. ＋から情景を書き、写真を選択します。
4. 固定の3候補からHaikuを選び、記録します。
5. ページを再読み込みし、保存した記録・写真を開きます。
6. 設定で名前や表示言語を変更します。
7. 「デモをリセット」でサンプルデータに戻します。

保存したデータは別の端末やブラウザには同期しません。ブラウザのデータ削除や容量制限で失われます。写真を多く選ぶと保存容量を超える場合があります。リセットはこのデモの保存データだけを消します。

## Actionsの成果物を取得する

`Static UI preview`ワークフローはmain、確認版ブランチへのpush、PR、手動実行で動きます。型検査、静的ビルド、ブラウザでのモバイル幅の操作検証を実行します。成功後の`ui-preview-site`が公開対象、`ui-preview-screenshots`が画面確認用です。生成や保存を外部APIへ送信しないことも検査します。

利用者がsakkuを公開リポジトリへ変更した後、GitHub Actions方式のPagesを有効化しました。公開先は`https://masakiaijima.github.io/sakku/`です。Actions変数`UI_PREVIEW_PAGES=true`で、mainと確認版ブランチからの配置を有効にします。PRではビルドと検証だけを実行します。`UI_PREVIEW_BASE_PATH`の既定値は`/sakku/`です。

## UIのコピーを更新する

`preview/ui/`と`preview/screen.js`は、2026-10-17の作業中UIを確認版として分けたコピーです。既存サーバーアプリの画面とAPIは変更しません。共通の暦・季節描画・採用済み素材は既存ファイルを参照します。

画面変更を取り込む際は、このコピーを更新し、プレビュー用の画像URL処理とService Worker登録の無効化を維持します。`pnpm build:preview`と`node tests/preview.test.mjs`で再確認します。Playwrightを別の場所へインストールした場合は、`PLAYWRIGHT_MODULE`にその`index.mjs`の絶対パスを指定します。

公開物は`scripts/build-preview.mjs`で選別します。画面、暦、現在採用している4種類の季節画像だけを含め、サーバーコード、環境設定、制作履歴、個人データをコピーしません。UI確認版ではService Workerによるオフライン保存を行いません。

自動検証はモバイル幅のブラウザ操作です。実機Safariの写真権限、キーボード、画面回転、VoiceOver、共有先アプリの確認は別に行います。
