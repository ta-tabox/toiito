import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@/lib/db";

// `create table if not exists` は既存テーブルを触らないので、列や check の追加は
// 既存 DB へ届かない。人間の手元には S0 実機確認のデータが入っているため、
// 旧スキーマの DB を落とさず移送できることを機械で保証する。
// （テストファイルは vitest が個別に隔離するので、db.test.ts とパスが衝突しない）

let db: typeof DbModule;
const dbFile = path.join(
  mkdtempSync(path.join(tmpdir(), "toiito-migrate-")),
  "old.db",
);

beforeAll(async () => {
  // 旧スキーマ（current_form 無し・status は3値）を素の SQLite で作る
  const raw = new DatabaseSync(dbFile);
  raw.exec(`
    create table questions (
      id         text primary key,
      body       text not null,
      status     text not null default 'composting'
                 check (status in ('composting', 'fermented', 'closed')),
      created_at text not null default (datetime('now'))
    );
    insert into questions (id, body, status) values
      ('q-old-1', '旧データの問い', 'composting'),
      ('q-old-2', '閉じられていた問い', 'closed');
  `);
  raw.close();

  process.env.TOIITO_DB_PATH = dbFile;
  db = await import("@/lib/db");
});

describe("旧スキーマからの移送", () => {
  it("既存の行を落とさない", () => {
    expect(db.getQuestion("q-old-1")?.body).toBe("旧データの問い");
    expect(db.listQuestions().length).toBe(2);
  });

  it("current_form 列が生え、既存行は null で埋まる", () => {
    expect(db.getQuestion("q-old-1")?.current_form).toBeNull();
    expect(db.questionText(db.getQuestion("q-old-1")!)).toBe("旧データの問い");
  });

  it("廃止された closed は promoted へ寄せる", () => {
    expect(db.getQuestion("q-old-2")?.status).toBe("promoted");
  });

  it("移送後は新しい値域が使える", () => {
    expect(db.setQuestionStatus("q-old-1", "perennial")?.status).toBe(
      "perennial",
    );
  });

  it("移送済みの DB では作り直しが走らない（冪等）", () => {
    const reopened = new DatabaseSync(dbFile);
    const cols = (
      reopened.prepare("pragma table_info(questions)").all() as {
        name: string;
      }[]
    ).map((c) => c.name);
    reopened.close();

    expect(cols).toContain("current_form");
    // 作業テーブルが残っていない = rename まで完了している
    expect(cols).not.toContain("questions_new");
    expect(new Set(db.listQuestions().map((q) => q.id))).toEqual(
      new Set(["q-old-1", "q-old-2"]),
    );
  });
});
