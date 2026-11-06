// 培養の結果の入力（細菌検査）: a culture is reported in steps — 塗抹（グラム染色）, 中間報告（菌名）,
// 最終報告（菌名と薬剤感受性）— each with who and when. Which step may come next, what each step needs,
// and whether a positive blood culture has been phoned in are worked out by code. The technologist
// reads the slide and the plates and chooses; the S/I/R of each drug is the laboratory's judgment
// (the breakpoints it uses), typed in, never worked out here.

import type { LabDesk } from "./lab-desk";
import { findLab, findSet } from "./master";
import { bloodCulturePanic, cultureKeyOf, placeOf, type PanicCall, type Place } from "./results";
import type { CultureResult, CultureStage, DayOffset } from "./types";
import type { WorkPatient } from "./worksheet";

export const STAGE_LABEL: Record<CultureStage, string> = {
  塗抹: "塗抹（グラム染色）",
  中間報告: "中間報告（菌名）",
  最終報告: "最終報告（菌名・感受性）",
};

/** What the Gram stain shows (a fixed list; the technologist chooses). */
export const GRAM_RESULTS = ["グラム陽性球菌（ブドウ状）", "グラム陽性球菌（連鎖状）", "グラム陽性桿菌", "グラム陰性桿菌", "グラム陰性球菌", "酵母様真菌", "菌を認めない"] as const;
export const NO_ORGANISM_SEEN = "菌を認めない";

/** Organisms often named (a fixed list to choose from; another name can be typed). */
export const ORGANISMS = [
  "黄色ブドウ球菌（MSSA）",
  "MRSA（メチシリン耐性黄色ブドウ球菌）",
  "コアグラーゼ陰性ブドウ球菌",
  "肺炎球菌",
  "腸球菌",
  "大腸菌",
  "肺炎桿菌",
  "緑膿菌",
  "カンジダ属",
] as const;
export const NO_GROWTH = "発育なし（陰性）";

/** The drugs of the susceptibility report (a small fixed list; 略号は日本化学療法学会の抗菌薬略号). */
export const AST_DRUGS = [
  { code: "ABPC", name: "アンピシリン" },
  { code: "MPIPC", name: "オキサシリン" },
  { code: "CEZ", name: "セファゾリン" },
  { code: "CTRX", name: "セフトリアキソン" },
  { code: "MEPM", name: "メロペネム" },
  { code: "LVFX", name: "レボフロキサシン" },
  { code: "ST", name: "スルファメトキサゾール・トリメトプリム" },
  { code: "VCM", name: "バンコマイシン" },
] as const;

export type Sir = "S" | "I" | "R";
export type Susceptibility = NonNullable<CultureResult["susceptibility"]>;

export interface CultureStep {
  stage: CultureStage;
  by: string;
  day: DayOffset;
  time: string;
  gram?: string;
  /** For a blood culture: how many of the sets turned positive (e.g. 2セット中1セット陽性). */
  sets?: string;
  organism?: string;
  susceptibility?: Susceptibility;
  note?: string;
}

/** A culture the laboratory works on in this session: as it was when taken up, and each step since. */
export interface CultureWork {
  key: string;
  patientId: string;
  base: CultureResult;
  steps: CultureStep[];
}

/** One culture per patient, specimen and day — or per label code for a sample taken in this session. */
export const cultureKey = (patientId: string, c: Pick<CultureResult, "id" | "collectedOn" | "specimen">) => `${patientId}|${c.id ?? `${c.collectedOn}|${c.specimen}`}`;

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const cultureCodes = (codes: string[]): string[] =>
  codes.flatMap((c) => {
    const set = findSet(c);
    if (set) return cultureCodes(set.labCodes);
    return findLab(c)?.group === "微生物" ? [c] : [];
  });

/** The culture tests of an order (血液培養・尿培養 …), sets opened up. */
export const culturesIn = (codes: string[]) => [...new Set(cultureCodes(codes))];

/** "2セット" from the order's comment (血液培養 2セット), when it says. */
export const setsFrom = (comment?: string) => /(\d+)\s*セット/.exec(comment ?? "")?.[0].replace(/\s/g, "");

/**
 * A sample with culture tests taken in: each culture starts (培養中), under the label code (and the
 * test, when one sample has two cultures). Called when the label is read.
 */
export function startCultures(cultures: Record<string, CultureWork>, row: { code: string; orderId?: string; patientId: string; at: number; codes: string[]; comment?: string }): Record<string, CultureWork> {
  const tests = culturesIn(row.codes);
  if (!tests.length) return cultures;
  const out = { ...cultures };
  for (const t of tests) {
    const lab = findLab(t)!;
    const sets = lab.needs === "sets" ? setsFrom(row.comment) : undefined;
    const identity = row.orderId ? `${row.patientId}|${row.orderId}|${row.at}` : row.code;
    const base: CultureResult = { id: tests.length > 1 ? `${identity}/${t}` : identity, collectedOn: Math.floor(row.at / 1440), specimen: lab.specimen === "その他" ? lab.name.replace(/培養$/, "") : lab.specimen, ...(sets ? { sets } : {}), status: "培養中" };
    const key = cultureKey(row.patientId, base);
    if (!out[key]) out[key] = { key, patientId: row.patientId, base, steps: [] };
  }
  return out;
}

/** The works started from one label code (to drop them when the sample is sent back before any step). */
export const worksOfCode = (cultures: Record<string, CultureWork>, patientId: string, code: string) =>
  Object.values(cultures).filter((w) => w.patientId === patientId && (w.base.id === code || w.base.id?.startsWith(`${code}/`)));

const sirLine = (s: Susceptibility) => s.map((x) => `${x.drug} ${x.result}${x.mic && x.mic !== "—" ? `（${x.mic}）` : ""}`).join("、");

/** One line for the log, the audit and the chart. */
export function stepText(s: Pick<CultureStep, "stage" | "gram" | "sets" | "organism" | "susceptibility" | "note">): string {
  const body =
    s.stage === "塗抹"
      ? `${s.gram ?? ""}${s.sets ? `（${s.sets}）` : ""}`
      : s.stage === "中間報告"
        ? `${s.organism ?? ""}`
        : `${s.organism ?? ""}${s.susceptibility?.length ? `　${sirLine(s.susceptibility)}` : ""}`;
  return `${STAGE_LABEL[s.stage]}：${body}${s.note ? `　${s.note}` : ""}`;
}

/** The culture as reported: what it was when taken up, with each step laid over it. */
export function cultureOf(w: CultureWork): CultureResult {
  let c: CultureResult = { ...w.base };
  for (const s of w.steps) {
    c = {
      ...c,
      status: s.stage === "最終報告" ? "最終報告" : "中間報告",
      stage: s.stage,
      reportedOn: s.day,
      reportedTime: s.time,
      ...(s.gram ? { gram: s.gram } : {}),
      ...(s.sets ? { sets: s.sets } : {}),
      ...(s.organism ? { organism: s.organism } : {}),
      ...(s.susceptibility ? { susceptibility: s.susceptibility } : {}),
      log: [...(c.log ?? []), { stage: s.stage, by: s.by, day: s.day, time: s.time, text: stepText(s) }],
    };
  }
  return c;
}

/** The cultures of a patient as the laboratory reported them in this session (merged over the record by mergeCultures). */
export const deskCultures = (desk: Pick<LabDesk, "cultures">, patientId: string): CultureResult[] =>
  Object.values(desk.cultures)
    .filter((w) => w.patientId === patientId)
    .map(cultureOf);

/** Which steps may come next: 塗抹 first (or straight to a negative final), then the organism, then the final report. */
export function nextStages(c: CultureResult): CultureStage[] {
  if (c.status === "最終報告") return [];
  if (c.status === "培養中" || !(c.gram || c.organism)) return ["塗抹", "最終報告"];
  if (!c.organism) return ["中間報告", "最終報告"];
  return ["最終報告"];
}

export interface CultureItem {
  key: string;
  patientId: string;
  place: Place;
  room: string;
  name: string;
  culture: CultureResult;
  next: CultureStage[];
  /** Why the next step waits (the positive blood culture not phoned in yet). */
  waits?: string;
}

/**
 * The cultures the laboratory works on: every culture of these patients not finally reported, and
 * those it finished in this session. A positive blood culture is phoned in (パニック値) before the
 * next step, so its call never drops out of the list unreported.
 */
export function cultureQueue(people: WorkPatient[], desk: Pick<LabDesk, "cultures">, calls: Record<string, PanicCall>): CultureItem[] {
  const out: CultureItem[] = [];
  for (const { patient: p, room } of people) {
    for (const c of p.cultures) {
      const key = cultureKey(p.id, c);
      const mine = !!desk.cultures[key]?.steps.length;
      if (c.status === "最終報告" && !mine) continue;
      const unreported = bloodCulturePanic(c).length > 0 && !calls[cultureKeyOf(p.id, c)];
      out.push({ key, patientId: p.id, place: placeOf(p.id), room, name: p.name, culture: c, next: unreported ? [] : nextStages(c), ...(unreported ? { waits: "血液培養の陽性（パニック値）を医師に連絡して記録してから、次の報告に進みます。" } : {}) });
    }
  }
  const order = (i: CultureItem) => (i.culture.status === "最終報告" ? 2 : i.waits ? 0 : 1);
  return out.sort((a, b) => order(a) - order(b) || a.culture.collectedOn - b.culture.collectedOn || a.room.localeCompare(b.room));
}

export interface StepInput {
  gram: string | null;
  /** Positive sets of a blood culture, e.g. 1 (of 2). */
  positive: number | null;
  organism: string;
  sir: Record<string, Sir | null>;
  mic: Record<string, string>;
  note: string;
}

export const EMPTY_STEP: StepInput = { gram: null, positive: null, organism: "", sir: {}, mic: {}, note: "" };

/** How many sets were drawn (from the culture, else 2 — the usual number). */
export const setsDrawn = (c: CultureResult) => Number(/(\d+)セット/.exec(c.sets ?? "")?.[1] ?? 2);

/** What a step needs, and the step itself when it is complete. */
export function checkStep(stage: CultureStage, c: CultureResult, input: StepInput): { missing: string[]; step?: Omit<CultureStep, "by" | "day" | "time"> } {
  const blood = c.specimen === "血液";
  const missing: string[] = [];
  const note = input.note.trim() || undefined;
  if (stage === "塗抹") {
    if (!input.gram) missing.push("グラム染色の所見");
    if (blood && input.gram === NO_ORGANISM_SEEN) missing.push("血液培養の塗抹は陽性のボトルで行う（陰性は最終報告で）");
    if (blood && !input.positive) missing.push("陽性のセット数");
    if (missing.length) return { missing };
    return { missing, step: { stage, gram: input.gram!, ...(blood ? { sets: `${setsDrawn(c)}セット中${input.positive}セット陽性` } : {}), ...(note ? { note } : {}) } };
  }
  const organism = input.organism.trim();
  if (!organism) missing.push("菌名");
  if (stage === "中間報告") {
    if (organism === NO_GROWTH) missing.push("発育なしは最終報告で");
    if (missing.length) return { missing };
    return { missing, step: { stage, organism, ...(note ? { note } : {}) } };
  }
  const susceptibility: Susceptibility = AST_DRUGS.flatMap((d) => (input.sir[d.code] ? [{ drug: d.code, mic: input.mic[d.code]?.trim() || "—", result: input.sir[d.code]! }] : []));
  if (organism && organism !== NO_GROWTH && susceptibility.length === 0) missing.push("薬剤感受性（1剤以上）");
  if (missing.length) return { missing };
  return { missing, step: { stage, organism, ...(susceptibility.length && organism !== NO_GROWTH ? { susceptibility } : {}), ...(note ? { note } : {}) } };
}

/** Records a step (who and when). The step must be one that may come next. */
export function addCultureStep(desk: LabDesk, item: Pick<CultureItem, "key" | "patientId" | "culture">, step: Omit<CultureStep, "by" | "day" | "time">, by: string, nowAbs: number): LabDesk {
  if (!nextStages(item.culture).includes(step.stage)) return desk;
  const w = desk.cultures[item.key] ?? { key: item.key, patientId: item.patientId, base: item.culture, steps: [] };
  const s: CultureStep = { ...step, by, day: Math.floor(nowAbs / 1440), time: hhmm(nowAbs) };
  return { ...desk, cultures: { ...desk.cultures, [item.key]: { ...w, steps: [...w.steps, s] } } };
}
