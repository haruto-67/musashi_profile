# /editor の外部設定（完了済み・リファレンス）

**2026-09-07 にセットアップ完了。** 以下は実際にやった手順の記録。再デプロイやトラブル対応の際に参照する。

## 0. 前提・現在の状態

- リポジトリ: `haruto-67/musashi_profile`（public）
- Pages公開ルート: `docs/`（カスタムドメイン `www.musashi-drums.com` 設定済み）
- Apps Script アカウント: `haruto.hym.67@gmail.com`（**MCPのGoogleドライブコネクタとは別アカウント**）
- Apps Script プロジェクト: `appsscript/.clasp.json` の `scriptId` を参照。ローカルでは `cd appsscript && npx @google/clasp open` で開ける（要 `clasp login` 済み）
- デプロイ済みウェブアプリURL: `docs/editor/editor.js` の `APPS_SCRIPT_URL` に設定済み
- スクリプトプロパティ（`HMAC_SECRET` / `GITHUB_REPO` / `GITHUB_TOKEN`）: 設定済み。値はここには書かない（publicリポジトリのため）
- 実機で `auth` / `uploadImage` / `publish` の一連の流れを確認済み（README.md I節・J節参照）

## やったことの記録

### 1. Apps Script プロジェクトの作成・コード配置（`clasp` 使用）

Web UIで手動コピペする代わりに、Google公式CLI「clasp」でプロジェクト作成〜コード配置〜デプロイまでを自動化した。

```bash
npx @google/clasp login          # ブラウザでGoogle認証（このMac本体でのみ完結する）
cd appsscript
npx @google/clasp create --type webapp --title "musashi-profile-editor"
# → scriptId が発行され appsscript/.clasp.json ができる
npx @google/clasp push -f        # Code.gs / appsscript.json をアップロード
```

**つまずいた点：`clasp login` のブラウザは、コマンドを実行しているのと同じマシンで開く必要がある。** ログインの最後に `http://localhost:<port>/...` へリダイレクトされるが、これは「今それを開いている端末自身」を指すため、スマホなど別端末で開くと繋がらない。

**つまずいた点：Node の DNS 解決順。** このMacでは `localhost` がIPv6優先で解決され、`clasp login` の待受サーバーがIPv4からの接続を受け付けない状態になったことがあった。`NODE_OPTIONS="--dns-result-order=ipv4first"` を付けて再実行して解決した。

### 2. スクリプトプロパティの設定

Apps Script エディタ（`clasp open` で開ける）→ 歯車アイコン →「プロジェクトの設定」→「スクリプト プロパティ」で手動設定（ここはAPIから自動化できない）。

| プロパティ | 中身 |
|---|---|
| `HMAC_SECRET` | チャットで生成して渡した強いランダム値 |
| `GITHUB_REPO` | `haruto-67/musashi_profile` |
| `GITHUB_TOKEN` | 手順3のfine-grained PAT |

### 3. GitHub fine-grained PAT の発行

https://github.com/settings/personal-access-tokens/new から手動発行（GitHub側にAPIが無いため自動化不可）。

- Repository access: `musashi_profile` のみ
- Permissions: **Contents: Read and write** のみ
- Expiration: 最長（1年）。**期限日をカレンダーに登録しておくこと**（切れると無言で動かなくなる。README.md H節参照）

### 4. デプロイ（ここで見つかった問題）

最初 `npx @google/clasp deploy` でデプロイしたが、**`clasp deploy`（Apps Script API経由）で作ったデプロイは「アクセスできるユーザー：全員」が正しく反映されず**、未ログインのリクエストに対して「アクセス権が必要です」というDriveの共有リクエスト画面が返ってきた。

**対処：Apps Script エディタの Web UI から手動で「デプロイ」→「新しいデプロイ」を実行し直した。** 種類「ウェブアプリ」、実行ユーザー「自分」、アクセス「全員」を選ぶと正しく公開された。CLIだけで完結させようとせず、最終的な公開設定はUIで確認するのが確実。

コードを修正した後の再デプロイは `clasp push` → `clasp deploy -i <既存のdeploymentId>` で、URLを変えずに新バージョンを配備できる（これはAPI経由でも問題なく機能した。動かなかったのは「アクセスできるユーザー」の設定だけ）。

### 5. 実機テストで見つけたバグ（修正済み）

`auth`（空データ）の署名検証は最初から通ったが、日本語を含む `publish` のペイロードだけ `bad_signature` になった。原因と修正はREADME.md のE節末尾を参照（`Utilities.computeHmacSha256Signature` に渡す文字列はUTF-8バイト列に明示変換する必要があった）。

## 今後の運用

### パスワード（HMAC_SECRET）を変更したいとき

1. Apps Script のスクリプトプロパティで `HMAC_SECRET` を新しい値に変更
2. 本人にLINEで新しいパスワードを送る（README.md 運用の取り決め通り）

### コードを直したとき

```bash
cd appsscript
npx @google/clasp push -f
npx @google/clasp deploy -i <既存のdeploymentId> -d "変更内容の説明"
```

`clasp deployments` で現在有効なデプロイ一覧とIDを確認できる。**新しいデプロイ（`clasp deploy` を `-i` 無しで実行）は作らないこと。** URLが変わってしまい、`docs/editor/editor.js` 側の更新も必要になる。

### GitHubトークンの期限が切れたら

1. https://github.com/settings/personal-access-tokens/new で新しいfine-grained PATを再発行（手順3と同じ条件）
2. Apps Script のスクリプトプロパティ `GITHUB_TOKEN` を更新

## うまく動かないとき

- **「アクセス権が必要です」という共有リクエスト画面が返る** → デプロイの「アクセスできるユーザー」が「全員」になっていない。Web UIから「新しいデプロイ」をやり直す（上記4節）
- **日本語を含むデータだけ `bad_signature` になる** → `hmacHex` がUTF-8バイト変換をしているか確認（上記5節。修正済みのはず）
- **「コードを直したのに反映されない」** → `clasp deploy` に `-i <deploymentId>` を付け忘れて新しいデプロイを作ってしまっていないか確認
- **`repository_dispatch` は来るのに `docs/content.json` が更新されない** → GitHub の Actions タブでワークフロー `content update` のログを見る。スキーマ検証（`.github/scripts/validate-and-write.js`）で弾かれている可能性が高い
- **画像だけアップロードされない** → `GITHUB_TOKEN` の権限が `Contents: Read and write` になっているか、期限切れになっていないか確認
