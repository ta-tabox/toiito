# issues/ — 一時足場

GitHub Issues へ一括登録するための草稿置き場。**台帳の正は GitHub 側**であって
ここではない。登録が済んだら `create.sh` ごとこのディレクトリを削除する
（repo 内に残すと台帳が二重化し、必ず片方が腐る）。

Cowork のサンドボックスからは GitHub へ到達できないため、登録は macOS / 別 PC で:

```sh
cd issues && ./create.sh          # gh auth login 済みであること
# 登録後、番号が ROADMAP.md の表と一致することを確認してから
cd .. && git rm -r issues && git commit -m "chore: issue 草稿を撤去（台帳は GitHub へ移行）"
```

各ファイルの 1 行目が issue タイトル、`labels:` 行がラベル、それ以降が本文。
