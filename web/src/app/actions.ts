"use server";

/**
 * 画面から呼ばれる Server Action の束。
 * フォーム入力を lib の呼び出しへ配線する。
 *
 * ここに判断を置かない（HARNESS.md「テスト可能性の設計制約」）。
 * Server Action は単体テストから直に呼べないので、条件分岐が入り込んだ時点で検証の外へ出る。
 * 入力の受け取り・lib の呼び出し・再検証と遷移だけに留める。
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callPersona } from "@/lib/ai";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { getCurrentUser } from "@/lib/current-user";
import {
  addMemo,
  addMessage,
  createQuestion,
  createSession,
  getQuestion,
  listMessages,
} from "@/lib/db";
import { loadPersona } from "@/lib/personas";

/** 問いを投入し、その対話画面へ送る。 */
export async function createQuestionAction(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return;
  }
  const owner = (await getCurrentUser()).id;
  const { question } = await createQuestion(owner, body);
  redirect(`/q/${question.id}`);
}

/**
 * 同じ問いを新しいセッションで再訪する。
 * 過去のセッションは残る。
 */
export async function newSessionAction(questionId: string) {
  await createSession((await getCurrentUser()).id, questionId);
  revalidatePath(`/q/${questionId}`);
}

/**
 * 人間の発話 → ai_a（具体）→ ai_b（抽象）の逐次呼び出し。
 * 並列にしない: ai_b は ai_a への応答であることに意味がある（衝突と転位）。
 */
export async function speakAction(
  questionId: string,
  sessionId: string,
  formData: FormData,
) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return;
  }

  const owner = (await getCurrentUser()).id;
  const question = await getQuestion(owner, questionId);
  if (!question) {
    throw new Error("問いが見つからない");
  }

  await addMessage(owner, sessionId, "human", body);

  const aiA = await callPersona(
    {
      id: "ai_a",
      prompt: loadPersona("ai_a"),
      provider: AI_PROVIDERS.concrete,
    },
    question,
    await listMessages(owner, sessionId),
  );
  await addMessage(owner, sessionId, "ai_a", aiA);

  const aiB = await callPersona(
    {
      id: "ai_b",
      prompt: loadPersona("ai_b"),
      provider: AI_PROVIDERS.abstract,
    },
    question,
    await listMessages(owner, sessionId),
  );
  await addMessage(owner, sessionId, "ai_b", aiB);

  revalidatePath(`/q/${questionId}`);
}

/**
 * 発話本文の一部にメモを付ける。
 *
 * アンカー（anchor_start / anchor_end）は呼び出し側が確定させたものを受け取る。
 * 本文中の位置を求めるのは DOM と anchors.ts の領分で、ここは数値を通すだけ。
 */
export async function createMemoAction(questionId: string, formData: FormData) {
  const keyword = String(formData.get("keyword") ?? "").trim();
  if (!keyword) {
    return;
  }

  const messageId = String(formData.get("message_id") ?? "");
  const anchorStart = Number(formData.get("anchor_start"));
  const anchorEnd = Number(formData.get("anchor_end"));
  const note = String(formData.get("note") ?? "").trim();

  await addMemo(
    (await getCurrentUser()).id,
    messageId,
    anchorStart,
    anchorEnd,
    keyword,
    note || undefined,
  );

  revalidatePath(`/q/${questionId}`);
}
