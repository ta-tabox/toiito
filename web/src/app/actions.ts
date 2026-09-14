"use server";

/**
 * 画面から呼ばれる Server Action の束。
 * フォーム入力を lib の呼び出しへ配線する。
 *
 * Server Action に判断を置かない（`.claude/rules/layers.md`「層と、import してよい相手」）。
 * Server Action は単体テストから直に呼べないので、条件分岐が入り込んだ時点で検証の外へ出る。
 * 入力の受け取り・lib の呼び出し・再検証と遷移だけに留める。
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAnchor } from "@/lib/anchors";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { LOGIN_PATH } from "@/lib/auth/protected-paths";
import {
  signInAsFakeUser,
  signOutCurrentUser,
  startGoogleSignIn,
} from "@/lib/auth/sign-in";
import { addMemo, createQuestion, createSession } from "@/lib/db";
import { personaCalls, retryTurn, runTurn } from "@/lib/turn";

/**
 * 対話画面のルートの型。
 *
 * 発話とメモの action は問いの id を受け取らないので、再検証は個々の URL でなくこの型で指す。
 */
const QUESTION_PAGE_ROUTE = "/q/[id]";

/** 問いを投入し、その対話画面へ送る。 */
export async function createQuestionAction(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return;
  }
  const { id: owner } = await requireCurrentUser();
  const { question } = await createQuestion(owner, body);
  redirect(`/q/${question.id}`);
}

/**
 * 同じ問いを新しいセッションで再訪する。
 * 過去のセッションは残る。
 */
export async function newSessionAction(questionId: string) {
  const { id: owner } = await requireCurrentUser();
  await createSession(owner, questionId);
  revalidatePath(`/q/${questionId}`);
}

/** 発話を送って一往復を回す。 */
export async function speakAction(sessionId: string, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return;
  }

  const { id: owner } = await requireCurrentUser();
  await runTurn({ owner, sessionId, body, calls: personaCalls() });

  revalidatePath(QUESTION_PAGE_ROUTE, "page");
}

/** `pending_messages` に残っている発話で、一往復をもう一度実行する。 */
export async function retryTurnAction(sessionId: string) {
  const { id: owner } = await requireCurrentUser();
  await retryTurn({ owner, sessionId, calls: personaCalls() });

  revalidatePath(QUESTION_PAGE_ROUTE, "page");
}

/**
 * 発話本文の一部にメモを付ける。
 *
 * アンカー（anchor_start / anchor_end）は呼び出し側が確定させたものを受け取る。
 * 本文中の位置を求めるのは DOM と `anchors.ts` の担当で、`createMemoAction` はフォームの数値を `parseAnchor` に通すだけ。
 */
export async function createMemoAction(formData: FormData) {
  const keyword = String(formData.get("keyword") ?? "").trim();
  if (!keyword) {
    return;
  }

  const messageId = String(formData.get("message_id") ?? "");
  const anchor = parseAnchor(
    Number(formData.get("anchor_start")),
    Number(formData.get("anchor_end")),
  );
  const note = String(formData.get("note") ?? "").trim();

  const { id: owner } = await requireCurrentUser();
  await addMemo(owner, messageId, { anchor, keyword, note: note || undefined });

  revalidatePath(QUESTION_PAGE_ROUTE, "page");
}

/** Google の同意画面へ送る。 */
export async function signInWithGoogleAction() {
  const url = await startGoogleSignIn();
  redirect(url);
}

/**
 * Google を経ずに、フォームが指す email のユーザーとしてサインインする。
 * `TOIITO_FAKE_LOGIN=1` の環境でだけ成功する。
 */
export async function signInAsFakeUserAction(formData: FormData) {
  await signInAsFakeUser(String(formData.get("email") ?? ""));
  redirect("/");
}

/** サインアウトしてサインインの画面へ送る。 */
export async function signOutAction() {
  await signOutCurrentUser();
  redirect(LOGIN_PATH);
}
