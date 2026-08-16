/**
 * SQLite 時代の対話ログを Postgres へ一度だけ移すスクリプト。
 *
 *     node scripts/import-sqlite-data.ts [path/to/toiito.db]
 *
 * 冪等ではない。二度流せば主キー衝突で落ちる——それが正しい（黙って重複させない）。
 * 実行前に SQLite ファイルのバックアップを取ること。
 *
 * node:sqlite に依存しているのはここだけで、アプリ側（src/）からは撤去済み。
 * import が `@` 起点でなく相対なのは、このファイルを node が直接読む（型剥がし実行）ため。
 * `@` はバンドラと vitest のエイリアスで、素の ESM 解決では辿れない。
 */

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { isQuestionStatus } from "../src/lib/question.ts";

type SqliteQuestion = {
  id: string;
  body: string;
  current_form: string | null;
  status: string;
  created_at: string;
};
type SqliteSession = { id: string; question_id: string; started_at: string };
type SqliteMessage = {
  id: string;
  session_id: string;
  speaker: string;
  body: string;
  created_at: string;
};
type SqliteMemo = {
  id: string;
  message_id: string;
  anchor_start: number;
  anchor_end: number;
  keyword: string;
  note: string | null;
  created_at: string;
};

const SPEAKERS = ["human", "ai_a", "ai_b"] as const;
type Speaker = (typeof SPEAKERS)[number];

// SQLite の datetime('now') は UTC の "YYYY-MM-DD HH:MM:SS"。
// タイムゾーンの無い綴りをそのまま Date へ渡すとローカル時刻と解釈され、堆積の時系列が 9 時間ずれる。
function toDate(sqliteTimestamp: string): Date {
  const at = new Date(`${sqliteTimestamp.replace(" ", "T")}Z`);

  if (Number.isNaN(at.getTime())) {
    throw new Error(`読めない時刻: ${sqliteTimestamp}`);
  }

  return at;
}

function toSpeaker(value: string): Speaker {
  if (!(SPEAKERS as readonly string[]).includes(value)) {
    throw new Error(`未知の speaker: ${value}`);
  }

  return value as Speaker;
}

function readSqlite(dbPath: string) {
  const sqlite = new DatabaseSync(dbPath, { readOnly: true });

  try {
    return {
      questions: sqlite
        .prepare("select * from questions order by created_at")
        .all() as SqliteQuestion[],
      sessions: sqlite
        .prepare("select * from sessions order by started_at")
        .all() as SqliteSession[],
      messages: sqlite
        .prepare("select * from messages order by created_at")
        .all() as SqliteMessage[],
      memos: sqlite
        .prepare("select * from memos order by created_at")
        .all() as SqliteMemo[],
    };
  } finally {
    sqlite.close();
  }
}

async function main(): Promise<void> {
  const dbPath = path.resolve(
    process.argv[2] ??
      path.join(import.meta.dirname, "..", "data", "toiito.db"),
  );
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL が未設定");
  }

  const source = readSqlite(dbPath);
  console.log(
    `読み込み: ${dbPath}`,
    Object.fromEntries(
      Object.entries(source).map(([k, rows]) => [k, rows.length]),
    ),
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    // 全部入るか一つも入らないか。途中まで入った DB は、どこまで移したか分からず手に負えない。
    await prisma.$transaction(async (tx) => {
      for (const q of source.questions) {
        if (!isQuestionStatus(q.status)) {
          throw new Error(`未知の status: ${q.status}（問い ${q.id}）`);
        }

        await tx.question.create({
          data: {
            id: q.id,
            body: q.body,
            current_form: q.current_form,
            status: q.status,
            created_at: toDate(q.created_at),
          },
        });
      }

      for (const s of source.sessions) {
        await tx.session.create({
          data: {
            id: s.id,
            question_id: s.question_id,
            started_at: toDate(s.started_at),
          },
        });
      }

      for (const m of source.messages) {
        await tx.message.create({
          data: {
            id: m.id,
            session_id: m.session_id,
            speaker: toSpeaker(m.speaker),
            body: m.body,
            created_at: toDate(m.created_at),
          },
        });
      }

      for (const m of source.memos) {
        await tx.memo.create({
          data: {
            id: m.id,
            message_id: m.message_id,
            anchor_start: m.anchor_start,
            anchor_end: m.anchor_end,
            keyword: m.keyword,
            note: m.note,
            created_at: toDate(m.created_at),
          },
        });
      }
    });

    console.log("移送完了");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
