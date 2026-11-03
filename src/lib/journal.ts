// 看護日誌（病棟の管理日誌）: the day's numbers of a ward, counted by code from the record — beds,
// admissions and discharges, patients needing attention — with the charge nurse's own words added.

import { WARD_PLANS, emptyBeds, floorOf, isolationFor, nurseFor, type BedAssignment, type Floor, type WardState } from "./ward";

export interface JournalLine {
  label: string;
  value: number;
  who?: string[];
}

export interface JournalInput {
  floor: Floor;
  ward: WardState;
  /** Beds of every floor (to count this floor's). */
  beds: BedAssignment[];
  requests: { ward: string; status: string; name: string }[];
  restrained: string[];
  callsMet: string[];
  surgeriesToday: string[];
  dialysisToday: string[];
  incidentsToday: number;
}

export function journalLines(i: JournalInput): JournalLine[] {
  const here = i.beds.filter((b) => floorOf(b.room) === i.floor.name);
  const nameOf = (b: BedAssignment) => (b.patientId ? (i.ward.patient(b.patientId)?.name ?? b.patientId) : (b.other?.name ?? ""));
  const capacity = i.floor.rooms.reduce((n, r) => n + r.beds.length, 0);
  const plans = WARD_PLANS.filter((p) => floorOf(p.room) === i.floor.name);
  const newToday = here.filter((b) => b.patientId && i.ward.patient(b.patientId)?.admittedOn === 0);
  const iso = here.filter((b) => (b.patientId ? isolationFor(i.ward.patient(b.patientId)?.infections ?? []) : /予防策/.test(b.other?.note ?? "")));
  const names = (xs: string[]) => xs.filter((x) => here.some((b) => nameOf(b) === x));
  return [
    { label: "在院患者", value: here.length },
    { label: "空床", value: emptyBeds(here, i.floor.rooms).length, who: [`定床 ${capacity}床`] },
    { label: "今日の入院", value: newToday.length + plans.filter((p) => p.day === 0 && p.kind === "入院").length, who: [...newToday.map(nameOf), ...plans.filter((p) => p.day === 0 && p.kind === "入院").map((p) => `${p.name}（予定 ${p.time}）`)] },
    { label: "今日・明日の退院予定", value: plans.filter((p) => p.kind === "退院").length, who: plans.filter((p) => p.kind === "退院").map((p) => `${p.name}（${p.day === 0 ? "今日" : "明日"} ${p.time}）`) },
    { label: "入院申込（ベッド待ち）", value: i.requests.filter((r) => r.ward === i.floor.name && r.status === "申込").length, who: i.requests.filter((r) => r.ward === i.floor.name && r.status === "申込").map((r) => r.name) },
    { label: "感染対策（予防策）", value: iso.length, who: iso.map(nameOf) },
    { label: "身体的拘束中", value: names(i.restrained).length, who: names(i.restrained) },
    { label: "医師を呼ぶ基準に当たる", value: names(i.callsMet).length, who: names(i.callsMet) },
    { label: "今日の手術", value: names(i.surgeriesToday).length, who: names(i.surgeriesToday) },
    { label: "今日の透析", value: names(i.dialysisToday).length, who: names(i.dialysisToday) },
    { label: "今日のインシデント報告", value: i.incidentsToday },
  ];
}

/** 日勤の担当（架空）: nurse → rooms of this floor. */
export function staffing(floor: Floor): { nurse: string; rooms: string[] }[] {
  const out = new Map<string, string[]>();
  for (const r of floor.rooms) out.set(nurseFor(r.no), [...(out.get(nurseFor(r.no)) ?? []), r.no]);
  return [...out.entries()].map(([nurse, rooms]) => ({ nurse, rooms: rooms.sort() }));
}
