/**
 * プロバイダ一つ分の契約（サーバー側のみ）。
 *
 * 規約の側が知るのは、組み立て済みの本文を送ると応答が返ることと、記録とエラー文へ出す名前と、共通の欄だけである。
 * API のフィールド名・値域・キーの持ち方は実装が引き受ける。
 *
 * 設定は実装が構築時に受け取って抱えるので、呼び出しごとに渡らない。
 * 呼び出しごとに変わるのは本文だけで、設定は env から作った時点で決まっている。
 */

/** フェイクモードに効く環境変数。 */
type FakeEnv = {
  readonly TOIITO_FAKE_AI?: string;
  readonly [key: string]: string | undefined;
};

/**
 * env からフェイクモードを読む。
 * どのプロバイダを叩くかに依らない指定なので、環境変数名の正をここが持ち、実装には解決済みの真偽値を渡す。
 */
export function readFakeMode(env: FakeEnv): boolean {
  return env.TOIITO_FAKE_AI === "1";
}

/**
 * どのプロバイダの設定も持つ欄。
 * ここに挙げた欄は、実装を選ぶ前に規約の側が読む。
 */
export type CommonSettings = {
  readonly model: string;

  /**
   * 一回の応答に許すトークン数。
   *
   * thinking のトークンもここから引かれるので、本文の想定長で見積もると足りない。
   * 足りなければ本文が途中で切れるか、本文ごと出てこない。
   * ストリーミングを使っていないため、上限は HTTP のタイムアウトに収まる範囲で選ぶ。
   */
  readonly maxTokens: number;

  /**
   * 一回の呼び出しを待つ上限（ミリ秒）。
   *
   * 実行環境が先に関数を殺すと、打ち切りとも空本文とも付かない不透明な失敗になるので、上限はその手前に置く。
   * 一往復は二体を逐次に待つので、実行環境の上限に収まるかは二回分で見る。
   */
  readonly timeoutMs: number;

  /** ネットワークに出ず決定的な応答を返すか（HARNESS.md 参照）。 */
  readonly fake: boolean;
};

/**
 * プロバイダが返す一回分の応答。
 *
 * 打ち切りの表し方はプロバイダごとに違うので、判定を済ませた `truncated` で受け取る。
 * `stopReason` は記録のためだけに通す生の値。
 */
export type ProviderResponse = {
  readonly body: string;
  readonly stopReason: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly truncated: boolean;
};

/**
 * AI プロバイダ一つ分の実装。
 * 打ち切りと空本文をどう扱うかは規約の側が決めるので、実装は判定だけ済ませて通す。
 */
export abstract class AiProvider {
  /** 記録とエラー文へ出す名前。 */
  abstract readonly name: string;

  /** 規約の側が読む共通の欄。 */
  abstract readonly settings: CommonSettings;

  /**
   * 組み立て済みの本文を送る。
   *
   * 叩けないと分かっている状態（キーの欠落など）は、送る前に例外で落とす。
   * 上限を決めるのは規約の側なので、`signal` は作らずに受け取り、待ちに入る操作へそのまま渡す。
   */
  abstract send(
    system: string,
    userContent: string,
    signal: AbortSignal,
  ): Promise<ProviderResponse>;
}
