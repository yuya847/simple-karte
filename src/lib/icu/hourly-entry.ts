// ICU・HCU の1時間の記録を、経過表のセルから入れるときの決まり。保存の形は ICU 記録の hourly のまま
// （H:00 の記録が H−1時〜H時の量。時間表と同じ）。
import { abs } from "../flowsheet";
import { hourlyGcs } from "./hourly-gcs";
import type { HourlyRecord } from "./types";

export const HOURLY_FIELDS = [["map", "MAP mmHg"], ["cvp", "CVP mmHg"], ["rass", "RASS"], ["cpot", "CPOT"], ["urineMl", "尿量 mL"], ["drainMl", "ドレーン mL"], ["gastricMl", "胃管 mL"], ["stoolMl", "便 mL"], ["bloodLossMl", "出血 mL"], ["enteralMl", "経腸 mL"], ["otherInMl", "その他 IN mL"], ["glucose", "血糖 mg/dL"]] as const;

/** The record of the hour that ends at `end` (abs minutes of H:00): the last one in (end − 60, end]. */
export function hourRecord(records: HourlyRecord[], patientId: string, end: number): HourlyRecord | undefined {
  return records.filter((r) => r.patientId === patientId && abs(r.at.day, r.at.time) > end - 60 && abs(r.at.day, r.at.time) <= end).sort((a, b) => abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time)).at(-1);
}

const num = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : Number(v));

/**
 * The record of one hour from what was typed (field name → text): the typed values replace those of the hour's
 * record (kept by its id); an empty box clears its value. Throws with the message to show when a value is out of range.
 */
export function hourlyFromValues(v: Record<string, string | undefined>, old: HourlyRecord | undefined, base: Pick<HourlyRecord, "id" | "patientId" | "at" | "by">): HourlyRecord {
  const row: HourlyRecord = { ...old, ...base, id: old?.id ?? base.id };
  for (const [k] of HOURLY_FIELDS) {
    const value = num(v[k]);
    if (value !== undefined && (!Number.isFinite(value) || (k !== "rass" && value < 0) || (k === "rass" && (value < -5 || value > 4)) || (k === "cpot" && value > 8))) throw new Error("入力値を確かめてください");
    row[k] = value;
  }
  row.arterialLine = v.arterialLine === "on";
  row.camIcu = (v.camIcu || undefined) as HourlyRecord["camIcu"];
  const right = num(v.pupilRight), left = num(v.pupilLeft);
  row.pupils = right !== undefined && left !== undefined ? { right, left, reactRight: (v.reactRight || "+") as "+", reactLeft: (v.reactLeft || "+") as "+" } : undefined;
  row.gcs = hourlyGcs(v.gcsE ?? "", v.gcsV ?? "", v.gcsM ?? "");
  row.note = v.note || undefined;
  return row;
}

/** What the flow sheet's ICU rows show for one record (empty = nothing in that row). */
export const hourlyCell = {
  map: (r: HourlyRecord) => (r.map === undefined ? "" : String(Math.round(r.map))),
  cvp: (r: HourlyRecord) => (r.cvp === undefined ? "" : String(r.cvp)),
  rass: (r: HourlyRecord) => (r.rass === undefined ? "" : r.rass > 0 ? `+${r.rass}` : String(r.rass)),
  cpot: (r: HourlyRecord) => (r.cpot === undefined ? "" : String(r.cpot)),
  cam: (r: HourlyRecord) => r.camIcu ?? "",
  pupils: (r: HourlyRecord) => (r.pupils ? `${r.pupils.right}${r.pupils.reactRight}/${r.pupils.left}${r.pupils.reactLeft}` : ""),
  gcs: (r: HourlyRecord) => (r.gcs ? `E${r.gcs.e ?? "—"}V${r.gcs.v ?? "—"}M${r.gcs.m ?? "—"}` : ""),
};
