import { patternCourse } from "./day-pattern";
// Turn orders into the short lines shown in the chart.

import { BASIC_SETS, DEPT_SETS } from "./lab-sets";
import { timingName } from "./rx";
import { addDays, formatShort, type CalendarDate } from "./dates";
import { LAB_TESTS, findDrug, findLab, findOralDrug, findSet } from "./master";
import { AREA_LABEL, DEPTH_LABEL, consultText, findProc, findProcDrug, guideText, hdText, leaveText, moveText, procScheduleText, rehabText, txText } from "./procedures";
import { opdBookingText } from "./opd-booking";
import type { ImagingOrder, InjectionOrder, InjectionSchedule, LabOrder, Order, PhysioOrder, PrescriptionOrder, ProcedureOrder } from "./types";
import { consentText, defaultPosition, findAgent, findPhysio, findRegion, regionLabel, usesContrast, viewsText, type ImagingDraft } from "./exams";

export function scheduleText(s: InjectionSchedule): string {
  switch (s.kind) {
    case "per_day":
      return `1日${s.count}回`;
    case "every_hours":
      return `${s.hours}時間ごと`;
    case "once":
      return "1回のみ";
  }
}

/** Fluids are counted in bags ("本"), other drugs in doses ("回"). */
export function scheduleLabel(s: InjectionSchedule, mainDrugCode?: string | null): string {
  const main = mainDrugCode ? findDrug(mainDrugCode) : undefined;
  if (s.kind === "per_day" && main?.kind === "輸液") return `1日${s.count}本`;
  return scheduleText(s);
}

export function scheduleTextFor(order: InjectionOrder): string {
  return order.sliding ? `スライディングスケール（${order.sliding.times.join("・")}）` : scheduleLabel(order.schedule, order.items[0]?.drugCode);
}

/** "30分", "1時間", "10時間", "1時間30分" */
export function durationText(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}分`;
  return m % 60 === 0 ? `${m / 60}時間` : `${Math.floor(m / 60)}時間${m % 60}分`;
}

export function drugName(code: string): string {
  const d = findDrug(code);
  return d ? `${d.name} ${d.package}` : code;
}

export function labName(code: string): string {
  // The master's name may carry an explanation in parentheses (「PT（プロトロンビン時間。…）」): the record keeps
  // the name only, so an order line stays one line.
  const raw = findSet(code)?.name ?? findLab(code)?.name ?? code;
  return raw.replace(/（[^（）]*。[^（）]*）/g, "").trim();
}

/** Dose as package count when mass and package strength use compatible units. */
export function injectionItemText(it: { drugCode: string; amount: number; unit: string }): string {
  const d = findDrug(it.drugCode);
  const st = d?.strength;
  const mass = (v: number, u: string) => u === "mg" ? v / 1000 : v;
  if (d && st && ["g", "mg"].includes(it.unit) && ["g", "mg"].includes(st.unit)) {
    const count = mass(it.amount, it.unit) / mass(st.amount, st.unit);
    return `${d.name}　${d.package} × ${Number(count.toFixed(3))}${st.per}`;
  }
  return `${drugName(it.drugCode)}　${it.amount}${it.unit}`;
}

export function injectionLines(order: InjectionOrder, today: CalendarDate): { main: string; detail: string } {
  const main = order.items.map((it) => order.sliding ? `${drugName(it.drugCode)}　スケール` : injectionItemText(it)).join(" ＋ ");
  const parts = [order.route, scheduleTextFor(order)];
  if (order.minutesPerDose) parts.push(`1回${durationText(order.minutesPerDose)}`);
  if (order.rateMlPerH) parts.push(`${order.rateMlPerH}mL/時`);
  const start = formatShort(addDays(today, order.start.day));
  parts.push(`開始 ${start}${order.start.time ? ` ${order.start.time}` : ""}`);
  if (order.schedule.kind !== "once") parts.push(patternCourse(order.dayPattern, order.start.day, order.days, false, today));
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

/** 「K（至急）、Na（至急）、血算」: the items, each marked when it alone is 至急. */
export function labItemsText(order: Pick<LabOrder, "codes" | "urgentCodes">): string {
  const urgent = new Set(order.urgentCodes ?? []);
  return order.codes.map((c) => `${labName(c)}${urgent.has(c) ? "（至急）" : ""}`).join("、");
}

/** セットとパネルの内訳を、採血カードと下書きで共通に示す。 */
export function labAnalytes(codes: string[]): string[] {
  return [...new Set(codes.flatMap((code): string[] => {
    const set = findSet(code);
    if (set) return labAnalytes(set.labCodes);
    const test = LAB_TESTS.find((t) => t.code === code);
    return test?.contains?.length ? test.contains : [test?.abbr ?? labName(code)];
  }))];
}
export function labCardText(order: Pick<LabOrder, "codes" | "urgentCodes">, limit?: number): string {
  const codes = order.codes;
  const set = [...BASIC_SETS, ...DEPT_SETS.flatMap((x) => x.sets)].find((x) => x.codes.length === codes.length && x.codes.every((c) => codes.includes(c)));
  const items = labAnalytes(codes);
  const text = (limit ? items.slice(0, limit) : items).join("・") + (limit && items.length > limit ? `・ほか ${items.length - limit} 項目` : "");
  const name = set?.name ?? codes.map((c) => findSet(c)?.name).filter(Boolean).join("・");
  return (name ? `${name}（${text}）` : text) + (order.urgentCodes?.length ? `　至急：${order.urgentCodes.map(labName).join("・")}` : "");
}

export function labLines(order: LabOrder, today: CalendarDate): { main: string; detail: string } {
  const main = labItemsText(order);
  const when = `${formatShort(addDays(today, order.collect.day))} ${order.collect.time}`;
  const parts = [`採取 ${when}`, order.priority];
  if (order.site) parts.push(order.site);
  if (order.purpose) parts.push(`目的：${order.purpose}`);
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

export function oralName(code: string): string {
  const d = findOralDrug(code);
  return d ? `${d.name}${d.name.includes(d.strength) ? "" : ` ${d.strength}`}` : code;
}

/** "1日2回 朝・夕" or "頓用 発熱時（38.5℃以上） 1日3回まで" */
export function timingText(o: PrescriptionOrder): string {
  if (o.once) return `1回だけ・今すぐ（${o.once.time}）`;
  if (o.timings.length === 0) return `頓用 ${o.prn ?? ""}${o.maxPerDay ? ` 1日${o.maxPerDay}回まで` : ""}`.trim();
  return `1日${o.timings.length}回 ${timingName(o.timings)}`;
}

export function prescriptionLines(order: PrescriptionOrder, today: CalendarDate): { main: string; detail: string } {
  const main = `${oralName(order.drugCode)}　1回${order.amount}${order.unit}${order.dailyAmount ? `（1日${order.dailyAmount}${order.unit}）` : ""}`;
  const parts: string[] = [order.category, timingText(order)];
  parts.push(`開始 ${formatShort(addDays(today, order.start.day))}${order.start.timing ? ` ${order.start.timing}` : ""}`);
  if (!order.once) parts.push(patternCourse(order.dayPattern, order.start.day, order.days, true, today));
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

export function procName(code: string): string {
  return findProc(code)?.name ?? code;
}

/** "褥瘡処置　仙骨部" / "酸素吸入　鼻カニュラ 2L/分" */
export function procedureTitle(o: ProcedureOrder): string {
  const parts = [procName(o.code)];
  if (o.o2) parts.push(`${o.o2.device} ${o.o2.lpm}L/分`);
  if (o.hd) parts.push(`${o.hd.method}（${o.hd.purpose}）`);
  if (o.site) parts.push(o.site);
  return parts.join("　");
}

export function procedureLines(order: ProcedureOrder, today: CalendarDate): { main: string; detail: string } {
  // 外来予約: the clinic, the day and slot, and what for (no 開始・日数 — it is one visit).
  if (order.opd) return { main: `${procName(order.code)}　${order.opd.dept}`, detail: [opdBookingText(order.opd, (d) => formatShort(addDays(today, d))), order.comment].filter(Boolean).join("　") };
  const parts: string[] = [];
  if (order.hd) parts.push(hdText(order.hd));
  if (order.tx) parts.push(txText(order.tx));
  if (order.rehab) parts.push(rehabText(order.rehab));
  if (order.consult) parts.push(consultText(order.consult));
  if (order.leave) parts.push(leaveText(order.leave, (d) => formatShort(addDays(today, d))));
  if (order.guide) parts.push(guideText(order.guide));
  if (order.move) parts.push(moveText(order.move));
  if (order.depth) parts.push(DEPTH_LABEL[order.depth].split(" ")[0]);
  if (order.area) parts.push(AREA_LABEL[order.area]);
  parts.push(procScheduleText(order.schedule));
  if (order.drug) {
    const d = findProcDrug(order.drug.code);
    parts.push(`${d?.name ?? order.drug.code} ${order.drug.amount}${d?.unit ?? ""}`);
  }
  parts.push(`開始 ${formatShort(addDays(today, order.start.day))}${order.start.time ? ` ${order.start.time}` : ""}`);
  if (order.schedule.kind !== "continuous") parts.push(order.days ? `${order.days}日間` : "継続");
  if (order.comment) parts.push(order.comment);
  return { main: procedureTitle(order), detail: parts.join("　") };
}

function examWhen(w: ImagingOrder["when"], today: CalendarDate): string {
  return w.priority === "至急" ? "至急" : `${formatShort(addDays(today, w.day))}${w.time ? ` ${w.time}` : ""} 予約`;
}

type ImagingLike = Pick<ImagingOrder, "modality" | "region"> & Partial<Pick<ImagingOrder, "side" | "views" | "position" | "contrast" | "agent" | "ct" | "mri" | "note" | "consent">>;

/** 「単純＋造影（門脈相）」「造影（CTA（血管））」: the contrast and, for CT, the method that goes with it. */
export function contrastText(o: ImagingLike): string {
  if (!o.contrast) return "";
  const extra = [o.ct?.mode && o.ct.mode !== "通常" ? o.ct.mode : null, o.ct?.phases?.length ? o.ct.phases.join("・") : null].filter(Boolean);
  return `${o.contrast}${extra.length ? `（${extra.join("、")}）` : ""}`;
}

/** 「CT　腹部・骨盤　単純＋造影（門脈相）」「X線　右手関節」: what the study is (lists, RIS, PACS). */
export function imagingTitle(o: ImagingLike): string {
  return `${o.modality}　${regionLabel(o.region, o.side)}${o.contrast ? `　${contrastText(o)}` : ""}`;
}

/** 「正面・側面（2方向）　座位」「5mm　骨条件・3D　範囲：横隔膜〜恥骨　仰臥位」「T1・T2・拡散強調（DWI）」: how it is taken. */
export function imagingMethodText(o: ImagingLike): string {
  const parts: string[] = [];
  const xray = o.modality === "X線" || o.modality === "ポータブルX線";
  if (xray && o.views?.length) parts.push(viewsText(o.views));
  if (o.ct) {
    if (o.ct.sliceMm) parts.push(`${o.ct.sliceMm}mm`);
    if (o.ct.recon.length) parts.push(o.ct.recon.join("・"));
    if (o.ct.range) parts.push(`範囲：${o.ct.range}`);
  }
  if (o.mri?.sequences.length) parts.push(o.mri.sequences.join("・"));
  if (o.agent) {
    const a = findAgent(o.agent.code);
    parts.push(`${a?.name ?? o.agent.code}${o.agent.mL ? ` ${o.agent.mL}mL` : ""}`);
  }
  // The position is left out when every view already names one (臥位正面・立位正面).
  if (o.position && !(xray && o.views?.length && o.views.every((v) => /立位|臥位|座位/.test(v)))) parts.push(o.modality === "ポータブルX線" ? `病室で${o.position}` : o.position);
  if (o.note) parts.push(o.note);
  return parts.join("　");
}

/** 「X線　右手関節　正面・側面（2方向）　座位」「CT　胸部〜骨盤　単純＋造影（門脈相）　5mm　同意済」: the whole order in one line. */
export function imagingSummary(o: ImagingLike): string {
  return [imagingTitle(o), imagingMethodText(o), usesContrast({ modality: o.modality, contrast: o.contrast ?? null, ct: o.ct }) ? consentText(o.consent) || "同意：未取得" : ""].filter(Boolean).join("　");
}

/** The same line for a draft that is still being filled in (「部位？」「左右？」 where something is missing). */
export function imagingDraftText(d: ImagingDraft): string {
  const region = d.region ? findRegion(d.region) : undefined;
  const side = region?.sided ? (d.side ?? "左右？") : "";
  const o: ImagingLike = {
    modality: d.modality ?? ("X線" as const),
    region: d.region ?? "",
    views: d.views ?? undefined,
    position: d.position ?? defaultPosition(d.modality, region),
    contrast: d.contrast ?? undefined,
    agent: d.agent ?? undefined,
    ct: d.ct ?? undefined,
    mri: d.mri ?? undefined,
    note: d.note ?? undefined,
    consent: d.consent ?? undefined,
  };
  const head = `${d.modality ?? "種類？"}　${side}${region?.name ?? "部位？"}${o.contrast ? `　${contrastText(o)}` : ""}`;
  const xray = d.modality === "X線" || d.modality === "ポータブルX線";
  const method = xray && !d.views?.length ? `方向？　${imagingMethodText({ ...o, views: undefined })}` : imagingMethodText(o);
  return [head, method, usesContrast(d) ? consentText(d.consent) || "同意：未取得" : ""].filter(Boolean).join("　");
}

export function imagingLines(o: ImagingOrder, today: CalendarDate): { main: string; detail: string } {
  const parts = [imagingMethodText(o), o.reading && `読影 ${o.reading}`, examWhen(o.when, today), o.transport, `目的：${o.purpose}`, o.acks?.join("・"), o.answers?.metal && `体内金属：${o.answers.metal}`, usesContrast(o) ? consentText(o.consent) || "同意：未取得" : null, o.comment].filter(Boolean) as string[];
  return { main: imagingTitle(o), detail: parts.join("　") };
}

export function physioLines(o: PhysioOrder, today: CalendarDate): { main: string; detail: string } {
  const parts = [examWhen(o.when, today), o.place, o.transport, `目的：${o.purpose}`, o.comment].filter(Boolean) as string[];
  return { main: findPhysio(o.test)?.name ?? o.test, detail: parts.join("　") };
}

export function orderLines(order: Order, today: CalendarDate) {
  if (order.type === "imaging") return imagingLines(order, today);
  if (order.type === "physio") return physioLines(order, today);
  if (order.type === "injection") return injectionLines(order, today);
  if (order.type === "lab") return labLines(order, today);
  if (order.type === "procedure") return procedureLines(order, today);
  return prescriptionLines(order, today);
}

export const ORDER_TYPE_LABEL: Record<Order["type"], string> = {
  injection: "注射",
  lab: "検体検査",
  prescription: "処方",
  procedure: "処置",
  imaging: "画像検査",
  physio: "生理検査",
};
