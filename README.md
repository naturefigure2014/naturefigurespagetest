# NATURE FIGURE Astro

Astroで構築する「ネイチャーフィギュアのページ」の静的サイトです。

## 今回の変更（FIGURE画像）
- FIGURE詳細ページで、複数画像を含む話題は「画像2/3・説明1/3」のレイアウト。
- 話題内の画像をクリックすると拡大表示するライトボックスを表示。
- 拡大表示は元画像の縦横比を維持し、PC・スマートフォンの両方に対応。
- 背景クリック、閉じるボタン、Escキーで閉じられます。
- 既存の画像ファイル名をそのまま利用する方式は維持しています。

## 起動
```bash
npm install
npm run dev
```

## ビルド
```bash
npm run build
```

## FC2テストサイトへの公開

GitHub Pagesへの公開とは別に、GitHub ActionsからFC2の
`https://ninjaaquarium.web.fc2.com/test/` に手動で公開します。

1. FC2の管理画面「FTP設定」でFTP接続ロックを解除し、FTPホスト名、
   ユーザー名、FTPパスワードを確認します。FC2 IDのパスワードとは異なります。
2. FC2に `test` ディレクトリを作成します。FTPログイン直後のディレクトリから
   `./test/` が公開URLの `/test/` に対応することを確認してください。
   このディレクトリはデプロイ専用とし、事前に既存データをバックアップします。
3. GitHubリポジトリの **Settings → Secrets and variables → Actions** で、
   `FC2_FTP_SERVER`、`FC2_FTP_USERNAME`、`FC2_FTP_PASSWORD` を
   repository secretsとして登録します。パスワードをソースやログに書かないでください。
4. このワークフローとサイトの変更をGitHubに反映します。**Actions → Deploy test
   site to FC2 → Run workflow** から、まず `Preview changes without uploading`
   を有効にして実行し、ログで変更対象を確認します。
5. 問題がなければ同じ画面でプレビューを無効にして実行し、公開URLの画像とリンクを
   確認します。以後の更新も手動で実行します。

FTPは通信を暗号化しないため、FTPパスワードやデータが通信経路上で漏えいする
リスクがあります。Secretsは保存時の保護であり、FTP転送を暗号化しません。
GitHubリポジトリやワークフローの編集権限も適切に制限してください。
FC2のFTP接続ロックは更新しない間は有効にしておくことを推奨します。

FC2無料版の1ファイル5 MBの制限に備え、ワークフローはビルド後にサイズを
確認します。同期によりテストディレクトリ内の以前デプロイしたファイルが
削除される場合があります。本番サイトのルートを転送先に指定しないでください。
