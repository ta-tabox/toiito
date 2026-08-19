/**
 * node に `@` エイリアスを教える解決フック。
 *
 * `@` は tsc と vite のエイリアスで、素の ESM 解決には無い。
 * node へ直接食わせるスクリプト（scripts/ 配下）だけが、自分でその対応を持つ必要がある。
 * seed 固有の配線ではないので、次に src を読むスクリプトが出たらこれを使う。
 *
 * 入口は registerSrcAlias。
 * 静的 import は本体より先に解決されるため、呼び出し側は src の読み込みを登録後の動的 import へ回す。
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** `@` が指す先。 */
const srcDir = path.resolve(import.meta.dirname, "../src");

/**
 * `@/…` を実ファイルへ当てるときに試す綴り。
 *
 * node は拡張子を補わないので、拡張子なしで綴られた src 側に .ts を当てる。
 * 空文字の側は、綴りに拡張子が既に付いている場合。
 */
const CANDIDATE_SUFFIXES = ["", ".ts"];

/** `@/` を src へ向ける解決フックを node に登録する。 */
export function registerSrcAlias(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith("@/")) {
        return nextResolve(specifier, context);
      }

      const base = path.join(srcDir, specifier.slice("@/".length));
      const resolved = CANDIDATE_SUFFIXES.map(
        (suffix) => `${base}${suffix}`,
      ).find((candidate) => existsSync(candidate));

      if (resolved === undefined) {
        throw new Error(`@ エイリアスを解決できない: ${specifier}`);
      }

      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    },
  });
}
