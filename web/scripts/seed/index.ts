/**
 * 開発用データの投入。
 *
 * 利用者二人と、その持ち物としての問い・対話・メモを一式入れて、UI を手触りで確かめられる状態にする。
 * このファイルが持つのは投入のステップと誰が何を持つかだけで、入れる値は同じディレクトリの users.ts と questions.ts、書き込みの手順は db.ts の createQuestionWithTranscript が持つ。
 * アプリと同じ経路を通らない投入口を増やさない（ARCHITECTURE.md「DB への書き込み経路」）。
 * 接続先は DATABASE_URL 一点で、db.ts が読む。
 * 投入先を選ぶ引数はここに作らない——渡し口を二つ持つと、env は開発用・引数はテスト用という食い違いが起こる。
 * 動くのは利用者が一人も居ない DB に対してだけで、既に入っている DB へは何も入れずに終わる。
 * 本番（NODE_ENV=production）では、空でも投入しない。
 *
 * 入口は seed。
 * CLI は node scripts/seed/index.ts（pnpm seed）。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerSrcAlias } from "../node-alias.ts";
import { OTHER_USER_INPUT, SEED_INPUTS } from "./questions.ts";
import { SEED_USERS } from "./users.ts";

/**
 * db.ts の repo 関数一式。
 *
 * 実体の読み込みは seed の中まで遅らせる（理由は ../node-alias.ts）。
 */
type Repo = typeof import("@/lib/db");

/**
 * 投入した内容。
 *
 * 問いだけ件数でなく id を返すのは、投入分を後から引けるようにするため。
 * 同じ DB を他の書き手（並行するテスト）と共有していても、これがあれば取り違えない。
 */
export type SeedSummary = {
  users: number;
  questionIds: string[];
  messages: number;
  memos: number;
};

/**
 * 本番の DB への投入を止める。
 *
 * 利用者の有無で止める関門（seed）は、行が在る DB にしか効かない。
 * 立ち上げ直後の空の本番 DB は素通りするので、環境変数でも止める。
 * 意図して流すときだけ ALLOW_PROD_SEED を渡す。
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PROD_SEED) {
    throw new Error(
      "NODE_ENV=production では開発用シードを投入しない。意図して流すなら ALLOW_PROD_SEED=1 を渡す",
    );
  }
}

/**
 * シードを投入する。
 * 接続先は DATABASE_URL。
 *
 * 一人目が問いの大半を持ち、二人目は一件だけ持つ。
 * 二人目の一件は、一人目の画面のどこにも出てはいけない側として在る（絞り込みが抜けたら、それがそこに出る）。
 *
 * 一人目が既に居る DB へは何も入れずに戻る。
 * 投入先の取り違えを、行が増えてから気付く形にしないため。
 * 接続は閉じない。
 * 呼び出し側（CLI・テスト）が自分の都合で閉じる。
 */
export async function seed(): Promise<SeedSummary> {
  assertNotProduction();

  const repo: Repo = await import("@/lib/db");
  const summary: SeedSummary = {
    users: 0,
    questionIds: [],
    messages: 0,
    memos: 0,
  };

  try {
    const [first, second] = SEED_USERS;

    if (await repo.getUserByEmail(first.email)) {
      console.warn(
        `既に ${first.email} が居る DB なので、何も入れずに終わる。空の DB へ入れるか、投入先（DATABASE_URL）を確かめる`,
      );

      return summary;
    }

    const owner = await repo.createUser(first.email, first.name);
    const other = await repo.createUser(second.email, second.name);
    summary.users = 2;

    const plan = [
      ...SEED_INPUTS.map((input) => ({ ownerId: owner.id, input })),
      { ownerId: other.id, input: OTHER_USER_INPUT },
    ];

    for (const { ownerId, input } of plan) {
      const created = await repo.createQuestionWithTranscript(ownerId, input);

      summary.questionIds.push(created.question.id);
      summary.messages += created.messages.length;
      summary.memos += created.memos.length;
    }

    return summary;
  } catch (cause) {
    throw repo.withSetupGuidance(cause);
  }
}

/**
 * 接続先のデータベース名。
 *
 * どこへ入れたのかを取り違えさせないために報告へ出す。
 */
function databaseName(): string {
  const url = process.env.DATABASE_URL;

  return url ? path.basename(new URL(url).pathname) : "(DATABASE_URL 未設定)";
}

/**
 * CLI の本体。
 *
 * 投入先を先に告げ、投入し、結果を報告して接続を閉じる。
 * 接続先を最初に出すのは、開発用と検証用の取り違えに投入前に気付けるようにするため。
 */
async function main(): Promise<void> {
  registerSrcAlias();

  console.log(`接続先: ${databaseName()}`);

  const summary = await seed();

  // 何も入れなかったときは seed 側が理由を言っている。
  // 件数ゼロを重ねて報告しない。
  if (summary.questionIds.length > 0) {
    console.log(
      `投入した: 利用者 ${summary.users} 人 / 問い ${summary.questionIds.length} 件 / 発話 ${summary.messages} 件 / メモ ${summary.memos} 件`,
    );
  }

  const { disconnect } = await import("@/lib/db");
  await disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
