/**
 * 開発用シードとして入れる値の宣言。
 *
 * 投入の手順は持たない（手順は `db.ts` の `createQuestionWithTranscript` と `seed/index.ts` のステップ）。
 * `questions.ts` が答えるのは「何を入れるか」だけで、この形のまま増やしていく。
 *
 * エントリポイントは `SEED_INPUTS`（一人目）と `OTHER_USER_INPUT`（二人目）。
 * どちらも宣言（keyword ベース）から、範囲の埋まった投入の入力へ写したもの。
 * AI の発話は既定の二体の鍵で書き、版の id へ写すのは `withPersonaConfigIds` で、投入の直前に行う。
 * 誰が持つかを決めるのは `seed/index.ts` で、`questions.ts` は本文とメモだけを持つ。
 */

import { parseAnchor } from "@/lib/anchors";
import type { MemoInput, MessageInput, QuestionInput } from "@/lib/db";
import type { DefaultPersonaKey } from "@/lib/personas";
import type { QuestionStatus } from "@/lib/question";

/**
 * メモの宣言。
 *
 * 範囲は書かず、本文中の `keyword` の出現位置から求める（`toMemoInput`）。
 */
type MemoSeed = {
  keyword: string;
  note?: string;
};

/**
 * 発話の宣言。
 * AI の発話は、話す既定の二体の鍵（`speaker`）で書く。
 */
type MessageSeed = {
  speaker: "human" | DefaultPersonaKey;
  body: string;
  memos?: MemoSeed[];
};

/** currentForm と status は、既定（原型のまま・new）から動かすときだけ書く。 */
type QuestionSeed = {
  body: string;
  currentForm?: string;
  status?: QuestionStatus;
  messages: MessageSeed[];
};

/**
 * 入れる値の宣言。
 *
 * 三者対話の手触りを再現するため、人間 → 具体（`concrete`）→ 抽象（`abstract`）の順で数往復を置く。
 * 一件は言い直し済み（currentForm）、一件は new 以外の状態にして、一覧と対話画面が既定以外の見た目でも確かめられるようにする。
 */
const SEED_QUESTIONS: QuestionSeed[] = [
  {
    body: "速さを求めることは、何を失うことなのか",
    currentForm: "急ぐとき、私は問いのどこを削っているのか",
    status: "stocked",
    messages: [
      {
        speaker: "human",
        body: "急ぐほど問いが痩せる気がする。答えは早く出るのに、後から読み返すと何も残っていない。",
      },
      {
        speaker: "concrete",
        body: "「痩せた」と感じたのは、直近だとどの場面? そのとき出た答えを読み返して、具体的に何が足りなかった。",
        memos: [
          {
            keyword: "読み返して",
            note: "痩せたと気付くのは常に事後。書いている最中は分からない",
          },
        ],
      },
      {
        speaker: "abstract",
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
        speaker: "concrete",
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
        speaker: "concrete",
        body: "薄れなかった問いもあるはず。渡しても手元に残った問いと、渡した途端に消えた問いを、それぞれ一つ挙げるとどうなる。",
      },
      {
        speaker: "abstract",
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
        speaker: "abstract",
        body: "その後ろめたさは、問いを手放したことにではなく、耐えるべきものを避けたという前提に向いている。その前提自体は検討したことがあるか。",
        memos: [{ keyword: "耐えるべきもの" }],
      },
    ],
  },
  {
    body: "毎日書くことは、なぜ続かないのか",
    status: "holding",
    messages: [
      {
        speaker: "human",
        body: "三日は書ける。四日目に、書くほどのことが今日は無い、と思って止まる。",
      },
      {
        speaker: "concrete",
        body: "止まった四日目に、実際は何があった。前日と比べて減っていたのは時間か、材料か、それとも書いたものを読む相手か。",
        memos: [
          {
            keyword: "書いたものを読む相手",
            note: "続かない理由を意志の問題にしていたが、宛先の有無かもしれない",
          },
        ],
      },
      {
        speaker: "abstract",
        body: "「書くほどのこと」という基準が、書く前に立っているのが効いている。記録は出来事の後に来るが、基準は前に来る——この順序が逆なら、四日目にも書けるはず。",
      },
    ],
  },
];

/**
 * 宣言したメモを、範囲付きの入力へ写す。
 * 範囲の単位は JS の string index（UTF-16 code unit）で、anchors.ts と揃える。
 * 本文に `keyword` が無ければ throw する。
 *
 * オフセットを直書きすると、本文を一文字直すたびに全部ずれる。
 * ずれたまま投入すると、UI では無関係な語に下線が付く。
 */
function toMemoInput(body: string, memoSeed: MemoSeed): MemoInput {
  const start = body.indexOf(memoSeed.keyword);

  if (start < 0) {
    throw new Error(`シードのキーワードが本文に無い: ${memoSeed.keyword}`);
  }

  return {
    anchor: parseAnchor(start, start + memoSeed.keyword.length),
    keyword: memoSeed.keyword,
    note: memoSeed.note,
  };
}

/**
 * 投入の入力のうち、AI の発話が版の id でなく既定の二体の鍵（`speaker`）を持つもの。
 * 版の id は投入先の DB で決まるので、`withPersonaConfigIds` が投入の直前に写す。
 */
export type SeedQuestionInput = Omit<QuestionInput, "messages"> & {
  messages: (Omit<MessageSeed, "memos"> & { memos?: MemoInput[] })[];
};

/** 宣言した問いを、メモの範囲まで埋めた入力へ写す。 */
function toQuestionInput(questionSeed: QuestionSeed): SeedQuestionInput {
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

/** 入力（`input`）の AI の発話の鍵を、既定の二体の版の id（`configIds`）へ写した投入の入力を返す。 */
export function withPersonaConfigIds(
  input: SeedQuestionInput,
  configIds: Record<DefaultPersonaKey, string>,
): QuestionInput {
  const messages = input.messages.map(
    ({ speaker, body, memos }): MessageInput =>
      speaker === "human"
        ? { speaker, body, memos }
        : {
            speaker: "ai",
            body,
            persona_config_id: configIds[speaker],
            memos,
          },
  );

  return { ...input, messages };
}

/**
 * 一人目へ投入する入力。
 * 宣言から写した形で、メモの範囲まで埋まっている。
 *
 * 写しを読み込み時に済ませるのは、キーワードの書き誤りを投入前に throw するため。
 */
export const SEED_INPUTS: SeedQuestionInput[] =
  SEED_QUESTIONS.map(toQuestionInput);

/**
 * 二人目が持つ問いの宣言。
 *
 * 所有権の絞り込みが抜けたことを画面から見えるようにするために置く。
 * 一人目で開いた一覧・逆引き・対話画面のどれかに `OTHER_USER_INPUT` の問いが出たら、repo 関数の絞り込みが効いていない。
 */
const OTHER_USER_QUESTION: QuestionSeed = {
  body: "他人の問いは、私の一覧に出てはいけない",
  messages: [
    {
      speaker: "human",
      body: "この発話は二人目のものなので、一人目の画面には現れない。",
      memos: [{ keyword: "二人目" }],
    },
  ],
};

/** 二人目へ投入する入力。 */
export const OTHER_USER_INPUT: SeedQuestionInput =
  toQuestionInput(OTHER_USER_QUESTION);
