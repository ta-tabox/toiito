"use client";

/**
 * 入力の引っかかりを実機で数値にする一時的な計器（issue #109）。
 *
 * 出すのは観測値だけで、原因の判断はしない。
 * 原因が確定したら、このファイルと q/[id]/page.tsx の `?probe=1` 分岐ごと消す。
 *
 * 打鍵ごとに React の state を動かさない。
 * 計器が再レンダリングを起こすと、測りたい対象を計器自身が汚す。
 * 数え上げは ref の中で行い、画面へは一定間隔で DOM へ直接書く。
 *
 * ボタンも state を持たず DOM へ直接書く。
 * この component はマウント後に一度も再レンダリングしないので、`pre` へ書いた計測値が React に上書きされない。
 *
 * 観測値は差し替えずにその場で書き換える。
 * effect が掴んだ object を捨てて新しくすると、カウンタも observer も表示も古い方を読み続ける。
 *
 * キー入力とポインタは分けて出す。
 * iOS はタップ一回から mouseover / mousedown / mouseup / click を合成するので、混ぜると打鍵の数字がタップに埋もれる。
 *
 * 測れない項目は 0 でなく「未対応」と出す。
 * iOS Safari は longtask を報告しないので、0 と書くと「引っかかっていない」と読み違える。
 */

import { useEffect, useRef } from "react";

/** 画面を書き換える間隔。 */
const REPAINT_MS = 250;

/** ボタンへ結果を出しておく長さ。 */
const FLASH_MS = 1200;

/** フレーム間隔を保つ本数（60fps で 10 秒ぶん）。 */
const FRAME_SAMPLES = 600;

/** 入力イベントを保つ件数（種類ごと）。 */
const EVENT_SAMPLES = 4;

/**
 * Event Timing に拾わせる下限。
 *
 * ブラウザが受け付ける最小値で、これより短いイベントは観測できない。
 * 下限で拾って重い方だけ残すのは、引っかからなかった回を「正常時の基準線」として持ち帰るため。
 */
const OBSERVE_MS = 16;

/**
 * 体感の引っかかりとみなす境（60fps の 3 コマ分）。
 *
 * 拾う下限と別にするのは、下限で数えると普通の打鍵が全部「遅い」に化けるため。
 * Chromium は duration を 8ms 単位へ丸めるので、下限ちょうどの値が床として並ぶ。
 */
const FELT_MS = 48;

/** これを超えたフレーム間隔を「落ちた」と数える（60fps の 2 コマ分）。 */
const DROPPED_FRAME_MS = 34;

/** キーボードと変換に由来する入力イベントの名前。 */
const KEY_EVENT_NAMES = new Set([
  "keydown",
  "keypress",
  "keyup",
  "beforeinput",
  "input",
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

/**
 * Event Timing の観測条件。
 *
 * lib.dom の PerformanceObserverInit がまだ durationThreshold を持たないので、ここで補う。
 */
type EventTimingObserverInit = PerformanceObserverInit & {
  readonly durationThreshold: number;
};

/** 観測した入力イベント一件。 */
type ObservedEvent = {
  readonly name: string;
  readonly durationMs: number;
  readonly handlerMs: number;
  readonly delayMs: number;
};

/** 計器が抱える観測値。 */
type Readings = {
  keydowns: number;
  compositions: number;
  frameGaps: number[];
  keyEvents: ObservedEvent[];
  pointerEvents: ObservedEvent[];
  feltKeys: number;
  feltPointers: number;
  longTasks: number;
  longTaskMs: number;
  supportsEventTiming: boolean;
  supportsLongTask: boolean;
};

/** 観測値を空にする。 */
function emptyReadings(): Readings {
  const supported = PerformanceObserver.supportedEntryTypes ?? [];

  return {
    keydowns: 0,
    compositions: 0,
    frameGaps: [],
    keyEvents: [],
    pointerEvents: [],
    feltKeys: 0,
    feltPointers: 0,
    longTasks: 0,
    longTaskMs: 0,
    supportsEventTiming: supported.includes("event"),
    supportsLongTask: supported.includes("longtask"),
  };
}

/**
 * 観測値をその場で 0 に戻す。
 *
 * 新しい object を作って差し替えない。
 * effect が掴んでいるのはこの object なので、差し替えると誰も新しい方を読まない。
 * 端末が何に対応しているかは測り直しても変わらないので、そのまま残す。
 */
function resetReadings(readings: Readings): void {
  readings.keydowns = 0;
  readings.compositions = 0;
  readings.frameGaps.length = 0;
  readings.keyEvents.length = 0;
  readings.pointerEvents.length = 0;
  readings.feltKeys = 0;
  readings.feltPointers = 0;
  readings.longTasks = 0;
  readings.longTaskMs = 0;
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
 * 計測値をクリップボードへ写し、成否をボタンへ出す。
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

/**
 * 実機で入力の重さを読むための計器。
 *
 * `?probe=1` が付いた対話画面にだけ出る。
 * messageCount を受け取るのは、重さが発話数に連動するかを同じ画面で読むため。
 */
export function InputProbe({ messageCount }: { messageCount: number }) {
  const outputRef = useRef<HTMLPreElement>(null);
  const readingsRef = useRef<Readings | null>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    readingsRef.current ??= emptyReadings();
    const readings = readingsRef.current;

    const stopCounters = countInputEvents(readings);
    const stopObservers = observePerformance(readings);
    const stopFrames = watchFrameGaps(readings);

    const timer = window.setInterval(() => {
      const node = outputRef.current;

      if (node) {
        node.textContent = report(readings, messageCount);
      }
    }, REPAINT_MS);

    return () => {
      window.clearInterval(timer);
      stopFrames();
      stopObservers();
      stopCounters();
    };
  }, [messageCount]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-neutral-400 bg-white/95 p-2 font-mono text-[10px] leading-tight text-neutral-900">
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

            // フレーム間隔は 250ms で埋まり直すので、数字を見ても押せたか分からない。
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

/**
 * 打鍵と変換のイベントを数える。
 * 外す関数を返す。
 */
function countInputEvents(readings: Readings): () => void {
  const countKeydown = () => {
    readings.keydowns++;
  };
  const countComposition = () => {
    readings.compositions++;
  };

  document.addEventListener("keydown", countKeydown);
  document.addEventListener("compositionstart", countComposition);
  document.addEventListener("compositionupdate", countComposition);
  document.addEventListener("compositionend", countComposition);

  return () => {
    document.removeEventListener("keydown", countKeydown);
    document.removeEventListener("compositionstart", countComposition);
    document.removeEventListener("compositionupdate", countComposition);
    document.removeEventListener("compositionend", countComposition);
  };
}

/**
 * 遅い入力イベントと長いタスクを拾う。
 * 外す関数を返す。
 */
function observePerformance(readings: Readings): () => void {
  const observers = [
    startObserver(readings.supportsEventTiming, () =>
      eventTimingObserver(readings),
    ),
    startObserver(readings.supportsLongTask, () => longTaskObserver(readings)),
  ];

  return () => {
    for (const observer of observers) {
      observer?.disconnect();
    }
  };
}

/** 対応していれば観測を始める。 */
function startObserver(
  supported: boolean,
  make: () => PerformanceObserver,
): PerformanceObserver | undefined {
  if (!supported) {
    return undefined;
  }

  return make();
}

/**
 * 入力イベントを拾って種類ごとに振り分ける。
 *
 * processingEnd - processingStart がハンドラの総時間で、message-body の N 本もここに入る。
 * duration は「イベントから次の描画まで」で、体感の引っかかりに一番近い。
 */
function eventTimingObserver(readings: Readings): PerformanceObserver {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const timing = entry as PerformanceEventTiming;

      recordEvent(readings, {
        name: timing.name,
        durationMs: Math.round(timing.duration),
        handlerMs: Math.round(timing.processingEnd - timing.processingStart),
        delayMs: Math.round(timing.processingStart - timing.startTime),
      });
    }
  });

  const options: EventTimingObserverInit = {
    type: "event",
    durationThreshold: OBSERVE_MS,
  };
  observer.observe(options);

  return observer;
}

/** 一件をキー入力とポインタへ振り分けて数える。 */
function recordEvent(readings: Readings, seen: ObservedEvent): void {
  const isKey = KEY_EVENT_NAMES.has(seen.name);

  keepWorst(isKey ? readings.keyEvents : readings.pointerEvents, seen);

  if (seen.durationMs < FELT_MS) {
    return;
  }

  if (isKey) {
    readings.feltKeys++;
    return;
  }

  readings.feltPointers++;
}

/**
 * 重い方から EVENT_SAMPLES 件だけ残す。
 * 直近でなく重い方を残すのは、引っかかった瞬間が打ち続けると流れて消えるため。
 */
function keepWorst(events: ObservedEvent[], seen: ObservedEvent): void {
  events.push(seen);
  events.sort((a, b) => b.durationMs - a.durationMs);
  events.length = Math.min(events.length, EVENT_SAMPLES);
}

/** 50ms を超えたタスクを数える（報告するのは Chromium 系だけ）。 */
function longTaskObserver(readings: Readings): PerformanceObserver {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      readings.longTasks++;
      readings.longTaskMs += entry.duration;
    }
  });

  observer.observe({ type: "longtask", buffered: true });

  return observer;
}

/**
 * フレームの間隔を記録し続ける。
 * 止める関数を返す。
 */
function watchFrameGaps(readings: Readings): () => void {
  let handle = 0;
  let previous = performance.now();

  function step(now: number) {
    readings.frameGaps.push(now - previous);
    previous = now;

    if (readings.frameGaps.length > FRAME_SAMPLES) {
      readings.frameGaps.shift();
    }

    handle = requestAnimationFrame(step);
  }

  handle = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(handle);
  };
}

/** 観測値を画面へ出す一枚の文字列へ畳む。 */
function report(readings: Readings, messageCount: number): string {
  const gaps = readings.frameGaps;
  const dropped = gaps.filter((gap) => gap > DROPPED_FRAME_MS).length;

  return [
    `発話 ${messageCount} 件 / 打鍵 ${readings.keydowns} / 変換 ${readings.compositions}`,
    `フレーム 最大 ${round(max(gaps))}ms 中央 ${round(median(gaps))}ms 落ち ${dropped}/${gaps.length}`,
    ...inputLines(readings),
    readings.supportsLongTask
      ? `長タスク ${readings.longTasks} 件 / 計 ${round(readings.longTaskMs)}ms`
      : "長タスク: この端末は longtask 未報告",
  ].join("\n");
}

/** 入力イベントの行を作る。 */
function inputLines(readings: Readings): string[] {
  if (!readings.supportsEventTiming) {
    return ["入力: この端末は Event Timing 未対応"];
  }

  return [
    `キー最悪 ${worstOf(readings.keyEvents)}`,
    `ポインタ最悪 ${worstOf(readings.pointerEvents)}`,
    `${FELT_MS}ms 超 キー ${readings.feltKeys} 件 / ポインタ ${readings.feltPointers} 件`,
    ...readings.keyEvents.map(formatEvent),
  ];
}

/** 最悪の一件を一行にする。 */
function worstOf(events: ObservedEvent[]): string {
  const [worst] = events;

  if (!worst) {
    return `${OBSERVE_MS}ms 超なし`;
  }

  return `${worst.name} ${worst.durationMs}ms（待ち ${worst.delayMs} 処理 ${worst.handlerMs}）`;
}

/** 一件を一行にする。 */
function formatEvent(event: ObservedEvent): string {
  return `  ${event.name} 全 ${event.durationMs}ms 待ち ${event.delayMs}ms 処理 ${event.handlerMs}ms`;
}

/** 小数第一位まで丸める。 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 最大値。
 * 空なら 0。
 */
function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/**
 * 中央値。
 * 空なら 0。
 */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)];
}
