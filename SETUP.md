# /editor を動かすための外部設定手順

README.md の追記部分（本人が更新できる仕組み）のうち、コード側の実装は完了している。
残っているのはGoogle/GitHub側の手動設定のみ。ここに書いてあることを順番にやれば動く。

作業できるタイミングでこのファイルの上から順に進めればOK。終わったらチェックを付ける。

---

## 0. 前提

- リポジトリ: `haruto-67/musashi_profile`（public）
- Pages公開ルート: `docs/`（カスタムドメイン `www.musashi-drums.com` 設定済み）
- Apps Script用のパスワード（`HMAC_SECRET`）: **このセットアップを依頼したチャットのメッセージに直接貼ってある。** このファイルには書かない（publicリポジトリにコミットされるため）。まだ控えていなければ、そのメッセージを見て別途メモしておくこと（LINEで本人に送る運用は README.md の運用の取り決め通り）。

## 1. Google Apps Script プロジェクトを作る

- [ ] https://script.google.com を開き、「新しいプロジェクト」を作成
- [ ] プロジェクト名は分かればなんでもいい（例: `musashi-profile-editor`）
- [ ] エディタ左の `appsscript.json` を表示する（表示されていなければ、歯車アイコンの「プロジェクトの設定」→「"appsscript.json" マニフェスト ファイルをエディタで表示する」にチェック）
- [ ] このリポジトリの `appsscript/appsscript.json` の中身をそのままコピーして貼り付け、保存
- [ ] `Code.gs`（デフォルトで存在するファイル）の中身を全部消して、このリポジトリの `appsscript/Code.gs` の中身をそのままコピーして貼り付け、保存

## 2. スクリプトプロパティを設定する

エディタ左の歯車アイコン →「プロジェクトの設定」→ 下の方の「スクリプト プロパティ」→「スクリプト プロパティを追加」で、以下を1つずつ追加する。

| プロパティ | 値 |
|---|---|
| `HMAC_SECRET` | チャットのメッセージに貼ってある文字列をそのまま |
| `GITHUB_REPO` | `haruto-67/musashi_profile` |
| `GITHUB_TOKEN` | 手順3で作る fine-grained PAT（まだ無ければ後で追加でOK） |

`LAST_TS` や `*_WINDOW` / `*_COUNT` はコードが自動で作るので、手で追加しなくていい。

- [ ] `HMAC_SECRET` を設定した
- [ ] `GITHUB_REPO` を設定した
- [ ] `GITHUB_TOKEN` を設定した（手順3の後でOK）

## 3. GitHub の fine-grained PAT を発行する

GitHub側の仕様上、これはAPIから自動生成できない。手動でやる必要がある。

- [ ] https://github.com/settings/personal-access-tokens/new を開く（要ログイン: haruto-67）
- [ ] Token name: 分かればなんでもいい（例: `musashi-profile-editor`）
- [ ] Expiration: 最長（1年）を選ぶ。**期限日をカレンダーに登録しておくこと**（切れると無言で動かなくなる。README.md H節参照）
- [ ] Repository access: 「Only select repositories」→ `musashi_profile` を選ぶ
- [ ] Permissions → Repository permissions → **Contents: Read and write** のみ ON にする（他は全部 No access のまま）
- [ ] 「Generate token」を押して、表示されたトークン（`github_pat_...`）をコピー
- [ ] Apps Script のスクリプトプロパティ `GITHUB_TOKEN` に貼り付ける（**このリポジトリのどのファイルにも書かないこと**）

## 4. ウェブアプリとしてデプロイする

- [ ] Apps Script エディタ右上の「デプロイ」→「新しいデプロイ」
- [ ] 種類の選択で「ウェブアプリ」を選ぶ
- [ ] 「次のユーザーとして実行」: **自分（オーナー）**
- [ ] 「アクセスできるユーザー」: **全員**
- [ ] 「デプロイ」を押す。初回は Google の権限確認画面が出るので許可する
- [ ] 発行された「ウェブアプリのURL」（`https://script.google.com/macros/s/.../exec` の形）をコピー

## 5. エディタ側にURLを設定する

- [ ] `docs/editor/editor.js` の先頭付近、`var APPS_SCRIPT_URL = "REPLACE_WITH_DEPLOYED_APPS_SCRIPT_URL";` を、手順4でコピーしたURLに書き換える
- [ ] コミットして push する

```js
var APPS_SCRIPT_URL = "https://script.google.com/macros/s/xxxxxxxx/exec";
```

**コードを直したら「新しいデプロイ」ではなく、既存デプロイを編集して新バージョンを配備すること。** URLを変えずに更新できる（README.md F節「つまずきやすい点」参照）。

## 6. 通しで動作確認する

`https://www.musashi-drums.com/editor/` を開いて、README.md の J節チェックリストを一通り確認する。

- [ ] 間違ったパスワードで送ったとき、画面にエラーが出る（GitHubには何も起きない）
- [ ] 正しいパスワードで入れる
- [ ] パスワードを10回間違えたあと、正しいパスワードでも1時間は入れない
- [ ] 1回間違えた直後に正しく入力し直すと、そのまま入れる
- [ ] 文章を編集して確定 → 1分以内に `https://www.musashi-drums.com/` に反映される
- [ ] 写真を差し替えて確定 → `docs/images/` に新しいファイルが増えている（GitHubのコミット履歴で確認できる）
- [ ] スマホで撮った縦写真が、縦のまま正しい向きで表示される
- [ ] バンド・サポート・ライブの追加/削除/並べ替えができる
- [ ] Apps Script を一時的に止める（デプロイを無効化する等）と、`www.musashi-drums.com` 自体は通常どおり表示される
- [ ] `docs/CNAME` と `docs/.nojekyll` が消えていない（Actionsのコミット履歴で確認）

## うまく動かないとき

- **「ログイン画面のHTMLが返ってJSONパースで落ちる」** → デプロイの「アクセスできるユーザー」が「全員」になっているか確認
- **「コードを直したのに反映されない」** → 新しいデプロイではなく、既存デプロイの編集で新バージョンを配備したか確認
- **`repository_dispatch` は来るのに `docs/content.json` が更新されない** → GitHub の Actions タブでワークフロー `content update` のログを見る。スキーマ検証（`.github/scripts/validate-and-write.js`）で弾かれている可能性が高い
- **画像だけアップロードされない** → `GITHUB_TOKEN` の権限が `Contents: Read and write` になっているか、期限切れになっていないか確認
