/**
 * セッションの選択の列を足す migration（`20261102140000_session_personas`）が、既存のセッションを既定の二体へ当てることを検査する。
 *
 * 直前の migration まで積んだ別のデータベースへ行を入れてから適用し、生の SQL で読み直す。
 */

import {
  createDatabaseBefore,
  type MigrationDatabase,
} from "@tests/setup/migration-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PERSONA_IDS } from "@/lib/personas";

const TARGET = "20261102140000_session_personas";

/** 適用の前後でデータベースの作り直しに 2〜3 秒かかるので、describe ごとに一つ作る。 */
const HOOK_TIMEOUT_MS = 30_000;

let database: MigrationDatabase;

/**
 * 直前までの migration を積んだデータベースを作り、利用者・問いを一つずつと、セッションを `sessionCount` 件入れてから、検査する migration を適用する。
 */
async function createMigratedDatabase(sessionCount: number): Promise<void> {
  database = createDatabaseBefore(TARGET);
  const { client } = database;

  await client.$executeRawUnsafe(`
    insert into "user" ("id", "name", "email", "updatedAt")
    values ('owner', '利用者', 'owner@example.com', now())
  `);
  await client.$executeRawUnsafe(`
    insert into "questions" ("id", "user_id", "body")
    values ('11111111-1111-4111-8111-111111111111', 'owner', '問い')
  `);
  await client.$executeRawUnsafe(`
    insert into "sessions" ("id", "question_id")
    select gen_random_uuid(), '11111111-1111-4111-8111-111111111111'
      from generate_series(1, ${sessionCount})
  `);

  database.applyTarget();
}

/** 既定のペルソナの持ち主の email を、ペルソナの id の順に返す。 */
async function listPersonaOwners() {
  return database.client.$queryRawUnsafe<{ id: string; email: string }[]>(`
    select p."id"::text as "id", u."email"
      from "persona" p
      join "user" u on u."id" = p."user_id"
     order by p."id"
  `);
}

afterAll(async () => {
  await database.drop();
});

describe("セッションがあり、既定のペルソナが無い DB", () => {
  beforeAll(async () => {
    await createMigratedDatabase(2);
  }, HOOK_TIMEOUT_MS);

  it("システムのユーザーが持つ既定の二体を作る", async () => {
    expect(await listPersonaOwners()).toEqual([
      { id: DEFAULT_PERSONA_IDS.concrete, email: "system@toiito.invalid" },
      { id: DEFAULT_PERSONA_IDS.abstract, email: "system@toiito.invalid" },
    ]);
  });

  it("既存のセッションは、1 番手に具体、2 番手に抽象を指す", async () => {
    const sessions = await database.client.$queryRawUnsafe<
      { first: string; second: string }[]
    >(`
      select "first_persona_id"::text as "first", "second_persona_id"::text as "second"
        from "sessions"
    `);

    expect(sessions).toEqual([
      {
        first: DEFAULT_PERSONA_IDS.concrete,
        second: DEFAULT_PERSONA_IDS.abstract,
      },
      {
        first: DEFAULT_PERSONA_IDS.concrete,
        second: DEFAULT_PERSONA_IDS.abstract,
      },
    ]);
  });
});

describe("セッションが無い DB", () => {
  beforeAll(async () => {
    await database.drop();
    await createMigratedDatabase(0);
  }, HOOK_TIMEOUT_MS);

  it("システムのユーザーもペルソナも作らない", async () => {
    expect(await listPersonaOwners()).toEqual([]);
  });
});
