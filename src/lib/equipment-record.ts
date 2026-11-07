import type { Equipment } from "./specialist";

/** Missing input for a recorded treatment interval, including continuous ICU dialysis. */
export function equipmentRecordProblems(device: Equipment | undefined, kind: string, start: string, end: string, uf: string, qb: string, anticoag: string, result: string, text: string): string[] {
  const missing: string[] = [];
  if (!device) missing.push("機器を選んでください");
  if (kind === "透析実施") {
    if (device && !device.hd && !/CHDF|CHD|CHF/.test(device.label)) missing.push("透析の機器を選んでください");
    if (!start || !Number.isFinite(Date.parse(start))) missing.push("開始日時");
    if (!end || !Number.isFinite(Date.parse(end))) missing.push("終了日時");
    if (start && end && end < start) missing.push("終了は開始以降にしてください");
    if (!uf.trim() || !Number.isFinite(Number(uf)) || Number(uf) < 0) missing.push("除水量（0以上）");
    if (!qb.trim() || !Number.isFinite(Number(qb)) || Number(qb) <= 0) missing.push("血流量（0より大きい値）");
    if (!anticoag.trim()) missing.push("抗凝固薬・量");
  } else if (result === "異常あり" && !text.trim()) missing.push("実施内容・コメント");
  return missing;
}
