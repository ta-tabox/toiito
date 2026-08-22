"use client";

/**
 * 逆引きで着地した発話に、一度だけ印を付ける。
 *
 * 描くものは持たず、URL のフラグメントが指す要素へ `data-landed` を付けるだけ。
 * 見た目の正は globals.css。
 *
 * CSS の `:target` は使わない。
 * Next のクライアント遷移ではフラグメントが変わっても評価し直されないので印が出ない。
 * 文書遷移で出た場合はフラグメントが URL に残る限り消えないので、一過性の合図にならない。
 * どちらも同じ擬似クラス一つから生じるので、片方だけを直せない。
 */

import { useEffect } from "react";

/**
 * 着地の印を付ける。
 * 何も描かないので、置く場所は画面のどこでもよい。
 */
export function LandingMark() {
  // 見るのは mount の一度きり。
  // 逆引きは必ず別の画面から来るので、着地のたびにこの画面ごと mount し直される。
  useEffect(() => {
    const landed = document.getElementById(window.location.hash.slice(1));

    if (!landed) {
      return;
    }

    landed.dataset.landed = "";

    return () => {
      delete landed.dataset.landed;
    };
  }, []);

  return null;
}
