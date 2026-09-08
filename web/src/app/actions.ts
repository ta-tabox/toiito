"use server";

/**
 * 画面から呼ばれる Server Action の束。
 * フォーム入力を lib の呼び出しへ配線する。
 *
 * ここに判断を置かない（docs/HARNESS.md「テスト可能性の設計制約」）。
 * Server Action は単体テストから直に呼べないので、条件分岐が入り込んだ時点で検証の外へ出る。
 * 入力の受け取り・lib の呼び出し・再検証と遷移だけに留める。
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { addMemo, createQuestion, createSession } from "@/lib/db";
import { personaCalls, retryTurn, runTurn } from "@/lib/turn";

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

/** 発話を送って一往復を回す。 */
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
  await runTurn({ owner, questionId, sessionId, body, calls: personaCalls() });

  revalidatePath(`/q/${questionId}`);
}

/** `pending_messages` に残っている発話で、一往復をもう一度実行する。 */
export async function retryTurnAction(questionId: string, sessionId: string) {
  const owner = (await getCurrentUser()).id;
  await retryTurn({ owner, questionId, sessionId, calls: personaCalls() });

  revalidatePath(`/q/${questionId}`);
}

/**
 * 発話本文の一部にメモを付ける。
 *
 * アンカー（anchor_start / anchor_end）は呼び出し側が確定させたものを受け取る。
 * 本文中の位置を求めるのは DOM と `anchors.ts` の担当で、ここは数値を通すだけ。
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
