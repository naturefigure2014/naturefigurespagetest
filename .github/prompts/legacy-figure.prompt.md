---
description: "指定フォルダ配下にレガシー生成スクリプトを実行し、species / speciesGroup を設定して一覧表示する"
argument-hint: "対象フォルダ（例: kaiyodo\birdtales kaiyodo\bussanntenn）"
agent: agent
---

次のフォルダ配下の各フォルダに対して、レガシーフィギュア生成を行ってください。

対象: ${input:targets:src/content/figures 配下の対象フォルダ（複数可、空白区切り）}

[legacy-figure.instructions.md](../instructions/legacy-figure.instructions.md) の規約に従って、次の順に進めます。

1. 対象フォルダ内の各フォルダで `python C:\astro\7\scripts\generate_legacy_figure.py --content-type title` を実行する。
2. 生成件数をラインナップと照らし、重複や空ページがあれば直す。
3. 生き物のフィギュアに species と speciesGroup（2種なら speciesEntries）を設定する。
4. 設定結果を、フォルダ/番号ごとの表で示す。スキップしたものと判断が分かれた点も添える。

ビルドによる確認はしないでください。
