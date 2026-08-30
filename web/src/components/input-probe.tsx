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
 * 測れない項目は 0 でなく「未対応」と出す。
 * iOS Safari は longtask を報告しないので、0 と書くと「引っかかっていない」と読み違える。
 */

import { useEffect, useRef } from "react";

/** 画面を書き換える間隔。 */
const REPAINT_MS = 250;

/** フレーム間隔を保つ本数（60fps で 10 秒ぶん）。 */
const FRAME_SAMPLES = 600;

/** 遅い入力イベントを保つ件数。 */
const SLOW_EVENT_SAMPLES = 8;

/**
 * ここを超えた入力イベントだけを拾う（60fps の 3 コマ分）。
 *
 * 16ms まで下げると普通の打鍵が全部載る。
 * Chromium は duration を 8ms 単位へ丸めるので、閾値ぴったりの値が床として並び、遅くないものを遅いと読ませる。
 */
const SLOW_EVENT_MS = 48;

/** これを超えたフレーム間隔を「落ちた」と数える（60fps の 2 コマ分）。 */
const DROPPED_FRAME_MS = 34;

/**
 * Event Timing の観測条件。
 *
 * lib.dom の PerformanceObserverInit がまだ durationThreshold を持たないので、ここで補う。
 */
type EventTimingObserverInit = PerformanceObserverInit & {
  readonly durationThreshold: number;
};

/** 一件の遅い入力イベント。 */
type SlowEvent = {
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
  slowEvents: SlowEvent[];
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
    slowEvents: [],
    longTasks: 0,
    longTaskMs: 0,
    supportsEventTiming: supported.includes("event"),
    supportsLongTask: supported.includes("longtask"),
  };
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
          type="button"
          onClick={() => {
            readingsRef.current = emptyReadings();
          }}
          className="rounded border border-neutral-400 px-2 py-1"
        >
          リセット
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(
              outputRef.current?.textContent ?? "",
            );
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
 * 入力イベントのうち、次の描画まで SLOW_EVENT_MS 以上かかったものを拾う。
 *
 * processingEnd - processingStart がハンドラの総時間で、message-body の N 本もここに入る。
 * duration は「イベントから次の描画まで」で、体感の引っかかりに一番近い。
 * 残すのは直近でなく重い方で、引っかかった瞬間は打ち続けると流れて消える。
 */
function eventTimingObserver(readings: Readings): PerformanceObserver {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const timing = entry as PerformanceEventTiming;

      readings.slowEvents.push({
        name: timing.name,
        durationMs: Math.round(timing.duration),
        handlerMs: Math.round(timing.processingEnd - timing.processingStart),
        delayMs: Math.round(timing.processingStart - timing.startTime),
      });
    }

    readings.slowEvents.sort((a, b) => b.durationMs - a.durationMs);
    readings.slowEvents.length = Math.min(
      readings.slowEvents.length,
      SLOW_EVENT_SAMPLES,
    );
  });

  const options: EventTimingObserverInit = {
    type: "event",
    durationThreshold: SLOW_EVENT_MS,
  };
  observer.observe(options);

  return observer;
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
    readings.supportsEventTiming
      ? `${SLOW_EVENT_MS}ms 超の入力 ${readings.slowEvents.length} 件${formatSlowEvents(readings.slowEvents)}`
      : `${SLOW_EVENT_MS}ms 超の入力: この端末は Event Timing 未対応`,
    readings.supportsLongTask
      ? `長タスク ${readings.longTasks} 件 / 計 ${round(readings.longTaskMs)}ms`
      : "長タスク: この端末は longtask 未報告",
  ].join("\n");
}

/** 遅い入力イベントを一行ずつに並べる。 */
function formatSlowEvents(events: SlowEvent[]): string {
  if (events.length === 0) {
    return "";
  }

  return events
    .map(
      (event) =>
        `\n  ${event.name} 全 ${event.durationMs}ms 待ち ${event.delayMs}ms 処理 ${event.handlerMs}ms`,
    )
    .join("");
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
