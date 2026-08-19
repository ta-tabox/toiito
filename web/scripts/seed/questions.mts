/**
 * 開発用シードとして入れる値の宣言。
 *
 * 投入の手順は持たない（それは db.ts の createQuestionWithTranscript と seed.mts のステップ）。
 * ここが答えるのは「何を入れるか」だけで、この形のまま増やしていく。
 *
 * 入口は SEED_INPUTS。宣言（keyword ベース）から、範囲の埋まった投入の入力へ写したもの。
 */

import type { MemoInput, QuestionInput } from "@/lib/db";
import type { QuestionStatus } from "@/lib/question";
import type { Speaker } from "@/lib/types";

/**
 * メモの宣言。
 *
 * 範囲は書かず、本文中の keyword の出現位置から引く（toMemoInput）。
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
