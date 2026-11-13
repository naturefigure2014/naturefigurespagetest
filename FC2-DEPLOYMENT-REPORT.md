# FC2テストサイト公開の経緯と現状

更新日時: 2026年11月13日 22:36頃（日本時間）

## 目的

既存のGitHub Pagesへの公開を維持したまま、GitHub ActionsでAstroサイトを
FC2ホームページのテスト用ディレクトリに公開する。

- テストサイト: https://ninjaaquarium.web.fc2.com/test/
- FC2は有料版を利用。FTPのみ利用可能で、FTPSは使えない。
- 本番サイトのルートは転送先にしない。

## 現在の状況

2026年11月13日22:36頃の確認では、[全体公開のActions実行](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43415500950)
はビルドを完了し、FTP転送ステップを実行中。転送完了後のトップページ照合はまだ
実行されていないため、**サイト全体の公開成功は未確認**。

同時点でテストサイトのトップページはHTTP 200を返し、HTMLに `/test/_astro/`
への参照が含まれていた。ただし、トップページの表示だけでは全画像・全ページの
転送完了は確認できない。

この実行は `fc2-active-ftp-test` ブランチのコミット `e36497ad` を使用している。
GitHub上のコミットからビルドされており、ローカルの未コミット変更は含まれない。

**注意:** 動作検証中の `lftp` を使う設定は診断ブランチにあり、`main` の
[FC2公開ワークフロー](.github/workflows/deploy-fc2.yml) はまだ従来の
`FTP-Deploy-Action` を使っている。全体公開の成功を確認するまで、診断ブランチの
設定を実運用の確定版とみなさない。

## 準備した設定

### GitHub Secrets

GitHubリポジトリの **Settings → Secrets and variables → Actions → Secrets →
Repository secrets** に以下を登録した。値はこの文書やソースコードに記載しない。

| Secret名 | 用途 |
|---|---|
| `FC2_FTP_SERVER` | FC2のパッシブモード用FTPホスト名 |
| `FC2_FTP_SERVER_ACTIVE` | アクティブモードの診断用FTPホスト名 |
| `FC2_FTP_USERNAME` | FTPユーザー名 |
| `FC2_FTP_PASSWORD` | FTPパスワード。FC2 IDのログインパスワードとは別 |

FTP接続時はFC2管理画面のFTP接続ロックを解除する。FTPは暗号化されず、
通信経路上で認証情報や転送データが漏えいするリスクがある。GitHub Secretsは
保存時の保護であり、FTP通信を暗号化するものではない。リポジトリと
ワークフローの編集権限を制限し、FTPを使わない間は接続ロックを検討する。

### Astroの公開先

[astro.config.mjs](astro.config.mjs) は `DEPLOY_TARGET=fc2` の場合、
サイトURLを `https://ninjaaquarium.web.fc2.com`、ベースパスを `/test` にする。
それ以外は従来のGitHub Pages用設定を使う。
[BaseLayout.astro](src/layouts/BaseLayout.astro) のナビゲーション判定も
ベースパスに対応させた。

## 試行の経緯

1. **初期設定とプレビュー:** 既存のGitHub Pages公開とは別に手動実行の
   FC2用ワークフローを用意し、`main` に反映した。最初の
   [プレビュー実行](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43228971423)
   は成功したが、`dry-run` のためファイルはアップロードしていなかった。
2. **初回全体転送:** ビルド後に `FTP-Deploy-Action` で転送を試みたが、
   `ECONNRESET (data socket)` が発生。最初の `_astro/` の処理に進むところで
   接続が切れ、全体公開に失敗した。
3. **接続調査:** GitHub Actions上のPASV接続診断では、FTPのデータ接続に失敗した。
   同じ頃、PCのFTPソフトからは `test` フォルダの一覧を表示できた。
   FC2のファイルマネージャーに「無効なバックエンドプロセス」と表示されたことも
   あったが、その後エラーは解消した。両者の関連は不明。
4. **ACTIVEとPASVの小規模試験:** ACTIVEはタイムアウトした。一方、
   PASVを使う `curl` では小さなファイルのアップロードと読み戻しに成功し、
   [HTTPからも確認](https://ninjaaquarium.web.fc2.com/test/github-passive-ftp-test-43360001613-1.txt)
   できた。
5. **同じFTP Actionでの試験と再試行:** 小さなファイルは
   [FTP Actionでも一度成功](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43410084224)
   したが、全体公開は再び同じ接続エラーで失敗した。ビルド後に最大2回
   再試行する設定でも、3回とも最初のフォルダ処理前後で失敗した。
   その後、小規模なFTP Action試験でも失敗を再現した。
6. **PASVの接続先比較:** 制御接続先が `104.244.99.135` の場合、
   制御接続と同じIPをデータ接続先に使う試験は失敗し、PASV応答で指定された
   IPを使う試験は成功した。`104.244.99.48` では両方式とも成功した。
   これは観測された条件での結果であり、今後もIPが固定されるとは限らない。
   [比較テスト](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43414181019)
7. **代替ツールの試験:** `lftp` でEPSVを優先せずPASV応答のアドレスを使う設定を
   試した。問題が出ていた制御接続先でも、階層付きの小規模ファイルの新規転送、
   更新、HTTPでの内容照合が
   [成功](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43415284459)
   した。試験開始時には設定名の誤りもあり、修正して再実行した。
8. **全体公開を再開:** 診断ブランチで全体公開を `lftp` に変更し、
   [全体転送](https://github.com/naturefigure2014/naturefigurespagetest/actions/runs/43415500950)
   を開始した。文書作成時は転送中。

## `lftp`方式の注意

- 診断ブランチの全体公開は `DEPLOY_TARGET=fc2` でビルドし、`dist/` を
  FC2の `/test/` に転送する。パスの対応はFC2側の設定に依存する。
- `ftp:prefer-epsv no` と `ftp:ignore-pasv-address no` などを指定し、
  通常のPASVとサーバー応答のアドレスを使うよう設定している。
- 同名ファイルは更新されるが、転送元から削除された古いファイルの自動削除は
  有効にしていない。古いファイルが残るため、容量と整理に注意する。
- 既存ファイルを自動削除しない設定でも、同名ファイルは上書き・置換され得る。
  デプロイ専用ディレクトリとし、必要なデータはバックアップする。
- 転送後はトップページをHTTPで取得してビルド結果と比較する設定だが、
  HTTPのキャッシュやFC2側の応答変更によっては比較に失敗する可能性がある。
  また、この比較だけでは全ファイルの正しさは保証できない。
- 試験用ファイルやディレクトリが `test` 内に残っている。内容と用途を確認してから
  個別に整理する。

## 今後の確認・改善

1. 実行中のActionsが成功したかを確認し、テストサイトのトップ・画像・内部リンク・
   主な詳細ページを実際に確認する。失敗時は失敗ステップとログを調べる。
2. `lftp` 方式の全体公開が確認できたら、診断ブランチの変更を整理し、
   `main` への反映方法と既存GitHub Pagesへの影響を確認する。
3. 全体ビルドは約20〜30分、成果物は前回の記録で約1.32 GB・約23,000ファイル。
   現在の実行はビルド成果物をArtifactとして保存しておらず、失敗後に
   転送ジョブだけ再実行することはできない。
4. 今後はビルドと転送を別ジョブに分け、GitHub ActionsのArtifactに成果物を
   保存する構成を検討する。転送失敗時に保存済み成果物を再利用できるが、
   保存・取得の時間、容量、保存期間、公開対象コミットの確認が必要。
5. FC2有料版の容量は既存サイトと共有する。FC2管理画面で残容量を確認する。
   ファイル名・ディレクトリ名や多数の小ファイルが問題なく扱われるかも確認する。

## 関連資料

- [FC2 FTP設定](https://help.fc2.com/web/manual/group82/2272)
- [FC2 FTP接続に関するQ&A](https://help.fc2.com/web/qa/group319/1398)
- [GitHub ActionsのSecrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub ActionsのArtifact](https://docs.github.com/en/actions/tutorials/store-and-share-data)
