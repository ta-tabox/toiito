"use client";

/**
 * 発話の語を選んだときに何が起きているかを実機で数える一時的な計器（issue #147）。
 *
 * 出すのは観測値だけで、原因の判断はしない。
 * 原因が確定したら、このファイルと q/[id]/page.tsx の `?probe=1` 分岐ごと消す。
 *
 * イベントごとに、その時点の `window.getSelection()` を並べて記録する。
 * 「mouseup は来ているのに選択がまだ潰れている」という順序の問題を、口が来ないのと分けて読むため。
 *
 * 選択の始点から発話の本文を引けたかも同時に出す。
 * 下書きを立てる側（message-body.tsx）が同じ `closest("[data-message-body]")` を通るので、口が開いても引けなければ結果は変わらない。
 *
 * ボタンを押した分も記録に載る。
 * iOS はタップ一回から mouseup / click を合成するので、選択のジェスチャが撃った分と混ぜて読まない。
 *
 * 計器が再レンダリングを起こすと、測りたい対象を計器自身が汚す。
 * 記録は ref の中で行い、画面へは一定間隔で DOM へ直接書く。
 */

import { useEffect, useRef } from "react";

/** 画面を書き換える間隔。 */
const REPAINT_MS = 250;

/** ボタンへ結果を出しておく長さ。 */
const FLASH_MS = 1200;

/** 記録を保つ件数。 */
const LOG_SAMPLES = 40;

/**
 * 観測するイベントの名前。
 *
 * 件数の行はこの並びで出し、0 件のものも省かない。
 * 「mouseup が 0」は行が消えていると読めない。
 */
const WATCHED_EVENTS = [
  "touchstart",
  "touchend",
  "pointerup",
  "mouseup",
  "click",
  "selectionchange",
] as const;

/** ある時点の選択の状態。 */
type SelectionState = {
  readonly isCollapsed: boolean;
  readonly rangeCount: number;
  readonly length: number;
  /** 選択の始点から発話の本文を引けたか。 */
  readonly inBody: boolean;
};

/** 観測した一件。 */
type Observation = SelectionState & {
  readonly name: string;
  /** 記録した一件目から、この連なりの最初の一件までの経過（ms）。 */
  readonly atMs: number;
  /** 同じく、この連なりの最後の一件までの経過（ms）。 */
  readonly untilMs: number;
  /** 同じ名前が続いた件数。 */
  readonly repeats: number;
};

/** 計器が抱える観測値。 */
type Readings = {
  log: Observation[];
  counts: Map<string, number>;
  startedAtMs: number | undefined;
};

/** 観測値を空にする。 */
function emptyReadings(): Readings {
  return {
    log: [],
    counts: new Map(),
    startedAtMs: undefined,
  };
}

/**
 * 観測値をその場で空に戻す。
 *
 * 新しい object を作って差し替えない。
 * effect が掴んでいるのはこの object なので、差し替えると誰も新しい方を読まない。
 */
function resetReadings(readings: Readings): void {
  readings.log.length = 0;
  readings.counts.clear();
  readings.startedAtMs = undefined;
}

/**
 * いまの選択の状態を読む。
 *
 * 始点から本文を引くのは message-body.tsx の `notifySelectedMessage` と同じ経路で、そちらが引けなければ下書きは立たない。
 * 端点は text node で来ることがあり、`closest` は Element のメソッドなので、text node なら親を見る。
 */
function readSelection(): SelectionState {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return { isCollapsed: true, rangeCount: 0, length: 0, inBody: false };
  }

  const start = selection.getRangeAt(0).startContainer;
  const element = start instanceof Element ? start : start.parentElement;

  return {
    isCollapsed: selection.isCollapsed,
    rangeCount: selection.rangeCount,
    length: selection.toString().length,
    inBody: Boolean(element?.closest("[data-message-body]")),
  };
}

/**
 * 一件を記録する。
 *
 * 直前と同じ名前なら畳んで件数だけ増やし、状態は新しい方で置き換える。
 * selectionchange は続けて飛ぶので、一件ずつ並べると境目の touchend / mouseup / click が流れて消える。
 */
function record(readings: Readings, name: string): void {
  const now = performance.now();
  readings.startedAtMs ??= now;
  readings.counts.set(name, (readings.counts.get(name) ?? 0) + 1);

  const state = readSelection();
  const elapsedMs = Math.round(now - readings.startedAtMs);
  const last = readings.log.at(-1);

  if (last && last.name === name) {
    readings.log[readings.log.length - 1] = {
      ...state,
      name,
      atMs: last.atMs,
      untilMs: elapsedMs,
      repeats: last.repeats + 1,
    };

    return;
  }

  readings.log.push({
    ...state,
    name,
    atMs: elapsedMs,
    untilMs: elapsedMs,
    repeats: 1,
  });

  if (readings.log.length > LOG_SAMPLES) {
    readings.log.shift();
  }
}

/**
 * 観測するイベントを document へ張り、外す関数を返す。
 *
 * 受けるのは message-body.tsx が下書きを立てるのと同じ document の bubble 段。
 * capture で取ると、途中で止められて document まで届かないイベントまで「来た」と数える。
 */
function watchSelectionEvents(readings: Readings): () => void {
  const watched = WATCHED_EVENTS.map((name) => {
    const listener = () => {
      record(readings, name);
    };

    document.addEventListener(name, listener);

    return { name, listener };
  });

  return () => {
    for (const { name, listener } of watched) {
      document.removeEventListener(name, listener);
    }
  };
}

/**
 * ボタンの文字を一瞬だけ結果へ差し替える。
 *
 * 元の文字は dataset へ預ける。
 * textContent から読み戻すと、続けて押したときに差し替え後の文字を元と見なして焼き付く。
 */
function flash(button: HTMLButtonElement | null, message: string): void {
  if (!button) {
    return;
  }

  const original = button.dataset.label ?? button.textContent ?? "";
  button.dataset.label = original;
  button.textContent = message;

  window.setTimeout(() => {
    button.textContent = original;
  }, FLASH_MS);
}

/**
 * 観測値をクリップボードへ写し、成否をボタンへ出す。
 *
 * 成否を出すのは、写せたかどうかが画面のどこにも出ないため。
 * iOS は保護された文脈でないと clipboard を持たないので、無いこと自体も伝える。
 */
function copyReport(
  output: HTMLPreElement | null,
  button: HTMLButtonElement | null,
): void {
  if (!navigator.clipboard) {
    flash(button, "コピー不可");
    return;
  }

  void navigator.clipboard.writeText(output?.textContent ?? "").then(
    () => {
      flash(button, "コピーした");
    },
    () => {
      flash(button, "コピー失敗");
    },
  );
}

/** 選択の状態を一行の断片にする。 */
function formatSelection(state: SelectionState): string {
  const shape = state.isCollapsed ? "潰れ" : "開き";
  const body = state.inBody ? "○" : "×";

  return `${shape} r${state.rangeCount} ${state.length}字 本文${body}`;
}

/**
 * 観測一件を一行にする。
 *
 * 畳んだ連なりは終わりの時刻も出す。
 * 頭の時刻しか出さないと、読み込み時の一発が連なりの先頭に居るだけで、ジェスチャ中の変化がいつ飛んだのか読めなくなる。
 */
function formatObservation(observation: Observation): string {
  const span =
    observation.untilMs === observation.atMs
      ? `${observation.atMs}ms`
      : `${observation.atMs}→${observation.untilMs}ms`;
  const repeats = observation.repeats > 1 ? ` ×${observation.repeats}` : "";

  return `${span} ${observation.name}${repeats} ${formatSelection(observation)}`;
}

/** 種類ごとの件数を一行にする。 */
function formatCounts(readings: Readings): string {
  return WATCHED_EVENTS.map(
    (name) => `${name} ${readings.counts.get(name) ?? 0}`,
  ).join(" / ");
}

/** 観測値を画面へ出す一枚の文字列へ畳む。 */
function report(readings: Readings): string {
  const log =
    readings.log.length === 0
      ? ["まだ何も来ていない"]
      : readings.log.map(formatObservation);

  return [
    `いま ${formatSelection(readSelection())}`,
    formatCounts(readings),
    ...log,
  ].join("\n");
}

/**
 * 実機で選択の口を読むための計器。
 *
 * `?probe=1` が付いた対話画面にだけ出る。
 */
export function SelectionProbe() {
  const outputRef = useRef<HTMLPreElement>(null);
  const readingsRef = useRef<Readings | null>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    readingsRef.current ??= emptyReadings();
    const readings = readingsRef.current;

    const stopWatching = watchSelectionEvents(readings);

    const timer = window.setInterval(() => {
      const node = outputRef.current;

      if (node) {
        node.textContent = report(readings);
      }
    }, REPAINT_MS);

    return () => {
      window.clearInterval(timer);
      stopWatching();
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 max-h-[45vh] overflow-y-auto border-b border-neutral-400 bg-white/95 p-2 font-mono text-[10px] leading-tight text-neutral-900">
      <pre ref={outputRef} className="whitespace-pre-wrap">
        計測中…
      </pre>
      <div className="mt-1 flex gap-2">
        <button
          ref={resetRef}
          type="button"
          onClick={() => {
            const readings = readingsRef.current;

            if (readings) {
              resetReadings(readings);
            }

            // 押した直後は自分のタップが載るので、数字を見ても押せたか分からない。
            flash(resetRef.current, "0 に戻した");
          }}
          className="rounded border border-neutral-400 px-2 py-1"
        >
          リセット
        </button>
        <button
          ref={copyRef}
          type="button"
          onClick={() => {
            copyReport(outputRef.current, copyRef.current);
          }}
          className="rounded border border-neutral-400 px-2 py-1"
        >
          コピー
        </button>
      </div>
    </div>
  );
}
