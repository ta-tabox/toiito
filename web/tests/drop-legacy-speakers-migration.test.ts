/**
 * 発話の種別を 2 値にする migration（`20261102130000_drop_legacy_speakers`）が、版を指さない `ai_a`・`ai_b` の発話を既定の二体の版 1 へ寄せ直すことを検査する。
 *
 * 直前の migration まで積んだ別のデータベースへ行を入れてから適用し、生の SQL で読み直す。
 */

import {
  createDatabaseBefore,
  type MigrationDatabase,
} from "@tests/setup/migration-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PERSONA_IDS } from "@/lib/personas";

const TARGET = "20261102130000_drop_legacy_speakers";

/** 適用の前後でデータベースの作り直しに 2〜3 秒かかるので、describe ごとに一つ作る。 */
const HOOK_TIMEOUT_MS = 30_000;

/** 発話を入れるセッションの id。 */
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

let database: MigrationDatabase;

/**
 * 直前までの migration を積んだデータベースを作り、利用者・問い・セッションを一つずつ入れる。
 * `withVersions` が true なら、システムのユーザー・既定の二体・それぞれの版 1 と版 2 も入れる。
 */
async function createDatabase(withVersions: boolean): Promise<void> {
  database = createDatabaseBefore(TARGET);
  const { client } = database;

  await client.$executeRawUnsafe(`
    insert into "user" ("id", "name", "email", "updatedAt")
    values ('owner', '利用者', 'owner@example.com', now()),
           ('system', 'システム', 'system@toiito.invalid', now())
  `);
  await client.$executeRawUnsafe(`
    insert into "questions" ("id", "user_id", "body")
    values ('11111111-1111-4111-8111-111111111111', 'owner', '問い')
  `);
  await client.$executeRawUnsafe(`
    insert into "sessions" ("id", "question_id")
    values ('${SESSION_ID}', '11111111-1111-4111-8111-111111111111')
  `);

  if (!withVersions) {
    return;
  }

  for (const personaId of Object.values(DEFAULT_PERSONA_IDS)) {
    await client.$executeRawUnsafe(`
      insert into "persona" ("id", "user_id") values ('${personaId}', 'system')
    `);
    await client.$executeRawUnsafe(`
      insert into "persona_config"
        ("id", "persona_id", "version", "name", "abstraction", "dissent", "convergence", "description", "system_prompt")
      select gen_random_uuid(), '${personaId}', v, '呼び名', 'level_3', 'level_3', 'level_3', '', '全文'
        from unnest(array[1, 2]) as v
    `);
  }
}

/** 種別（`speaker`）で、版を指さない発話を一件入れる。 */
async function insertMessage(speaker: string): Promise<void> {
  await database.client.$executeRawUnsafe(`
    insert into "messages" ("id", "session_id", "speaker", "body")
    values (gen_random_uuid(), '${SESSION_ID}', '${speaker}', '${speaker} の発話')
  `);
}

/** 発話ごとに、種別と、指している版のペルソナと版番号を投稿順で返す。 */
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

afterAll(async () => {
  await database.drop();
});

describe("既定の二体の版 1 がある DB", () => {
  beforeAll(async () => {
    await createDatabase(true);
    await insertMessage("human");
    await insertMessage("ai_a");
    await insertMessage("ai_b");
    database.applyTarget();
  }, HOOK_TIMEOUT_MS);

  it("版を指さない ai_a は具体の版 1 を、ai_b は抽象の版 1 を指す ai の発話になり、人間の発話は版を指さない", async () => {
    expect(await listMessageVersions()).toEqual([
      { speaker: "human", persona_id: null, version: null },
      { speaker: "ai", persona_id: DEFAULT_PERSONA_IDS.concrete, version: 1 },
      { speaker: "ai", persona_id: DEFAULT_PERSONA_IDS.abstract, version: 1 },
    ]);
  });
});

describe("版 1 が無い DB に、版を指さない AI の発話がある", () => {
  beforeAll(async () => {
    await database.drop();
    await createDatabase(false);
    await insertMessage("ai_a");
  }, HOOK_TIMEOUT_MS);

  it("適用は失敗し、発話の種別は ai_a のまま残る", async () => {
    expect(() => database.applyTarget()).toThrow();
    expect(await listMessageVersions()).toEqual([
      { speaker: "ai_a", persona_id: null, version: null },
    ]);
  });
});
