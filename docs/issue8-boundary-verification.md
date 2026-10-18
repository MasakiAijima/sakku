# Issue 8 の設定と翻訳の境界検証

2026-10-14 に Node 24 で実行した。外部通信と API キーは使用していない。

修正前の `scripts/test-unit.mjs` は64件中2件が失敗した。設定に `null` を渡すと、422ではなく `TypeError: Cannot read properties of null (reading 'appLanguage')` が発生した。翻訳の通信例外は `InputError` に変換されず、`private provider endpoint detail` という例外本文がそのまま呼び出し元へ渡った。中断も `AbortError` のまま渡った。

修正後の検証では64件すべてが成功した。`tsc --noEmit` も成功した。検証コマンドは次のとおり。

```sh
node scripts/test-unit.mjs
node node_modules/typescript/bin/tsc --noEmit
```

追加した検証の対象は次のとおり。

- 不正な設定本文と言語は422で拒否し、既存行の更新日時を含めて変更しない。
- 2人の設定を個別に保存・再取得できる。旧クライアントの省略値と `null` の表示言語は既存仕様どおり日本語になる。
- `0003_add_app_language.sql` は既存の名前・文体・表現を保持し、日本語の既定値を追加する。
- 翻訳の通信失敗・中断・タイムアウトは詳細を含まない502になる。
- 翻訳の不正入力は422、接続未設定は503になり、外部通信を呼び出さない。
- 英語への翻訳指定を OpenAI 形式の要求本文に送る。応答の3行・語句解説・ニュアンスを検証する。

Type System Discipline に従い、設定の未知の本文を Zod で解析してから保存する。型キャストを削除した。TDD に従い、上記2件の失敗を確認してから実装を変更した。

この検証は SQLite 上の設定永続化と注入した通信関数の結果を確認する。実際の翻訳プロバイダー、画面の切り替え、iPhone Safari の動作は対象外。
