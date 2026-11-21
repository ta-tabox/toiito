/**
 * ペルソナの表を足す migration（`20261102120000_persona_tables`）が、既存の発話を既定の二体の版 1 へ寄せることを検査する。
 *
 * 直前の migration まで積んだ別のデータベースへ行を入れてから適用し、生の SQL で読み直す。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createDatabaseBefore,
  type MigrationDatabase,
} from "@tests/setup/migration-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TARGET = "20261102120000_persona_tables";

/**
 * 既定の二体の `persona.id`。
 *
 * 値の正は migration の SQL。
 */
const DEFAULT_PERSONA_ID = {
  ai_a: "00000000-0000-4000-8000-000000000001",
  ai_b: "00000000-0000-4000-8000-000000000002",
};

/** 適用の前後でデータベースの作り直しに 2〜3 秒かかるので、describe ごとに一つ作る。 */
const HOOK_TIMEOUT_MS = 30_000;

let database: MigrationDatabase;

/**
 * 直前までの migration を積んだデータベースを作り、話者（`speakers`）の順に発話を入れてから、検査する migration を適用する。
 * 発話は、利用者・問い・セッションを一つずつ入れた上に入れる。
 */
async function createMigratedDatabase(speakers: string[]): Promise<void> {
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
    values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111')
  `);

  for (const speaker of speakers) {
    await client.$executeRawUnsafe(`
      insert into "messages" ("id", "session_id", "speaker", "body")
      values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '${speaker}', '${speaker} の発話')
    `);
  }

  database.applyTarget();
}

afterAll(async () => {
  await database.drop();
});

/** 発話ごとに、話者と、指している版のペルソナと版番号を返す。 */
async function listMessageVersions() {
  return database.client.$queryRawUnsafe<
    {
      speaker: string;
      persona_id: string | null;
      version: number | null;
    }[]
  >(`
    select m."speaker"::text as "speaker", c."persona_id"::text as "persona_id", c."version"
      from "messages" m
      left join "persona_config" c on c."id" = m."persona_config_id"
     order by m."seq"
  `);
}

describe("AI の発話がある DB", () => {
  beforeAll(async () => {
    await createMigratedDatabase(["human", "ai_a", "ai_b"]);
  }, HOOK_TIMEOUT_MS);

  it("ai_a の発話は具体の版 1 を、ai_b の発話は抽象の版 1 を指し、人間の発話は版を指さない", async () => {
    expect(await listMessageVersions()).toEqual([
      { speaker: "human", persona_id: null, version: null },
      { speaker: "ai_a", persona_id: DEFAULT_PERSONA_ID.ai_a, version: 1 },
      { speaker: "ai_b", persona_id: DEFAULT_PERSONA_ID.ai_b, version: 1 },
    ]);
  });

  it("既定の二体はシステムのユーザーが持つ", async () => {
    const owners = await database.client.$queryRawUnsafe<
      { persona_id: string; email: string }[]
    >(`
      select p."id"::text as "persona_id", u."email"
        from "persona" p
        join "user" u on u."id" = p."user_id"
       order by p."id"
    `);

    expect(owners).toEqual([
      { persona_id: DEFAULT_PERSONA_ID.ai_a, email: "system@toiito.invalid" },
      { persona_id: DEFAULT_PERSONA_ID.ai_b, email: "system@toiito.invalid" },
    ]);
  });

  it("版 1 の全文は src/personas の md の全文と一致する", async () => {
    const configs = await database.client.$queryRawUnsafe<
      { persona_id: string; system_prompt: string }[]
    >(`
      select "persona_id"::text as "persona_id", "system_prompt"
        from "persona_config"
       order by "persona_id"
    `);

    const markdownOf = (id: string) =>
      readFileSync(path.join("src", "personas", `${id}.md`), "utf-8");

    expect(configs).toEqual([
      {
        persona_id: DEFAULT_PERSONA_ID.ai_a,
        system_prompt: markdownOf("ai_a"),
      },
      {
        persona_id: DEFAULT_PERSONA_ID.ai_b,
        system_prompt: markdownOf("ai_b"),
      },
    ]);
  });
});

describe("AI の発話が無い DB", () => {
  beforeAll(async () => {
    await database.drop();
    await createMigratedDatabase(["human"]);
  }, HOOK_TIMEOUT_MS);

  it("人間の発話だけなら、システムのユーザーもペルソナも作らない", async () => {
    const counts = await database.client.$queryRawUnsafe<
      { users: number; personas: number; configs: number }[]
    >(`
      select (select count(*)::int from "user") as "users",
             (select count(*)::int from "persona") as "personas",
             (select count(*)::int from "persona_config") as "configs"
    `);

    expect(counts).toEqual([{ users: 1, personas: 0, configs: 0 }]);
  });
});
