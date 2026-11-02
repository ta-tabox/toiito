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
import {
  DEFAULT_PERSONA_SETTINGS,
  DEFAULT_PERSONA_IDS as PERSONA_ID,
  toSystemPrompt,
} from "@/lib/personas";

afterAll(async () => {
  await db.disconnect();
});

const COMPOSED = {
  concrete: toSystemPrompt(DEFAULT_PERSONA_SETTINGS.concrete),
  abstract: toSystemPrompt(DEFAULT_PERSONA_SETTINGS.abstract),
};

describe("addDefaultPersonaConfigs", () => {
  it("同じコードでもう一度同期しても、版は増えない", async () => {
    const added = await db.addDefaultPersonaConfigs();

    expect(added).toEqual([]);
    expect(await listPersonaConfigRows()).toEqual([
      {
        persona_id: PERSONA_ID.concrete,
        version: 1,
        system_prompt: COMPOSED.concrete,
      },
      {
        persona_id: PERSONA_ID.abstract,
        version: 1,
        system_prompt: COMPOSED.abstract,
      },
    ]);
  });

  it("節の文言を変えたコードで同期すると次の版が足され、既存の版の全文は変わらない", async () => {
    const changed = {
      concrete: {
        name: "具体さん",
        settings: {
          ...DEFAULT_PERSONA_SETTINGS.concrete,
          description: "俳句で話す。",
        },
      },
      abstract: {
        name: "抽象さん",
        settings: DEFAULT_PERSONA_SETTINGS.abstract,
      },
    };

    const added = await db.addDefaultPersonaConfigs(changed);

    expect(
      added.map(({ persona_id, version }) => ({ persona_id, version })),
    ).toEqual([{ persona_id: PERSONA_ID.concrete, version: 2 }]);
    expect(await listPersonaConfigRows()).toEqual([
      {
        persona_id: PERSONA_ID.concrete,
        version: 1,
        system_prompt: COMPOSED.concrete,
      },
      {
        persona_id: PERSONA_ID.concrete,
        version: 2,
        system_prompt: toSystemPrompt(changed.concrete.settings),
      },
      {
        persona_id: PERSONA_ID.abstract,
        version: 1,
        system_prompt: COMPOSED.abstract,
      },
    ]);
  });

  it("システムのユーザーと既定の二体が無い DB で、それらと版 1 を作る", async () => {
    await deletePersonas();

    await db.addDefaultPersonaConfigs();

    expect(await countSystemUsers()).toBe(1);
    expect(await listPersonaConfigRows()).toEqual([
      {
        persona_id: PERSONA_ID.concrete,
        version: 1,
        system_prompt: COMPOSED.concrete,
      },
      {
        persona_id: PERSONA_ID.abstract,
        version: 1,
        system_prompt: COMPOSED.abstract,
      },
    ]);
  });

  it("移行の版 1 がある DB で、合成した全文の版 2 を足す", async () => {
    await deletePersonas();
    await createMigratedPersonas(
      [PERSONA_ID.concrete, PERSONA_ID.abstract],
      "移行の時点の全文",
    );

    await db.addDefaultPersonaConfigs();

    expect(await countSystemUsers()).toBe(1);
    expect(await listPersonaConfigRows()).toEqual([
      {
        persona_id: PERSONA_ID.concrete,
        version: 1,
        system_prompt: "移行の時点の全文",
      },
      {
        persona_id: PERSONA_ID.concrete,
        version: 2,
        system_prompt: COMPOSED.concrete,
      },
      {
        persona_id: PERSONA_ID.abstract,
        version: 1,
        system_prompt: "移行の時点の全文",
      },
      {
        persona_id: PERSONA_ID.abstract,
        version: 2,
        system_prompt: COMPOSED.abstract,
      },
    ]);
  });
});
