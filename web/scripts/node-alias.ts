/**
 * node にパスエイリアスを教える解決フック。
 *
 * `@` と `@e2e` は tsc・vitest・Playwright のエイリアスで、素の ESM 解決には無い。
 * node へ直接食わせるスクリプトだけが、自分でその対応を持つ必要がある。
 * エイリアスの正は tsconfig.json の paths で、ここはそれを node 側へ写した側。
 * 増やしたときは両方を揃える。
 *
 * 入口は registerPathAliases。
 * 静的 import は本体より先に解決されるため、フックは本体より先に載せる。
 * `node --import ./scripts/alias-hook.ts <script>` で入れるか、呼び出し側が登録後の動的 import へ回す。
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** エイリアスの綴りと、それが指す先。 */
const ALIASES = [
  { prefix: "@/", dir: path.resolve(import.meta.dirname, "../src") },
  { prefix: "@e2e/", dir: path.resolve(import.meta.dirname, "../e2e") },
];

/**
 * エイリアスを実ファイルへ当てるときに試す綴り。
 *
 * node は拡張子を補わないので、拡張子なしで綴られた側に .ts を当てる。
 * 空文字の側は、綴りに拡張子が既に付いている場合。
 */
const CANDIDATE_SUFFIXES = ["", ".ts"];

/**
 * エイリアスを実ファイルへ当てる。
 *
 * どのエイリアスにも当たらない綴りなら undefined を返す。
 * 当たったのに実ファイルが無いときは、綴りの誤りとして投げる。
 */
function resolveAlias(specifier: string): string | undefined {
  const alias = ALIASES.find((a) => specifier.startsWith(a.prefix));

  if (alias === undefined) {
    return undefined;
  }

  const base = path.join(alias.dir, specifier.slice(alias.prefix.length));
  const resolved = CANDIDATE_SUFFIXES.map((suffix) => `${base}${suffix}`).find(
    (candidate) => existsSync(candidate),
  );

  if (resolved === undefined) {
    throw new Error(`エイリアスを解決できない: ${specifier}`);
  }

  return resolved;
}

/** エイリアスを解決するフックを node に登録する。 */
export function registerPathAliases(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = resolveAlias(specifier);

      if (resolved === undefined) {
        return nextResolve(specifier, context);
      }

      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    },
  });
}
