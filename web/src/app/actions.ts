"use server";

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

export async function createQuestionAction(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const { question } = createQuestion(body);
  redirect(`/q/${question.id}`);
}

export async function newSessionAction(questionId: string) {
  createSession(questionId);
  revalidatePath(`/q/${questionId}`);
}

// 人間の発話 → ai_a（具体）→ ai_b（抽象）の逐次呼び出し。
// 並列にしない: ai_b は ai_a への応答であることに意味がある（衝突と転位）。
export async function speakAction(
  questionId: string,
  sessionId: string,
  formData: FormData,
) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const question = getQuestion(questionId);
  if (!question) throw new Error("問いが見つからない");

  addMessage(sessionId, "human", body);

  const aiA = await callPersona(
    loadPersona("ai_a"),
    question,
    listMessages(sessionId),
  );
  addMessage(sessionId, "ai_a", aiA);

  const aiB = await callPersona(
    loadPersona("ai_b"),
    question,
    listMessages(sessionId),
  );
  addMessage(sessionId, "ai_b", aiB);

  revalidatePath(`/q/${questionId}`);
}
