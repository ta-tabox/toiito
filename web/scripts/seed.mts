/**
 * 開発用データの投入。
 *
 * 問い・対話・メモを一式入れて、UI を手触りで確かめられる状態にする。
 * このファイルが持つのは入れる値の定義と入口の二つだけで、投入の手順は db.ts の createQuestionWithTranscript が持つ。アプリと同じ経路を通らない投入口を増やさないため。
 * 接続先は DATABASE_URL 一点で、db.ts が読む。投入先を選ぶ引数はここに作らない——渡し口を二つ持つと、env は開発用・引数はテスト用という食い違いが起こる。
 * 動くのは問いが一件も無い DB に対してだけで、既に入っている DB へは何も入れずに終わる。
 *
 * 入口は seed。CLI は node scripts/seed.mts（pnpm seed）。
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MemoInput, QuestionInput } from "@/lib/db";
import type { QuestionStatus } from "@/lib/question";
import type { Speaker } from "@/lib/types";

/**
 * db.ts の repo 関数一式。
 *
 * 実体の読み込みは seed の中まで遅らせる（理由は registerSrcAlias）。
 */
type Repo = typeof import("@/lib/db");

/**
 * メモの宣言。
 *
 * 範囲は書かず、本文中の keyword の出現位置から引く（toQuestionInput）。
 */
type MemoSeed = {
  keyword: string;
  note?: string;
};

type MessageSeed = {
  speaker: Speaker;
  body: string;
  memos?: MemoSeed[];
};

/** currentForm と status は、既定（原型のまま・composting）から動かすときだけ書く。 */
type QuestionSeed = {
  body: string;
  currentForm?: string;
  status?: QuestionStatus;
  messages: MessageSeed[];
};

/**
 * 投入した内容。
 *
 * 問いだけ件数でなく id を返すのは、投入分を後から引けるようにするため。同じ DB を他の書き手（並行するテスト）と共有していても、これがあれば取り違えない。
 */
export type SeedSummary = {
  questionIds: string[];
  messages: number;
  memos: number;
};

/**
 * 入れる値の宣言。
 *
 * 三者対話の手触りを再現するため、人間 → ai_a（具体）→ ai_b（抽象）の順で数往復を置く。
 * 一件は言い直し済み（currentForm）、一件は composting 以外の状態にして、一覧と対話画面が既定以外の見た目でも確かめられるようにする。
 */
const SEED_QUESTIONS: QuestionSeed[] = [
  {
    body: "速さを求めることは、何を失うことなのか",
    currentForm: "急ぐとき、私は問いのどこを削っているのか",
    status: "fermented",
    messages: [
      {
        speaker: "human",
        body: "急ぐほど問いが痩せる気がする。答えは早く出るのに、後から読み返すと何も残っていない。",
      },
      {
        speaker: "ai_a",
        body: "「痩せた」と感じたのは、直近だとどの場面? そのとき出た答えを読み返して、具体的に何が足りなかった。",
        memos: [
          {
            keyword: "読み返して",
            note: "痩せたと気付くのは常に事後。書いている最中は分からない",
          },
        ],
      },
      {
        speaker: "ai_b",
        body: "速さと深さの対立に見えるが、一つの語に二つの操作が潰れていないか。「早く答えを出す」と「早く問いを閉じる」は別のはずで、痩せるのは後者のときだけかもしれない。",
        memos: [
          {
            keyword: "早く問いを閉じる",
            note: "失っているのは時間ではなく、開いたままにしておく余地の方",
          },
        ],
      },
      {
        speaker: "human",
        body: "たしかに、出すのが早いことより、閉じるのが早いことの方が痛い気がする。",
      },
      {
        speaker: "ai_a",
        body: "では閉じた合図は何だった。腑に落ちた感覚か、締切か、それとも相手が納得した顔をしたことか。",
        memos: [{ keyword: "閉じた合図" }],
      },
    ],
  },
  {
    body: "AI に問いを渡すとき、私は何を手放しているのか",
    messages: [
      {
        speaker: "human",
        body: "調べ物は速くなった。ただ、渡した瞬間に自分がその問いを持っていた感じが薄れる。",
      },
      {
        speaker: "ai_a",
        body: "薄れなかった問いもあるはず。渡しても手元に残った問いと、渡した途端に消えた問いを、それぞれ一つ挙げるとどうなる。",
      },
      {
        speaker: "ai_b",
        body: "手放しているのは答えを出す作業ではなく、答えが出ないまま抱えている時間の方ではないか。だとすると、速さは副作用で、失っているのは滞留そのものになる。",
        memos: [
          {
            keyword: "滞留",
            note: "発酵に要るのは材料ではなく時間、という筋。コンポスターの比喩とつながる",
          },
        ],
      },
      {
        speaker: "human",
        body: "抱えている時間を短くしたくて渡している面もある。そこが後ろめたい。",
      },
      {
        speaker: "ai_b",
        body: "その後ろめたさは、問いを手放したことにではなく、耐えるべきものを避けたという前提に向いている。その前提自体は検討したことがあるか。",
        memos: [{ keyword: "耐えるべきもの" }],
      },
    ],
  },
  {
    body: "毎日書くことは、なぜ続かないのか",
    status: "open",
    messages: [
      {
        speaker: "human",
        body: "三日は書ける。四日目に、書くほどのことが今日は無い、と思って止まる。",
      },
      {
        speaker: "ai_a",
        body: "止まった四日目に、実際は何があった。前日と比べて減っていたのは時間か、材料か、それとも書いたものを読む相手か。",
        memos: [
          {
            keyword: "書いたものを読む相手",
            note: "続かない理由を意志の問題にしていたが、宛先の有無かもしれない",
          },
        ],
      },
      {
        speaker: "ai_b",
        body: "「書くほどのこと」という基準が、書く前に立っているのが効いている。記録は出来事の後に来るが、基準は前に来る——この順序が逆なら、四日目にも書けるはず。",
      },
    ],
  },
];

/** `@` が指す先。 */
const srcDir = path.resolve(import.meta.dirname, "../src");

/**
 * `@/…` を実ファイルへ当てるときに試す綴り。
 *
 * node は拡張子を補わないので、拡張子なしで綴られた src 側に .ts を当てる。空文字の側は、綴りに拡張子が既に付いている場合。
 */
const ALIAS_CANDIDATE_SUFFIXES = ["", ".ts"];

/**
 * .ts の解決結果に ESM だと明示する。
 *
 * package.json に type が無いため、node は .ts を読んでから ESM だと判り直し、走らせるたびに MODULE_TYPELESS_PACKAGE_JSON を出す。形式はここで名指しておく。
 */
function asTypeScriptModule<T extends { url: string; format?: string | null }>(
  resolved: T,
): T {
  if (!resolved.url.endsWith(".ts") || resolved.format) {
    return resolved;
  }

  return { ...resolved, format: "module-typescript" };
}

/**
 * `@/` を src へ向ける解決フックを node に登録する。
 *
 * `@/` は tsc と vite のエイリアスで、素の ESM 解決には無い。node へ直接食わせるのはこのスクリプトだけなので、対応もここだけが持つ。
 * 静的 import は本体より先に解決されるため、db.ts の読み込みは登録後の動的 import へ回してある。
 */
function registerSrcAlias(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith("@/")) {
        return asTypeScriptModule(nextResolve(specifier, context));
      }

      const base = path.join(srcDir, specifier.slice("@/".length));
      const resolved = ALIAS_CANDIDATE_SUFFIXES.map(
        (suffix) => `${base}${suffix}`,
      ).find((candidate) => existsSync(candidate));

      if (resolved === undefined) {
        throw new Error(`@ エイリアスを解決できない: ${specifier}`);
      }

      return asTypeScriptModule({
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      });
    },
  });
}

/**
 * 宣言したメモを、範囲付きの入力へ写す。
 *
 * オフセットを直書きすると本文を一文字直すたびに全部ずれる。単位は JS の string index（UTF-16 code unit）で、anchors.ts と揃える。
 * 本文に keyword が無ければ落とす。ずれたまま投入すると、UI では無関係な語に下線が付く。
 */
function toMemoInput(body: string, memoSeed: MemoSeed): MemoInput {
  const start = body.indexOf(memoSeed.keyword);

  if (start < 0) {
    throw new Error(`シードのキーワードが本文に無い: ${memoSeed.keyword}`);
  }

  return {
    anchorStart: start,
    anchorEnd: start + memoSeed.keyword.length,
    keyword: memoSeed.keyword,
    note: memoSeed.note,
  };
}

/** 宣言した問いを、投入の入力へ写す。 */
function toQuestionInput(questionSeed: QuestionSeed): QuestionInput {
  return {
    ...questionSeed,
    messages: questionSeed.messages.map((messageSeed) => ({
      speaker: messageSeed.speaker,
      body: messageSeed.body,
      memos: messageSeed.memos?.map((memoSeed) =>
        toMemoInput(messageSeed.body, memoSeed),
      ),
    })),
  };
}

/**
 * 投入する入力。宣言から写した形で、メモの範囲まで埋まっている。
 *
 * 写しを読み込み時に済ませるのは、キーワードの綴り誤りを投入前に落とすため。
 */
export const SEED_INPUTS: QuestionInput[] = SEED_QUESTIONS.map(toQuestionInput);

/**
 * シードを投入する。接続先は DATABASE_URL。
 *
 * 問いが既にある DB へは何も入れずに戻る。投入先の取り違えを、行が増えてから気付く形にしないため。
 * 接続は閉じない。呼び出し側（CLI・テスト）が自分の都合で閉じる。
 */
export async function seed(): Promise<SeedSummary> {
  const repo: Repo = await import("@/lib/db");
  const summary: SeedSummary = { questionIds: [], messages: 0, memos: 0 };

  try {
    const existing = await repo.listQuestions();

    if (existing.length > 0) {
      console.warn(
        `既に問いが ${existing.length} 件ある DB なので、何も入れずに終わる。空の DB へ入れるか、投入先（DATABASE_URL）を確かめる`,
      );

      return summary;
    }

    for (const input of SEED_INPUTS) {
      const created = await repo.createQuestionWithTranscript(input);

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
 * 投入先を先に告げ、投入し、結果を報告して接続を閉じる。接続先を最初に出すのは、開発用と検証用の取り違えに投入前に気付けるようにするため。
 */
async function main(): Promise<void> {
  registerSrcAlias();

  console.log(`接続先: ${databaseName()}`);

  const summary = await seed();

  // 何も入れなかったときは seed 側が理由を言っている。件数ゼロを重ねて報告しない。
  if (summary.questionIds.length > 0) {
    console.log(
      `投入した: 問い ${summary.questionIds.length} 件 / 発話 ${summary.messages} 件 / メモ ${summary.memos} 件`,
    );
  }

  const { disconnect } = await import("@/lib/db");
  await disconnect();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
