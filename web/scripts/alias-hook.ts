/**
 * `node --import` から読ませる、パスエイリアスの登録口。
 *
 * 読み込むだけで登録が済むので、本体は静的 import のままエイリアスを綴れる。
 * 登録する関数を持つのは node-alias.ts で、ここはそれを呼ぶだけ。
 *
 * 使い方は `node --import ./scripts/alias-hook.ts <script>`。
 */

import { registerPathAliases } from "./node-alias.ts";

registerPathAliases();
