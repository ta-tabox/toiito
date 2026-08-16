"use server";

/**
 * 画面から呼ばれる Server Action の束。フォーム入力を lib の呼び出しへ配線する。
 *
 * ここに判断を置かない（HARNESS.md「テスト可能性の設計制約」）。
 * Server Action は単体テストから直に呼べないので、条件分岐が入り込んだ時点で検証の外へ出る。
 * 入力の受け取り・lib の呼び出し・再検証と遷移だけに留める。
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callPersona } from "@/lib/claude";
import {
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
  if (!body) return;
  const { question } = await createQuestion(body);
  redirect(`/q/${question.id}`);
}

/** 同じ問いを新しいセッションで再訪する。過去のセッションは残る。 */
export async function newSessionAction(questionId: string) {
  await createSession(questionId);
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
  if (!body) return;

  const question = await getQuestion(questionId);
  if (!question) throw new Error("問いが見つからない");

  await addMessage(sessionId, "human", body);

  const aiA = await callPersona(
    loadPersona("ai_a"),
    question,
    await listMessages(sessionId),
  );
  await addMessage(sessionId, "ai_a", aiA);

  const aiB = await callPersona(
    loadPersona("ai_b"),
    question,
    await listMessages(sessionId),
  );
  await addMessage(sessionId, "ai_b", aiB);

  revalidatePath(`/q/${questionId}`);
}
