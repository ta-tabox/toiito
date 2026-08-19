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

/**
 * .ts の解決結果に ESM だと明示する。
 *
 * package.json に type が無いため、node は .ts を読んでから ESM だと判り直し、走らせるたびに MODULE_TYPELESS_PACKAGE_JSON を出す。
 * 形式はここで名指しておく。
 */
function asTypeScriptModule<T extends { url: string; format?: string | null }>(
  resolved: T,
): T {
  if (!resolved.url.endsWith(".ts") || resolved.format) {
    return resolved;
  }

  return { ...resolved, format: "module-typescript" };
}

/** `@/` を src へ向ける解決フックを node に登録する。 */
export function registerSrcAlias(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith("@/")) {
        return asTypeScriptModule(nextResolve(specifier, context));
      }

      const base = path.join(srcDir, specifier.slice("@/".length));
      const resolved = CANDIDATE_SUFFIXES.map(
        (suffix) => `${base}${suffix}`,
      ).find((candidate) => existsSync(candidate));

      if (resolved === undefined) {
        throw new Error(`@ エイリアスを解決できない: ${specifier}`);
      }

      return asTypeScriptModule({
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      });
    },
  });
}
