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
6. ビルド成果物は `fc2-site-dist` というGitHub Actions artifactとして7日間保存します。
   デプロイが失敗した場合は同じ実行の **Re-run jobs → Re-run failed jobs** を選びます。
   成功したbuild jobは再実行されず、保存済み成果物をdeploy jobで再利用します。
   **Re-run all jobs** を選ぶとビルドからやり直します。ワークフローを修正して
   再実行する場合は、`artifact_run_id` に失敗した実行のIDを指定すると、
   その実行の成果物を使ってビルドを省略できます（成果物の保存期間は7日間です）。

FTP接続を調査する場合は、ワークフロー実行時に `Test FTP data connections
without building or uploading` を有効にすると、ビルドやアップロードを行わずに
`test` ディレクトリの一覧取得を確認できます。

FTPは通信を暗号化しないため、FTPパスワードやデータが通信経路上で漏えいする
リスクがあります。Secretsは保存時の保護であり、FTP転送を暗号化しません。
GitHubリポジトリやワークフローの編集権限も適切に制限してください。
FC2のFTP接続ロックは更新しない間は有効にしておくことを推奨します。

FC2有料版はディスク容量が合計10 GB、FTP経由の1ファイルの上限が1 GBです。
ワークフローはビルド後にサイズを表示し、1 GB超のファイルがあれば停止します。
FC2の残り容量は既存サイトと共有するため、公開前に管理画面でも確認してください。
転送元から削除された古いファイルはサーバーに残るため、必要に応じてFTPソフトで
整理してください。本番サイトのルートを転送先に指定しないでください。
