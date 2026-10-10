/**
 * 開発用データの投入。
 *
 * ユーザー二人と、その持ち物としての問い・対話・メモと、二人の AI の利用量を一式入れて、UI を手触りで確かめられる状態にする。
 * `seed/index.ts` が持つのは投入のステップと誰が何を持つかだけで、入れる値は `users.ts`・`questions.ts`・`usage.ts`、書き込みの手順は `db.ts` の `createQuestionWithTranscript` と `recordUsage` が持つ。
 * アプリと同じ経路を通らない書き込み経路を増やさない（docs/ARCHITECTURE.md「DB への書き込み経路」）。
 * 接続先は `DATABASE_URL` 一点で、投入先を選ぶ引数を `seed` に作らない（受け取り方を二つ持つと、env は開発用・引数はテスト用という食い違いが起こる）。
 * `seed` が動くのはユーザーが一人も居ない DB に対してだけで、既に入っている DB へは何も入れずに終わる。
 * 利用量の見本は時刻が投入した時刻からの日数で決まり、日が経つと集計の期間から外れるので、`reseedUsage` だけはユーザーが居る DB で見本を入れ直す。
 * 本番（NODE_ENV=production）では、空でも投入しない。
 *
 * エントリポイントは `seed`（CLI は pnpm seed）と `reseedUsage`（CLI は pnpm seed:usage。本体は `reseed-usage.ts`）。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OwnerId } from "@/lib/types";
import { registerSrcAlias } from "../node-alias.ts";
import { SEED_USAGE } from "./usage.ts";
import { SEED_USERS } from "./users.ts";

/**
 * db.ts の repo 関数一式。
 *
 * 静的 import は `registerSrcAlias` の登録より先に解決されるので、実体の読み込みは `seed` の中まで遅らせる（`scripts/node-alias.ts`）。
 */
type Repo = typeof import("@/lib/db");

/**
 * 投入した内容。
 *
 * 問いだけ件数でなく id を返すのは、投入分を後から取得できるようにするため。
 * 同じ DB を他の書き手（並行するテスト）と共有していても、`questionIds` があれば取り違えない。
 */
export type SeedSummary = {
  users: number;
  questionIds: string[];
  messages: number;
  memos: number;
  usageLogs: number;
};

/**
 * 本番の DB への投入を止める。
 * 意図して実行するときだけ `ALLOW_PROD_SEED` を渡す。
 *
 * `user` 表が空でなければ `seed` は何もせずに終わるが、その検査は行が在る DB にしか効かない。
 * 立ち上げ直後の空の本番 DB は素通りするので、環境変数でも止める。
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
 * 一人目が既に居る DB へは何も入れずに戻り、接続は閉じない（呼び出し側の CLI・テストが閉じる）。
 *
 * 二人目が持つ一件は、一人目の画面のどこにも出てはいけない側として在る（絞り込みが抜けたら、二人目の問いが一人目の画面に出る）。
 * 一人目が居る DB で何も入れずに戻るのは、投入先の取り違えに行が増えてから気付く形にしないためである。
 */
export async function seed(): Promise<SeedSummary> {
  assertNotProduction();

  const repo: Repo = await import("@/lib/db");

  // `questions.ts` も src を import するので、`@/lib/db` と同じく `registerSrcAlias` の登録後に読み込む。
  const { OTHER_USER_INPUT, SEED_INPUTS } = await import("./questions.ts");

  const summary: SeedSummary = {
    users: 0,
    questionIds: [],
    messages: 0,
    memos: 0,
    usageLogs: 0,
  };

  try {
    const [first, second] = SEED_USERS;
    const existing = await repo.getUserByEmail(first.email);

    if (existing) {
      console.warn(
        `既に ${first.email} が居る DB なので、何も入れずに終わる。空の DB へ入れるか、投入先（DATABASE_URL）を確かめる`,
      );

      return summary;
    }

    const owner = await repo.createUser(first);
    const other = await repo.createUser(second);
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

    summary.usageLogs = await recordSampleUsage(repo, {
      first: owner.id,
      second: other.id,
    });

    return summary;
  } catch (cause) {
    throw repo.withSetupGuidance(cause);
  }
}

/**
 * シードの二人（`userIds`）へ、利用量の見本（`SEED_USAGE`）を現在時刻を基準にした時刻で書き、書いた行数を返す。
 */
async function recordSampleUsage(
  repo: Repo,
  userIds: Record<"first" | "second", OwnerId>,
): Promise<number> {
  const now = Date.now();

  for (const { user, daysAgo, usage } of SEED_USAGE) {
    const createdAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);

    await repo.recordUsage(userIds[user], { ...usage, created_at: createdAt });
  }

  return SEED_USAGE.length;
}

/**
 * シードの二人の利用量の行を削除し、利用量の見本を現在時刻を基準に入れ直して、入れた行数を返す。
 * 接続先は DATABASE_URL で、接続は閉じない（呼び出し側の CLI・テストが閉じる）。
 *
 * シードの二人のどちらかが居ない DB では、何も削除せずに throw する。
 * シードの二人以外の利用者の行には触れない。
 */
export async function reseedUsage(): Promise<number> {
  assertNotProduction();

  const repo: Repo = await import("@/lib/db");

  try {
    const [first, second] = await Promise.all(
      SEED_USERS.map((user) => repo.getUserByEmail(user.email)),
    );

    if (!first || !second) {
      throw new Error(
        `シードのユーザー（${SEED_USERS.map((user) => user.email).join("・")}）が居ない DB には利用量の見本を入れない。先に pnpm seed を実行するか、投入先（DATABASE_URL）を確かめる`,
      );
    }

    await repo.deleteUsageLogs(first.id);
    await repo.deleteUsageLogs(second.id);

    return await recordSampleUsage(repo, {
      first: first.id,
      second: second.id,
    });
  } catch (cause) {
    throw repo.withSetupGuidance(cause);
  }
}

/**
 * 接続先のデータベース名。
 *
 * どこへ入れたのかを取り違えさせないために報告へ出す。
 */
export function databaseName(): string {
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
      `投入した: ユーザー ${summary.users} 人 / 問い ${summary.questionIds.length} 件 / 発話 ${summary.messages} 件 / メモ ${summary.memos} 件 / 利用量 ${summary.usageLogs} 行`,
    );
  }

  const { disconnect } = await import("@/lib/db");
  await disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
