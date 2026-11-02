/**
 * 既定のペルソナの版を同期する repo 関数（`addDefaultPersonaConfigs`）が、コードの設定と DB の版を揃えることを検査する。
 *
 * 前準備（`tests/setup/truncate.ts`）がケースごとに一度同期しているので、同期より前の状態はケースの中で作り直す。
 */

import {
  countSystemUsers,
  createMigratedPersonas,
  deletePersonas,
  listPersonaConfigRows,
} from "@tests/setup/persona-rows";
import { afterAll, describe, expect, it } from "vitest";
import * as db from "@/lib/db";
import { DEFAULT_PERSONA_SETTINGS, toSystemPrompt } from "@/lib/personas";

afterAll(async () => {
  await db.disconnect();
});

/**
 * 既定の二体の `persona.id`。
 *
 * 値の正は `db.ts`。
 */
const PERSONA_ID = {
  ai_a: "00000000-0000-4000-8000-000000000001",
  ai_b: "00000000-0000-4000-8000-000000000002",
};

const COMPOSED = {
  ai_a: toSystemPrompt(DEFAULT_PERSONA_SETTINGS.ai_a),
  ai_b: toSystemPrompt(DEFAULT_PERSONA_SETTINGS.ai_b),
};

describe("addDefaultPersonaConfigs", () => {
  it("同じコードでもう一度同期しても、版は増えない", async () => {
    const added = await db.addDefaultPersonaConfigs();

    expect(added).toEqual([]);
    expect(await listPersonaConfigRows()).toEqual([
      { persona_id: PERSONA_ID.ai_a, version: 1, system_prompt: COMPOSED.ai_a },
      { persona_id: PERSONA_ID.ai_b, version: 1, system_prompt: COMPOSED.ai_b },
    ]);
  });

  it("節の文言を変えたコードで同期すると次の版が足され、既存の版の全文は変わらない", async () => {
    const changed = {
      ai_a: {
        name: "具体さん",
        settings: {
          ...DEFAULT_PERSONA_SETTINGS.ai_a,
          description: "俳句で話す。",
        },
      },
      ai_b: { name: "抽象さん", settings: DEFAULT_PERSONA_SETTINGS.ai_b },
    };

    const added = await db.addDefaultPersonaConfigs(changed);

    expect(
      added.map(({ persona_id, version }) => ({ persona_id, version })),
    ).toEqual([{ persona_id: PERSONA_ID.ai_a, version: 2 }]);
    expect(await listPersonaConfigRows()).toEqual([
      { persona_id: PERSONA_ID.ai_a, version: 1, system_prompt: COMPOSED.ai_a },
      {
        persona_id: PERSONA_ID.ai_a,
        version: 2,
        system_prompt: toSystemPrompt(changed.ai_a.settings),
      },
      { persona_id: PERSONA_ID.ai_b, version: 1, system_prompt: COMPOSED.ai_b },
    ]);
  });

  it("システムのユーザーと既定の二体が無い DB で、それらと版 1 を作る", async () => {
    await deletePersonas();

    await db.addDefaultPersonaConfigs();

    expect(await countSystemUsers()).toBe(1);
    expect(await listPersonaConfigRows()).toEqual([
      { persona_id: PERSONA_ID.ai_a, version: 1, system_prompt: COMPOSED.ai_a },
      { persona_id: PERSONA_ID.ai_b, version: 1, system_prompt: COMPOSED.ai_b },
    ]);
  });

  it("移行の版 1 がある DB で、合成した全文の版 2 を足す", async () => {
    await deletePersonas();
    await createMigratedPersonas(
      [PERSONA_ID.ai_a, PERSONA_ID.ai_b],
      "移行の時点の全文",
    );

    await db.addDefaultPersonaConfigs();

    expect(await countSystemUsers()).toBe(1);
    expect(await listPersonaConfigRows()).toEqual([
      {
        persona_id: PERSONA_ID.ai_a,
        version: 1,
        system_prompt: "移行の時点の全文",
      },
      { persona_id: PERSONA_ID.ai_a, version: 2, system_prompt: COMPOSED.ai_a },
      {
        persona_id: PERSONA_ID.ai_b,
        version: 1,
        system_prompt: "移行の時点の全文",
      },
      { persona_id: PERSONA_ID.ai_b, version: 2, system_prompt: COMPOSED.ai_b },
    ]);
  });
});
