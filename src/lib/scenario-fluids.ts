import type { InjectionOrder } from "./types";

/** 架空の症例に書かれた経過のための固定データ。実患者の輸液選択には使わない。 */
export function scenarioFluid(order: InjectionOrder, diagnosis: string): InjectionOrder {
  if (!order.items.some(i => ["INJ-SOL3A500", "INJ-VEENF500"].includes(i.drugCode))) return order;
  if (/腎障害|腎盂腎炎|尿路感染|低ナトリウム/.test(diagnosis)) return { ...order, items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], schedule: { kind: "per_day", count: 1 }, rateMlPerH: 50, days: 2, comment: "模擬症例：短期間の補液。尿量・電解質を担当医が確認" };
  if (/術後/.test(diagnosis)) return { ...order, schedule: { kind: "per_day", count: 1 }, rateMlPerH: 80, days: 1, comment: "模擬症例：術当日の補液。翌日から経口摂取を確認" };
  if (/喘息|インフルエンザ/.test(diagnosis)) return { ...order, schedule: { kind: "per_day", count: 1 }, rateMlPerH: 60, days: 1, comment: "模擬症例：入院当日の摂取不足への補液" };
  if (/出血|イレウス|膵炎/.test(diagnosis)) return { ...order, items: [{ drugCode: "INJ-VEENF500", amount: 500, unit: "mL" }], rateMlPerH: 100, days: 2, comment: "模擬症例：初期の補液。絶食と食事再開を担当医が確認" };
  return { ...order, days: 2, comment: "模擬症例：入院初期の補液。経口摂取再開で終了" };
}
