"use client";

/**
 * 下線に触れたときのメモの覗き見と、その覗き見を出すかどうかの切り替え。
 *
 * 開いている覗き見は画面に一つで、その状態は React の外の store が持つ。
 * どの区間にどのメモが付いているかは呼び出し側（`message-body.tsx`）が決め、この層は渡されたメモを整形して置くだけである。
 * 設定は localStorage に持つ。
 * 読む側の道具の設定であってメモの内容ではないので、サーバーへ送らない。
 *
 * 枠は `document.body` へ portal する。
 * 発話の本文の中へ置くと、メモを作るための選択に枠の文字が入り、アンカーのオフセットがずれる。
 */

import Link from "next/link";
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
 * 枠の要素の id。
 * 区間の `aria-controls` と、枠の外を押したかどうかの判定が指す。
 */
export const PREVIEW_ID = "memo-preview";

/**
 * 覗き見の枠の最大幅（px）。
 * 下線の左端から右へ広げる幅の上限で、枠を画面の内側へ丸めるときの基準にもなる。
 */
const PREVIEW_MAX_WIDTH = 288;

/**
 * 覗き見の枠の最大高（px）。
 * メモ 3 件で埋まる高さで、それ以上は枠の中を縦にスクロールさせる。
 */
const PREVIEW_MAX_HEIGHT = 224;

/** 覗き見の枠と、下線・画面の縁との間隔（px）。 */
const PREVIEW_GAP = 8;

/**
 * 下線から離れてから枠を閉じるまでの猶予（ms）。
 *
 * 枠は下線から離して置くので、間の隙間を横切るあいだに閉じるとポインタが枠へ届かない。
 */
const CLOSE_DELAY_MS = 150;

/**
 * いま開いている覗き見。
 * `key` は開かせた区間で、その区間だけが自分を開いている側だと分かる。
 */
type OpenPreview = {
  key: string;
  memos: Memo[];
  anchor: DOMRect;
};

let openPreview: OpenPreview | null = null;

/**
 * 覗き見の開閉を知らせる相手。
 * `useOpenMemoPreview` を呼んでいるコンポーネントが入る。
 */
const previewListeners = new Set<() => void>();

let closeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 区間 `key` の覗き見を、`anchor` の位置へ開く。
 * 設定が「出さない」なら何も起きない。
 */
export function openMemoPreview(
  key: string,
  memos: Memo[],
  anchor: DOMRect,
): void {
  cancelMemoPreviewClose();

  if (!readPreference()) {
    return;
  }

  openPreview = { key, memos, anchor };
  notifyPreviewListeners();
}

/** 覗き見を閉じる。 */
export function closeMemoPreview(): void {
  cancelMemoPreviewClose();
  openPreview = null;
  notifyPreviewListeners();
}

/**
 * 予約してある close を取り消す。
 * ポインタが枠へ入ったときに呼ぶ。
 */
export function cancelMemoPreviewClose(): void {
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

/**
 * 猶予のあとに閉じる。
 * 下線からも枠からもポインタが離れたときに呼ぶ。
 */
export function scheduleMemoPreviewClose(): void {
  cancelMemoPreviewClose();
  closeTimer = setTimeout(closeMemoPreview, CLOSE_DELAY_MS);
}

/**
 * いま開いている覗き見を返し、開閉のたびに呼び出し側を再描画する。
 * サーバー側の描画では常に null を返す。
 */
export function useOpenMemoPreview(): OpenPreview | null {
  return useSyncExternalStore(
    subscribePreview,
    () => openPreview,
    () => null,
  );
}

/** 開閉を受け取る `listener` を登録し、外し方を返す。 */
function subscribePreview(listener: () => void): () => void {
  previewListeners.add(listener);

  return () => {
    previewListeners.delete(listener);
  };
}

/** 開閉を全員へ知らせる。 */
function notifyPreviewListeners(): void {
  for (const listener of previewListeners) {
    listener();
  }
}

/**
 * 覗き見の枠と切り替えを描く層。
 *
 * `MessageBody` は発話の数だけ mount するので、実際に描くのは最初の一つだけである。
 * 枠は画面に一つなので、どの発話の区間を開いても同じ層が描く。
 */
export function MemoPreviewLayer() {
  const ownsLayer = useOwnsLayer();
  const open = useOpenMemoPreview();

  if (!ownsLayer) {
    return null;
  }

  return createPortal(
    <>
      {open && <PreviewPanel open={open} />}
      <PreviewToggle />
    </>,
    document.body,
  );
}

/**
 * 覗き見の枠。
 * 区間に付いているメモを並べ、一件ずつメモ一覧の当該メモへのリンクにする。
 *
 * キーワードは 1 行、ノートは 2 行で切る。
 * 枠の幅は決め打ちなので、切らないと横へ溢れる。
 */
function PreviewPanel({ open }: { open: OpenPreview }) {
  useEffect(() => {
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <nav
      id={PREVIEW_ID}
      aria-label="この区間のメモ"
      style={positionNear(open.anchor)}
      onMouseEnter={cancelMemoPreviewClose}
      onMouseLeave={scheduleMemoPreviewClose}
      className="fixed z-10 overflow-y-auto rounded border border-rule bg-surface-mid p-3 text-aux shadow-[0_0_16px_rgba(0,0,0,0.12)]"
    >
      <ul className="flex flex-col gap-1">
        {open.memos.map((memo) => (
          <li key={memo.id}>
            <Link
              href={`/memos?memo=${memo.id}`}
              className="block rounded px-2 py-1 hover:bg-surface-high focus-visible:bg-surface-high"
            >
              <p className="truncate font-bold">{memo.keyword}</p>
              {memo.note && (
                <p className="mt-1 line-clamp-2 text-ink-weak">{memo.note}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 枠の外を押したら閉じる。
 *
 * 触って読む端末には mouseleave が来ないので、閉じる手段がこれしかない。
 * 下線を押した分を除くのは、押した区間の枠をその直後に開くため。
 */
function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target;

  if (
    target instanceof Element &&
    target.closest(`#${PREVIEW_ID}, [data-memo-underline]`)
  ) {
    return;
  }

  closeMemoPreview();
}

/** Esc で閉じる。 */
function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeMemoPreview();
  }
}

/**
 * 覗き見の枠を出すかどうかの切り替え。
 * 画面の右下に小さく置き、押すたびに設定を反転させる。
 *
 * hover を持たない端末では描画そのものを CSS で止める（触って読む画面に、触れない設定が残る）。
 */
function PreviewToggle() {
  const isEnabled = useMemoPreviewEnabled();

  return (
    <button
      type="button"
      aria-pressed={isEnabled}
      onClick={() => writePreference(!isEnabled)}
      className="fixed right-4 bottom-4 hidden text-ink-weak text-meta hover:underline [@media(hover:hover)]:block"
    >
      ホバーでメモを出す: {isEnabled ? "入" : "切"}
    </button>
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
  const size = {
    maxWidth: PREVIEW_MAX_WIDTH,
    maxHeight: PREVIEW_MAX_HEIGHT,
  };

  if (anchor.top > window.innerHeight / 2) {
    return {
      left,
      bottom: window.innerHeight - anchor.top + PREVIEW_GAP,
      ...size,
    };
  }

  return { left, top: anchor.bottom + PREVIEW_GAP, ...size };
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
 * サーバー側の描画では常に true を返す（localStorage が無く、覗き見はどのみち触れるまで描かれない）。
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

  if (!isEnabled) {
    closeMemoPreview();
  }

  for (const listener of preferenceListeners) {
    listener();
  }
}

/**
 * 覗き見の層を描く役を決めるための一覧。
 * 先頭に居るものが描く役で、増減のたびに全員が判定し直す。
 */
const layerClaimants = new Set<() => void>();

/**
 * 呼び出したコンポーネントが、画面で唯一の層を描く役かどうかを返す。
 *
 * `MessageBody` は発話の数だけ mount するので、そのまま描くと同じ枠と切り替えが発話の数だけ重なる。
 * 最初の描画では false を返す（`createPortal` は document を要るので、サーバー側では描かせない）。
 */
function useOwnsLayer(): boolean {
  const [ownsLayer, setOwnsLayer] = useState(false);

  useEffect(() => {
    const judge = () => {
      setOwnsLayer(layerClaimants.values().next().value === judge);
    };

    layerClaimants.add(judge);
    notifyClaimants();

    return () => {
      layerClaimants.delete(judge);
      notifyClaimants();
    };
  }, []);

  return ownsLayer;
}

/** 一覧に居る全員へ、自分が描く役かどうかを判定し直させる。 */
function notifyClaimants(): void {
  for (const judge of layerClaimants) {
    judge();
  }
}
