# 依存の脆弱性は Dependabot の通知と修正の PR で監視し、CI のブロックにしない

- **状態**: 採用
- **決定日**: 2026-11-14
- **関係する ADR**: 20260829-prisma-major-hold, 20260829-typescript-7-parser

## 文脈

決定時点で、依存の脆弱性を監視するものは無い。
CI（`.github/workflows/check.yml`）は依存の監査を走らせず、Dependabot の設定も無い。

20260829-prisma-major-hold は Prisma を 7 系に止めている。
上げられない依存に脆弱性が出ることがある。

## 決定

1. **依存の脆弱性は、GitHub の Dependabot alerts と Dependabot security updates で監視する。**
   alerts は脆弱性を通知し、security updates は修正版へ上げる PR を立てる。
   立った PR は、他の PR と同じ CI の `check` を通す。
2. **脆弱性を、CI の赤にもマージのブロックにもしない。**
   `check.yml` に依存の監査を足さない。
3. **定期的に版を上げる Dependabot version updates は入れない。**
4. **有効にした設定は GitHub 側の状態で差分に残らないので、設定の値と確かめた日を `docs/HARNESS.md` に書く。**

## 理由

- **CI のブロックにしない理由**: 上げられない依存に脆弱性が出ると、脆弱性と無関係な PR まで全て止まる
  止めないためには除外の一覧を保守することになり、除外が増えるほどブロックの意味が薄れる
- **Dependabot を選ぶ理由**: GitHub の設定だけで動き、workflow もリポジトリのファイルも増えない
  修正の PR を GitHub が立てるので、通知を受けた後の手順が一つ減る
- **CI に通知だけの監査を併せて足す案を採らなかった条件**: alerts と同じ情報が二経路で出て、CI のログは誰も読まない
- **version updates を入れない理由**: 20260829-prisma-major-hold と 20260829-typescript-7-parser は版を名指しで止めており、定期の PR はその版を毎回上げようとする
- **設定の値を文書に書く理由**: main の ruleset が無効のまま気付かれなかった経験（#152（main の ruleset が誰にも効いていない））から、GitHub 側の状態は実際の値と確かめた日を文書に置く

## 帰結

- 人間が GitHub の Settings → Code security で、Dependabot alerts と Dependabot security updates を有効にする
- `docs/HARNESS.md` に、二つの設定の値と確かめた日が入る
- security updates の PR は、Prisma のメジャーを上げるものなら閉じるか、20260829-prisma-major-hold の覆る条件に照らして判断する

## 覆る条件

- 通知が溜まって読まれなくなったら
  重大度で通知を絞るか、CI の赤へ寄せるかを決め直す
- 脆弱性の修正を待たずに本番へ出た事故が起きたら
  重大度の高いものだけを CI のブロックにする
- GitHub から別のホスティングへリポジトリを移したら
  移った先の監視の手段で決め直す
