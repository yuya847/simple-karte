import type { HourlyRecord } from "./types";
export const MAP_HINT = "MAP = (収縮期血圧 + 2×拡張期血圧) ÷ 3（整数）。ICU 記録の動脈ライン実測 MAP があれば優先。";
export const mapOf = (sbp?: number, dbp?: number): number | null => sbp !== undefined && dbp !== undefined && Number.isFinite(sbp) && Number.isFinite(dbp) ? Math.round((sbp+2*dbp)/3) : null;
export const mapWithMeasured = (hourly: Pick<HourlyRecord,"map"> | undefined, sbp?: number, dbp?: number) => hourly?.map !== undefined && Number.isFinite(hourly.map) ? hourly.map : mapOf(sbp,dbp);
