/**
 * 問いに付いた材料を、論点ごとにまとめて描く部品を置く。
 * 同じ論点の材料を隣に並べ、一件だけ読んで結論に見えないようにする。
 *
 * 材料の取得は持たず、呼び出し側が付いた順の一覧を渡す。
 */

import type { Material } from "@/lib/types";

/**
 * `materials` を `topic` ごとにまとめ、論点が最初に現れた順で並べて描く。
 * 出典を持つ材料には、出典の URL を別タブで開くリンクを添える。
 */
export function MaterialList({ materials }: { materials: Material[] }) {
  const topics = [...new Set(materials.map((material) => material.topic))];

  return (
    <div className="space-y-6">
      {topics.map((topic) => (
        <section key={topic} aria-label={topic}>
          <h3 className="text-aux text-ink">{topic}</h3>
          <ul className="mt-2 space-y-3 border-rule border-l-2 pl-3">
            {materials
              .filter((material) => material.topic === topic)
              .map((material) => (
                <li key={material.id} data-material="">
                  <p className="whitespace-pre-wrap text-aux text-ink">
                    {material.body}
                  </p>
                  {material.source_url && (
                    <a
                      href={material.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-meta text-ink-weak hover:underline"
                    >
                      {material.source_url}
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
