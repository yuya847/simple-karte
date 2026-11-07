import { equipmentOf, type Equipment } from "./specialist";
import type { IcuRecords, At } from "./icu/types";
import { ventAt } from "./icu/abg";
import type { OrderEntry } from "./types";
import type { StandingLine } from "./standing-lines";

const minute = (at: At) => at.day * 1440 + Number(at.time.slice(0, 2)) * 60 + Number(at.time.slice(3));
/** 機器一覧だけで集約する。オーダーや ICU 記録は変更しない。 */
export function boardEquipment(patientId: string, entries: OrderEntry[], lines: StandingLine[] = [], nowTime = "23:59", icu?: IcuRecords): (Equipment & { aliases?: string[] })[] {
  const now = minute({ day: 0, time: nowTime });
  const latest = <T extends { patientId: string; at: At }>(xs: T[]) => xs.filter(x => x.patientId === patientId && minute(x.at) <= now).sort((a, b) => minute(b.at) - minute(a.at))[0];
  const vent = ventAt(icu?.vents ?? [], patientId, now);
  const crrt = latest(icu?.crrt ?? []);
  const devices = equipmentOf(entries, lines, nowTime);
  const kind = (e: Equipment) => e.hd && !/CHDF|CHD|CHF/.test(e.hd.method) ? `dialysis:${e.hd.method}` : /CHDF|CHD|CHF/.test(e.label) ? "crrt" : /人工呼吸|NPPV|ハイフロー|HFNC/.test(e.label) ? "vent" : e.id;
  const rows = new Map<string, Equipment & { aliases?: string[] }>();
  for (const device of devices) {
    const previous = rows.get(kind(device));
    if (previous) previous.aliases = [...(previous.aliases ?? []), device.id];
    else rows.set(kind(device), { ...device });
  }
  if (vent) {
    rows.delete("vent");
    if (vent.mode !== "なし") rows.set("vent", { aliases: devices.filter(e => kind(e) === "vent").map(e => e.id), id: `icu:${patientId}:vent`, label: `${vent.mode === "HFNC" || vent.mode === "NPPV" ? vent.mode : `人工呼吸器 ${vent.mode}`} FiO2 ${vent.fio2}${vent.peep === undefined ? "" : ` PEEP ${vent.peep}`}${vent.flow === undefined ? "" : ` ${vent.flow} L/分`}` });
  }
  if (crrt) {
    rows.delete("crrt");
    if (!crrt.end || minute(crrt.end) > now) rows.set("crrt", { aliases: devices.filter(e => kind(e) === "crrt").map(e => e.id), id: `icu:${patientId}:crrt`, label: `${crrt.mode} 血流量 ${crrt.qb} mL/分・除水 ${crrt.removalMlPerH} mL/時` });
  }
  return [...rows.values()];
}
