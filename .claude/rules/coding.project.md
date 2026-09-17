---
paths:
  - "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
  - "**/*.{py,sh,bash,zsh,fish}"
  - "**/*.{sql,go,rs,rb,java,kt,vue,svelte,prisma}"
---

# コーディング規約のうち toiito だけの規則

`coding.md`（配布元のテンプレートとバイト一致させる配布物）に加えて読み込まれる。
テンプレートからの逸脱と追加だけを持ち、`coding.md` は書き換えない。

- 製品の比喩語（`docs/VISION.md`「語彙」・`docs/DESIGN.md`「語彙」）は UI の文言と md に閉じ、表・列・enum・型・関数・ファイルの名前とコードのコメントでは技術の語で言う（「培地」の表は `cultures` でなく `materials`）
  名前とコメントの読者は `docs/` を読んでいないエンジニアで、比喩の辞書を持たず、名前から何を保持するかを読み取れない
