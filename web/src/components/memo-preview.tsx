"use client";

/**
 * 下線に触れているあいだメモを覗ける枠と、その枠を出すかどうかの切り替え。
 *
 * どの区間にどのメモが付いているかは呼び出し側（`message-body.tsx`）が決め、`MemoPreview` は渡されたメモを整形して置くだけである。
 * 設定は localStorage に持つ。
 * 読む側の道具の設定であってメモの内容ではないので、サーバーへ送らない。
 *
 * 枠は二つとも `document.body` へ portal する。
 * 発話の本文の中へ置くと、メモを作るための選択にこの枠の文字が入り、アンカーのオフセットがずれる。
 */

import {
  type CSSProperties,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { Memo } from "@/lib/types";

/**
 * 覗き見の枠を出すかどうかの保存先。
 * 値が "off" のときだけ枠を出さない。
 */
const PREVIEW_STORAGE_KEY = "toiito:memo-preview";

/**
 * 覗き見の枠の最大幅（px）。
 * 下線の左端から右へ広げる幅の上限で、枠を画面の内側へ丸めるときの基準にもなる。
 */
const PREVIEW_MAX_WIDTH = 288;

/** 覗き見の枠と、下線・画面の縁との間隔（px）。 */
const PREVIEW_GAP = 8;

/**
 * メモの覗き見。
 * `anchor` が指す矩形（下線の位置）の近くへ、`memos` のキーワードとノートを置く。
 *
 * 設定が「出さない」なら何も描かない。
 */
export function MemoPreview({
  id,
  memos,
  anchor,
}: {
  id: string;
  memos: Memo[];
  anchor: DOMRect;
}) {
  const isEnabled = useMemoPreviewEnabled();

  if (!isEnabled) {
    return null;
  }

  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={positionNear(anchor)}
      className="pointer-events-none fixed z-10 rounded border border-rule bg-surface-mid p-3 text-aux shadow-[0_0_16px_rgba(0,0,0,0.12)]"
    >
      <ul className="flex flex-col gap-2">
        {memos.map((memo) => (
          <li key={memo.id}>
            <p className="font-bold">{memo.keyword}</p>
            {memo.note && <p className="mt-1 text-ink-weak">{memo.note}</p>}
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

/**
 * 覗き見の枠を出すかどうかの切り替え。
 * 画面の右下に小さく置き、押すたびに設定を反転させる。
 *
 * 発話の数だけ mount されるが、描くのは最初の一つだけである。
 * hover を持たない環境では描画そのものを CSS で止める（触って読む画面に、触れない設定が残る）。
 */
export function MemoPreviewToggle() {
  const ownsToggle = useOwnsToggle();
  const isEnabled = useMemoPreviewEnabled();

  if (!ownsToggle) {
    return null;
  }

  return createPortal(
    <button
      type="button"
      aria-pressed={isEnabled}
      onClick={() => writePreference(!isEnabled)}
      className="fixed right-4 bottom-4 hidden text-ink-weak text-meta hover:underline [@media(hover:hover)]:block"
    >
      ホバーでメモを出す: {isEnabled ? "入" : "切"}
    </button>,
    document.body,
  );
}

/**
 * 覗き見の枠を、下線の近くの画面座標へ置く style を組み立てる。
 *
 * 画面の下半分にある下線には上側へ出す。
 * 下側へ出すと枠が画面の外へ出て読めない。
 */
function positionNear(anchor: DOMRect): CSSProperties {
  const rightLimit = window.innerWidth - PREVIEW_MAX_WIDTH - PREVIEW_GAP;
  const left = Math.max(PREVIEW_GAP, Math.min(anchor.left, rightLimit));
  const maxWidth = PREVIEW_MAX_WIDTH;

  if (anchor.top > window.innerHeight / 2) {
    return {
      left,
      bottom: window.innerHeight - anchor.top + PREVIEW_GAP,
      maxWidth,
    };
  }

  return { left, top: anchor.bottom + PREVIEW_GAP, maxWidth };
}

/**
 * 設定が変わったことを知らせる相手。
 * `useMemoPreviewEnabled` を呼んでいるコンポーネントが入る。
 */
const preferenceListeners = new Set<() => void>();

/**
 * 直近に読んだ設定。
 * `useSyncExternalStore` は変化が無い限り同じ値を返す必要があるので、呼ばれるたびに localStorage を読み直さない。
 */
let cachedPreference: boolean | undefined;

/**
 * 覗き見の枠を出す設定かどうかを返し、設定が変わったら呼び出し側を再描画する。
 * サーバー側の描画では常に true を返す（localStorage が無く、覗き見はどのみち hover が起きるまで描かれない）。
 */
function useMemoPreviewEnabled(): boolean {
  return useSyncExternalStore(subscribePreference, readPreference, () => true);
}

/** 設定の変化を受け取る `listener` を登録し、外し方を返す。 */
function subscribePreference(listener: () => void): () => void {
  preferenceListeners.add(listener);

  return () => {
    preferenceListeners.delete(listener);
  };
}

/**
 * 設定を返す。
 * localStorage を読むのは初回だけで、以後は `cachedPreference` を返す。
 */
function readPreference(): boolean {
  if (cachedPreference === undefined) {
    cachedPreference = readStoredPreference();
  }

  return cachedPreference;
}

/**
 * localStorage に保存された設定を読む。
 * 未設定のときと、localStorage へ触れずに例外になる環境（Safari のプライベートブラウズなど）では true を返す。
 */
function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * 設定を保存し、この画面の下線すべてへ反映する。
 * 保存が例外になる環境では、この画面を開いているあいだだけ設定が効く。
 */
function writePreference(isEnabled: boolean): void {
  cachedPreference = isEnabled;

  try {
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, isEnabled ? "on" : "off");
  } catch {
    // 保存できない環境でも、この画面での切り替えは効かせる。
  }

  for (const listener of preferenceListeners) {
    listener();
  }
}

/**
 * 切り替えを描く役を決めるための一覧。
 * 先頭に居るものが描く役で、増減のたびに全員が判定し直す。
 */
const toggleClaimants = new Set<() => void>();

/**
 * 呼び出したコンポーネントが、画面で唯一の切り替えを描く役かどうかを返す。
 *
 * `MessageBody` は発話の数だけ mount するので、そのまま描くと同じ切り替えが発話の数だけ重なる。
 * 最初の描画では false を返す（`createPortal` は document を要るので、サーバー側では描かせない）。
 */
function useOwnsToggle(): boolean {
  const [ownsToggle, setOwnsToggle] = useState(false);

  useEffect(() => {
    const judge = () => {
      setOwnsToggle(toggleClaimants.values().next().value === judge);
    };

    toggleClaimants.add(judge);
    notifyClaimants();

    return () => {
      toggleClaimants.delete(judge);
      notifyClaimants();
    };
  }, []);

  return ownsToggle;
}

/** 一覧に居る全員へ、自分が描く役かどうかを判定し直させる。 */
function notifyClaimants(): void {
  for (const judge of toggleClaimants) {
    judge();
  }
}
