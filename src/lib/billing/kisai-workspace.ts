import type { Shoki } from "./shoki";
import type { TekiyoAnswer } from "./tekiyo";
/** workspaceの追加キー。既存の保存が無い場合は空。日付は絶対日付で保存する。 */
export interface KisaiWorkspace { shoki: Shoki[]; tekiyoAnswers: TekiyoAnswer[] }
export function kisaiWorkspace(saved?: Partial<KisaiWorkspace> | null): KisaiWorkspace {
  return { shoki: saved?.shoki ? structuredClone(saved.shoki) : [], tekiyoAnswers: saved?.tekiyoAnswers ? structuredClone(saved.tekiyoAnswers) : [] };
}
