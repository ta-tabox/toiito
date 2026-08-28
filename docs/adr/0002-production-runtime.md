# 0002. 本番の実行環境を Vercel（Hobby）にし、移植性は禁止則で持つ

- **状態**: 採用
- **決定日**: 2026-08-28
- **関係する ADR**: なし

## 文脈

DB の置き場（Neon）と ORM（Prisma 7）は先に決着していたが、アプリ側の実行環境だけが `ARCHITECTURE.md`「持ち越した開いた問い」に「リモート環境構築（Neon への接続と本番デプロイ。別タスク）」として残っていた。
常用が手元の `pnpm dev` に縛られている間は、思いついた場所から問いを投げられない。
再訪率がこの器の成否を決めるという見立て（`extensions/fermentation-and-outlets.md`「疑い1」）からすると、投げられない時間があること自体が効果を削る。

決めるべき形の側にも制約がある。
`web/src/app/actions.ts` の `speakAction` は一つの Server Action の中で Anthropic API を二回逐次で呼び、その間クライアントへ何も送らない。
並列化は `ARCHITECTURE.md` が禁じている（ai_b は ai_a への応答であることに意味がある）ので、逐次であることは環境の側で引き受けるしかない。

## 決定

1. **本番の実行環境は Vercel の Hobby プラン**。
2. **移植性はコンテナ化ではなく禁止則で持つ**。
   `ARCHITECTURE.md` に「Vercel 固有の口をアプリへ入れない」を置き、`@vercel/*` の import・ISR のオンデマンド再検証・Edge Config・Cron Jobs を対象とする。
   ホスティング側の設定だけで閉じるもの（暫定の門に使う Vercel Authentication など）はアプリのコードに現れないので対象外。
3. **Dockerfile は今は置かない**。
   移行を決めた日に、そのときの Next.js の版で書く。
4. 実際にデプロイする作業と、そこで残る決定（秘密の置き場・migration の経路・独自ドメイン・門の適用範囲）は #90（本番環境へデプロイする）が持つ。

## 理由

候補は Vercel / Cloudflare Workers（OpenNext）/ Fly.io / Railway / Render / VPS + Docker の六つ。
四軸（App Router と Server Actions・Prisma 7 の driver adapter・AI 呼び出しの実行時間上限・費用）で比較した材料は issue #71（アプリケーションの本番実行環境を決める）のコメントにある。

**決め手は四軸ではなく暫定の門だった**。
四軸そのものでは差が付かなかったためである。
一往復は `max_tokens: 1024` を二回逐次で待つ形なので実時間は数十秒に収まる見込みで、どの候補の上限にも触れない。
`@prisma/adapter-pg` はどの候補でも動く見込みで、workerd 上でも Prisma 公式の Cloudflare Workers ガイドがこのアダプタを名指ししている。
費用が 0 円になるのは Vercel Hobby と Cloudflare 無料の二つ。

門で差が付いたのは、#65（認証と所有権の方式を決める）/ #68（Google OAuth のログイン）が入るまで自分だけが入れる状態にする必要があるからである。
Vercel Authentication は全プランで使えて Production も保護できるが、Render の IP 制限は Scale プラン、Fly.io と Railway には既製の門が無く、VPS は自分で nginx か Caddy に掛けることになる。
そしてこの依存は #68 が入れば用済みになるので、育たない。

**Cloudflare Workers を採らなかった条件**: 無料プランの CPU 予算が 10 ms/リクエストで、Next.js の SSR が収まるかを測っていない。
外部 API の待ちは CPU 時間に算入されないので逐次二回は問題にならないが、収まらなければ無料枠は実質存在せず、有料 5 ドル/月が前提になる。
測って収まるなら、費用でも上限でも Vercel に劣らない。

**Fly.io を採らなかった条件**: secrets が実行時にしか注入されず、ビルド時に見えない。
`web/prisma.config.ts` が `datasource.url` に `env("DIRECT_URL")` を即時解決で置いているため、`postinstall` の `prisma generate` は `DIRECT_URL` がインストール段階で無いと exit 1 で落ちる（2026-08-28 に実測）。
buildpack のビルドがそのまま落ちるので、Dockerfile で build arg を渡すか `prisma.config.ts` を遅延評価へ変える改修が要る。
環境の都合でリポジトリを変えることになるので採らなかった。

**Railway と Render を採らなかった条件**: どちらも既製の門が実質無く、費用も 0 円にならない。
Railway は無料枠が廃止済み、Render の無料はスピンダウン（15 分無アクセス・復帰に約 1 分）を伴う。
ただし migration のデプロイ時フック（Railway の Pre-Deploy Command、Fly.io の `release_command`）は両者が持ち Vercel は持たないので、そこを重く見るなら順位が入れ替わる。

**VPS + Docker を採らなかった条件**: プラットフォーム由来の関数上限が無いのは利点だが、無料枠が無く、OS の更新と証明書の面倒が手仕舞い（`~/vivarium/fermentary/playbooks/terrarium.md`）の後も残る。
このプロジェクトは終わる前提なので、残る運用は不利に働く。

**コンテナ化を先に済ませておく案を採らなかった条件**: 移植性を決めるのは実行環境の選択ではなく、アプリが何に触っているかである。
Docker 化してもコードが `@vercel/kv` を呼んでいれば移植できず、逆に素の Node と標準 API だけで書かれていれば Dockerfile は移行の日に書けば足りる。
いま使わない設定ファイルは腐るので、規律の側（禁止則）へ倒した。

## 帰結

- `ARCHITECTURE.md`「技術スタック」に Vercel（Hobby）の行が入り、「持ち越した開いた問い」から実行環境の行が落ちる
- `ARCHITECTURE.md` に「実行環境について今も効く禁止則」の節が新設される
- **#9（ストリーミング化 spike）/ #10（ストリーミング実装）の優先度は動かない**。
  どの候補でも一往復が上限で切れる見込みが無いので、ストリーミングを入れる理由は「切れないため」ではなく「待ちの体感」だけになる。
  待ちの体感は `ARCHITECTURE.md`「快適さの最適化をしない」の適用対象なので、判断は技術的制約から L5 の官能へ移る
- `ROADMAP.md` の第二波が `#71 → #90 → #68` の並びになる
- 一往復の実時間は実キーで測っていないので、四軸のうち実行時間上限は #90 の疎通確認で初めて閉じる

## 覆る条件

- **他人へ開いて収益化する段になったら必ず見直す**。
  Vercel Hobby は "for personal, non-commercial use" と明記されているので、そこは技術ではなく規約が引く線である。
  そのとき Vercel Pro へ上がるか、コンテナへ移るかを改めて決める
- 一往復の実測が 300 秒に近づいたら。
  Hobby の上限は 300 秒で変更できないので、Pro（最大 800 秒）へ上がるか上限の無い環境へ移る
- 禁止則「Vercel 固有の口をアプリへ入れない」を破る必要が出たら。
  破りたくなること自体が、この環境がアプリの要求に合っていない合図になる
- migration のデプロイ時フックが無いことが実運用で効いてきたら。
  Vercel に `release_command` 相当は無く、#90 でどこから流すかを決めることになる。
  その決定が窮屈なら、フックを持つ Railway や Fly.io を見直す
- Cloudflare Workers の無料プランで Next.js の SSR が CPU 10 ms に収まると実測できたら。
  費用と上限の両方で並ぶので、門の要否が消える #68 の後に限り、比較の対象へ戻る
