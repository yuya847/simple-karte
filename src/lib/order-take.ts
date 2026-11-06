import { patternText } from "./day-pattern";
// 指示受け: how a nurse takes the doctor's order changes, made safer from public patient-safety material
// and hospitals' EHR specifications — a 変更 is shown as one row with what changed before and after, some rows
// cannot be taken in bulk (high-risk drugs, urgent, verbal, changed doses), related orders are put next to a
// meal stop, and urgent or off-hours orders stand out. Code compares and labels; nurses and doctors decide.

import { orderLines, scheduleTextFor } from "./format";
import { anyDrugName, findDrug, findOralDrug } from "./master";
import type { CalendarDate } from "./dates";
import type { OrderEntry, InjectionOrder, PrescriptionOrder } from "./types";
import type { OrderChange, OtherChange, WorkPatient } from "./worksheet";

export const TAKE_SOURCES = [
  { label: "日本医療機能評価機構 医療安全情報 No.20「伝達されなかった指示変更」", url: "https://www.med-safe.jp/pdf/med-safe_20.pdf" },
  { label: "同 第18回報告書（指示受けで流量・投与量の変更を含めて確かめる）", url: "https://www.med-safe.jp/pdf/report_2009_2_R004.pdf" },
  { label: "同 医療安全情報 No.215「食事中止時のインスリン投与による低血糖」", url: "https://www.med-safe.jp/pdf/med-safe_215.pdf" },
  { label: "同 第72回報告書（ダブルチェックは2人とも自分の目で）", url: "https://www.nurse.or.jp/nursing/assets/pdf/report_72.pdf" },
];

/** Drugs this fictional hospital takes one at a time with a second nurse (施設の高リスク薬、架空の病院の取り決め). */
export function highRiskOf(o: OrderEntry["order"]): string | null {
  if (o.type !== "injection") return null;
  for (const it of o.items) {
    if (it.drugCode === "INJ-KCL20") return "高リスク薬（カリウム注）";
    if (findDrug(it.drugCode)?.chemo) return "高リスク薬（抗がん剤）";
  }
  return null;
}

/** Oral and injected drugs that lower blood glucose (shown with a meal stop: 医療安全情報 No.215). */
export const GLUCOSE_LOWERING = ["ORAL-MET250"];

export interface DiffLine {
  label: string;
  before: string;
  after: string;
}

const injFields = (o: InjectionOrder): [string, string][] => [
  ["薬と量", o.items.map((it) => `${anyDrugName(it.drugCode)} ${it.amount}${it.unit}`).join("＋")],
  ["スケール", o.sliding ? o.sliding.rows.map(r=>`${r.from}〜${r.to ?? "上限なし"}：${r.units}単位`).join("／") + `・連絡 ${o.sliding.callAbove ?? "指定なし"}` : "固定量"],
  ["経路", o.route],
  ["回数・時刻", scheduleTextFor(o)],
  ["投与日", patternText(o.dayPattern)],
  ["1回の時間", o.minutesPerDose ? `${o.minutesPerDose}分` : "—"],
  ["速さ", o.rateMlPerH ? `${o.rateMlPerH}mL/時` : "—"],
  ["日数", o.days ? `${o.days}日間` : "継続"],
];
const rxFields = (o: PrescriptionOrder): [string, string][] => [
  ["薬", findOralDrug(o.drugCode) ? `${findOralDrug(o.drugCode)!.name} ${findOralDrug(o.drugCode)!.strength}` : o.drugCode],
  ["1回量", `${o.amount}${o.unit}`],
  ["投与日", patternText(o.dayPattern)],
  ["用法", o.timings.length ? o.timings.join("・") : `頓用 ${o.prn ?? ""}`],
  ["日数", o.days ? `${o.days}${o.dayPattern ? "投与日分" : "日分"}` : "—"],
  ["1日の上限", o.maxPerDay ? `${o.maxPerDay}回` : "—"],
];

/** What differs between the stopped order and the one that replaced it (only the fields that changed). */
export function diffOrders(a: OrderEntry["order"], b: OrderEntry["order"], today: CalendarDate): DiffLine[] {
  let fa: [string, string][];
  let fb: [string, string][];
  if (a.type === "injection" && b.type === "injection") [fa, fb] = [injFields(a), injFields(b)];
  else if (a.type === "prescription" && b.type === "prescription") [fa, fb] = [rxFields(a), rxFields(b)];
  else {
    const la = orderLines(a, today);
    const lb = orderLines(b, today);
    [fa, fb] = [
      [["内容", la.main], ["詳細", la.detail]],
      [["内容", lb.main], ["詳細", lb.detail]],
    ];
  }
  return fa.flatMap(([label, before], i) => (before !== fb[i][1] ? [{ label, before, after: fb[i][1] }] : []));
}

const keyDrug = (o: OrderEntry["order"]) => (o.type === "injection" ? o.items[0]?.drugCode : o.type === "prescription" ? o.drugCode : o.type === "procedure" ? o.code : o.type);

export interface TakeRow {
  /** Key of the row (the first change key); `keys` are all the changes it takes. */
  key: string;
  keys: string[];
  kind: "新規" | "中止" | "変更" | "延長" | "食事" | "指示簿";
  at: number;
  timeKnown: boolean;
  patientId: string;
  room: string;
  name: string;
  type: string;
  main: string;
  detail: string;
  author: string;
  /** 変更: the order before, and what changed. */
  before?: { main: string; detail: string };
  diff?: DiffLine[];
  flags: { resident?: string; urgent?: string; offHours?: string; highRisk?: string; verbal?: string; changed?: string };
  /** Related orders shown with it (e.g. a meal stop next to glucose-lowering drugs). */
  related: string[];
  /** Why it must be taken one at a time (not with まとめて受ける). Empty = may be taken in bulk. */
  mustOne: string[];
}

const minutesOfDay = (abs: number) => ((abs % 1440) + 1440) % 1440;
/** 時間外: an order entered outside the day shift (08:30–17:00, 架空の病院の取り決め). */
export const offHoursAt = (abs: number) => minutesOfDay(abs) < 510 || minutesOfDay(abs) >= 1020;

/** Rows for 指示受け: a stop and a new order of the same drug entered together become one 変更 row. */
export function takeRows(changes: (OrderChange | OtherChange)[], people: WorkPatient[], today: CalendarDate): TakeRow[] {
  const used = new Set<string>();
  const orderChanges = changes.filter((c): c is OrderChange => "entry" in c);
  const rows: TakeRow[] = [];
  const typeLabel = (e: OrderEntry) => ({ injection: "注射", prescription: "内服", lab: "検体検査", imaging: "画像", physio: "生理・内視鏡", procedure: "処置" })[e.order.type as "injection"] ?? e.order.type;
  for (const c of changes) {
    if (used.has(c.key)) continue;
    if (!("entry" in c)) {
      // 食事: put the glucose-lowering drugs still in effect next to a meal stop (No.215).
      const stop = /絶食|食止め|止め/.test(c.text.main);
      const related = stop
        ? (people.find((x) => x.patient.id === c.patientId)?.entries ?? [])
            .filter((e) => e.status === "有効" && ((e.order.type === "prescription" && GLUCOSE_LOWERING.includes(e.order.drugCode)) || (e.order.type === "injection" && e.order.items.some((it) => /インスリン/.test(anyDrugName(it.drugCode))))))
            .map((e) => `有効：${orderLines(e.order, today).main}（このオーダは変わっていません）`)
        : [];
      rows.push({ key: c.key, keys: [c.key], kind: c.text.main.startsWith("【変】") ? "変更" : c.kind, at: c.at, timeKnown: c.timeKnown, patientId: c.patientId, room: c.room, name: c.name, type: c.text.type, main: c.text.main, detail: c.text.detail, author: c.text.author, flags: c.text.main.startsWith("【変】") ? { changed: "変更（前と後を確かめる）" } : {}, related, mustOne: c.text.main.startsWith("【変】") ? ["指示簿の変更"] : related.length ? ["食事の変更（血糖を下げる薬が有効）"] : [] });
      continue;
    }
    let kind: TakeRow["kind"] = c.kind;
    let before: TakeRow["before"];
    let diff: DiffLine[] | undefined;
    let keys = [c.key];
    let entry = c.entry;
    // A 修正 is a stop and a new order of the same drug at the same time: one 変更 row.
    const partner = orderChanges.find((d) => d !== c && !used.has(d.key) && d.patientId === c.patientId && d.kind !== c.kind && d.entry.order.type === c.entry.order.type && keyDrug(d.entry.order) === keyDrug(c.entry.order) && Math.abs(d.at - c.at) <= 2);
    if (partner) {
      const stopped = c.kind === "中止" ? c : partner;
      const added = c.kind === "中止" ? partner : c;
      used.add(partner.key);
      kind = "変更";
      keys = [stopped.key, added.key];
      entry = added.entry;
      before = orderLines(stopped.entry.order, today);
      diff = diffOrders(stopped.entry.order, added.entry.order, today);
    }
    if (entry.order.type === "injection" && entry.order.replaces) {
      const previous = people.find(p=>p.patient.id === c.patientId)?.entries.find(e=>e.id === (entry.order as InjectionOrder).replaces);
      if(previous) { kind="変更"; before=orderLines(previous.order,today); diff=diffOrders(previous.order,entry.order,today); }
    }
    const { main, detail } = orderLines(entry.order, today);
    const o = entry.order;
    const startAbs = o.type === "injection" ? o.start.day * 1440 + (o.start.time ? Number(o.start.time.slice(0, 2)) * 60 + Number(o.start.time.slice(3, 5)) : c.at) : null;
    const flags: TakeRow["flags"] = {};
    if (kind !== "中止" && o.type === "lab" && o.priority === "至急") flags.urgent = "至急";
    else if (kind !== "中止" && startAbs !== null && startAbs - c.at <= 60) flags.urgent = "すぐ始まる（指示から60分以内）";
    if (offHoursAt(c.at)) flags.offHours = "時間外の指示（日勤 8:30〜17:00 以外）";
    const hr = highRiskOf(o);
    if (hr && kind !== "中止") flags.highRisk = hr;
    if (entry.verbal) flags.verbal = `口頭指示（${entry.verbal.doctor} → ${entry.verbal.takenBy}）`;
    if (kind === "変更") flags.changed = "変更（前と後を確かめる）";
    const mustOne = [flags.highRisk, flags.urgent, flags.verbal, flags.changed].filter((x): x is string => !!x);
    rows.push({ key: keys[0], keys, kind, at: c.at, timeKnown: c.timeKnown, patientId: c.patientId, room: c.room, name: c.name, type: typeLabel(entry), main, detail, author: entry.author, before, diff, flags, related: [], mustOne });
  }
  return rows;
}

/** 医師に確認: a nurse holds a change instead of taking it; the doctor answers; the nurse then takes it. */
export const HOLD_REASONS = ["量・単位がわからない", "時刻・回数がわからない", "重複・飲み合わせが気になる", "患者の状態に合わない気がする", "その他"] as const;
export interface TakeHold {
  by: string;
  at: string;
  reason: (typeof HOLD_REASONS)[number];
  note: string;
  answer?: { by: string; at: string; text: string };
}

/** Order of the 指示受け list: not yet taken and urgent first, then by time. */
export const sortRows = (rows: TakeRow[], taken: (r: TakeRow) => boolean) =>
  [...rows].sort((a, b) => Number(taken(a)) - Number(taken(b)) || Number(!!b.flags.urgent) - Number(!!a.flags.urgent) || a.at - b.at);
