// テンプレート（記載のひな形）: a note written by filling a form. The form is read from the template's
// text: {{選択:疼痛:なし|あり}} is a choice, {{数値:尿量:mL}} a number, {{時刻:発見時刻}} a clock time, {{検査:CRP}} the latest result,
// {{計算:BMI}} a value worked out by code from the numbers (the formula is shown with the result).
// Choices, numbers and quotes as in 電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」
// 1.03 の 6・7（テンプレートの作成・変更、選択肢・数字入力・文字入力）. The built-in templates are the
// fictional hospital's; anyone can make their own (kept per person in this browser). Nothing here is
// written or chosen by AI: the person picks, code fills in and calculates, the person confirms the note.

import { cockcroftGault } from "./clinical";
import { addDays, formatShort, hospitalDay, minutesOf, type CalendarDate } from "./dates";
import { ANALYTES } from "./master";
import type { Role } from "./roles";
import type { Patient } from "./types";
import { vitalLine } from "./vitals-text";

export const TEMPLATE_SOURCES = [{ name: "電子カルテ標準仕様研究会「電子カルテシステム標準仕様書 v1.0」1.03 診療記録の 6 テンプレート・7 テンプレート入力", url: "http://hci-bc.com/pdf/StandardSpec_v1body_c.pdf" }];

export type FormulaKey = "BMI" | "CCr" | "PF比" | "尿量" | "IN-OUT";

/** One place in a template: something the writer fills in, a value quoted from the chart, or a calculation. */
export type TemplateField =
  | { kind: "選択"; label: string; options: string[] }
  | { kind: "複数"; label: string; options: string[] }
  | { kind: "数値"; label: string; unit: string }
  | { kind: "時刻"; label: string }
  | { kind: "文"; label: string }
  | { kind: "検査"; code: string }
  | { kind: "計算"; formula: FormulaKey }
  | { kind: "バイタル" }
  | { kind: "アレルギー" }
  | { kind: "感染症" }
  | { kind: "日付" }
  | { kind: "入院日数" };

export type InputField = Extract<TemplateField, { kind: "選択" | "複数" | "数値" | "時刻" | "文" }>;
export const isInput = (f: TemplateField): f is InputField => f.kind === "選択" || f.kind === "複数" || f.kind === "数値" || f.kind === "時刻" || f.kind === "文";

/** The same field written twice in one template is one field (one answer). */
export function fieldKey(f: TemplateField): string {
  switch (f.kind) {
    case "選択":
    case "複数":
    case "数値":
    case "時刻":
    case "文":
      return `${f.kind}:${f.label}`;
    case "検査":
      return `検査:${f.code}`;
    case "計算":
      return `計算:${f.formula}`;
    default:
      return f.kind;
  }
}

/** The token that stands for a field in a template's text. */
export function tokenOf(f: TemplateField): string {
  switch (f.kind) {
    case "選択":
    case "複数":
      return `{{${f.kind}:${f.label}:${f.options.join("|")}}}`;
    case "数値":
      return `{{数値:${f.label}${f.unit ? `:${f.unit}` : ""}}}`;
    case "時刻":
      return `{{時刻:${f.label}}}`;
    case "文":
      return `{{文:${f.label}}}`;
    case "検査":
      return `{{検査:${f.code}}}`;
    case "計算":
      return `{{計算:${f.formula}}}`;
    default:
      return `{{${f.kind}}}`;
  }
}

export interface ParsedTemplate {
  /** The text with each token replaced by its field, in order. */
  parts: (string | TemplateField)[];
  /** Each field once, in the order it first appears. */
  fields: TemplateField[];
  errors: string[];
}

const NO_ARGS = ["バイタル", "アレルギー", "感染症", "日付", "入院日数"] as const;

function readToken(inner: string): TemplateField | string {
  const [kind, ...rest] = inner.split(/[:：]/).map((s) => s.trim());
  const label = rest[0] ?? "";
  switch (kind) {
    case "選択":
    case "複数": {
      const options = (rest.slice(1).join(":") || "").split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
      if (!label) return `{{${inner}}}：項目の名前がありません（例：{{${kind}:疼痛:なし|あり}}）`;
      if (options.length < 2) return `{{${inner}}}：選択肢を「|」で区切って2つ以上書いてください`;
      return { kind, label, options };
    }
    case "数値":
      if (!label) return `{{${inner}}}：項目の名前がありません（例：{{数値:尿量:mL}}）`;
      return { kind, label, unit: rest.slice(1).join(":") };
    case "時刻":
      if (!label) return `{{${inner}}}：項目の名前がありません（例：{{時刻:発見時刻}}）`;
      return { kind, label };
    case "文":
      if (!label) return `{{${inner}}}：項目の名前がありません（例：{{文:主訴}}）`;
      return { kind, label };
    case "検査": {
      const a = ANALYTES.find((x) => x.code === label || x.name === label);
      if (!a) return `{{${inner}}}：「${label}」は検査のマスターにありません`;
      return { kind, code: a.code };
    }
    case "計算":
      if (!(label in FORMULAS)) return `{{${inner}}}：計算は ${Object.keys(FORMULAS).join("・")} から選びます`;
      return { kind, formula: label as FormulaKey };
    default:
      if ((NO_ARGS as readonly string[]).includes(kind) && rest.length === 0) return { kind } as TemplateField;
      return `{{${inner}}}：読めない差し込みです`;
  }
}

/** Reads a template's text into its parts and fields. A token that cannot be read stays as text and is reported. */
export function parseTemplate(body: string): ParsedTemplate {
  const parts: ParsedTemplate["parts"] = [];
  const fields: TemplateField[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  let last = 0;
  for (const m of body.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    const f = readToken(m[1]);
    if (typeof f === "string") {
      errors.push(f);
      parts.push(m[0]);
    } else {
      parts.push(f);
      const k = fieldKey(f);
      if (!seen.has(k)) {
        seen.add(k);
        fields.push(f);
      }
    }
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return { parts, fields, errors };
}

/** What a template may quote from the chart. */
export interface TemplateFacts {
  patient: Pick<Patient, "age" | "sex" | "heightCm" | "weightKg" | "allergies" | "infections" | "labs" | "vitals" | "admittedOn">;
  today: CalendarDate;
}

/** Answers by field key: one choice or a typed value as text, several choices as a list. */
export type TemplateValues = Record<string, string | string[]>;

// ---------- 計算 ----------

interface Formula {
  name: string;
  unit: string;
  digits: number;
  /** The formula in words, shown with every result. */
  expr: string;
  source?: string;
  /** Each input: a number field of the same name in the template, or else the chart. */
  inputs: { label: string; unit: string; chart?: (f: TemplateFacts) => number | undefined }[];
  calc: (v: number[], f: TemplateFacts) => number;
  /** The numbers put into the formula, short. */
  shown: (v: number[], f: TemplateFacts) => string;
}

function latestLab(f: TemplateFacts, code: string): { value: number; day: number; time: string } | undefined {
  const r = [...f.patient.labs].sort((a, b) => b.day - a.day || minutesOf(b.time) - minutesOf(a.time)).find((x) => code in x.values);
  return r ? { value: r.values[code], day: r.day, time: r.time } : undefined;
}

export const FORMULAS: Record<FormulaKey, Formula> = {
  BMI: {
    name: "BMI",
    unit: "kg/m²",
    digits: 1,
    expr: "体重(kg) ÷ 身長(m)の2乗",
    inputs: [
      { label: "身長", unit: "cm", chart: (f) => f.patient.heightCm },
      { label: "体重", unit: "kg", chart: (f) => f.patient.weightKg },
    ],
    calc: ([h, w]) => w / (h / 100) ** 2,
    shown: ([h, w]) => `${w}kg÷${h / 100}m²`,
  },
  CCr: {
    name: "推定CCr",
    unit: "mL/分",
    digits: 0,
    expr: "(140 − 年齢) × 体重(kg) ÷ (72 × 血清Cre)、女性は × 0.85（Cockcroft-Gault 式、実体重）",
    source: "Cockcroft DW, Gault MH. Nephron 1976;16:31-41",
    inputs: [
      { label: "年齢", unit: "歳", chart: (f) => f.patient.age },
      { label: "体重", unit: "kg", chart: (f) => f.patient.weightKg },
      { label: "Cre", unit: "mg/dL", chart: (f) => latestLab(f, "Cre")?.value },
    ],
    calc: ([age, w, cre], f) => cockcroftGault(age, w, cre, f.patient.sex),
    shown: ([age, w, cre], f) => `CG式 (140−${age})×${w}÷(72×${cre})${f.patient.sex === "女" ? "×0.85" : ""}`,
  },
  PF比: {
    name: "P/F比",
    unit: "",
    digits: 0,
    expr: "PaO2(mmHg) ÷ (FiO2(%) ÷ 100)",
    inputs: [
      { label: "PaO2", unit: "mmHg" },
      { label: "FiO2", unit: "%" },
    ],
    calc: ([p, fi]) => p / (fi / 100),
    shown: ([p, fi]) => `${p}÷${fi / 100}`,
  },
  尿量: {
    name: "時間尿量",
    unit: "mL/kg/時",
    digits: 2,
    expr: "尿量(mL) ÷ 体重(kg) ÷ 時間",
    inputs: [
      { label: "尿量", unit: "mL" },
      { label: "時間", unit: "時間" },
      { label: "体重", unit: "kg", chart: (f) => f.patient.weightKg },
    ],
    calc: ([u, h, w]) => u / w / h,
    shown: ([u, h, w]) => `${u}mL÷${w}kg÷${h}時間`,
  },
  "IN-OUT": {
    name: "水分バランス（IN − OUT）",
    unit: "mL",
    digits: 0,
    expr: "IN(mL) − OUT(mL)",
    inputs: [
      { label: "IN", unit: "mL" },
      { label: "OUT", unit: "mL" },
    ],
    calc: ([i, o]) => i - o,
    shown: ([i, o]) => `${i}−${o}`,
  },
};

const num = (v: string | string[] | undefined): number | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v.normalize("NFKC").replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

export interface CalcResult {
  value: number | null;
  /** The inputs used, with where each came from. */
  used: { label: string; value: number; unit: string; from: "入力" | "カルテ" }[];
  missing: string[];
  /** "21.3kg/m²（58kg÷1.65m²）", or why it cannot be worked out. */
  text: string;
}

/** Works out a formula from the template's numbers, or the chart where the template has none. */
export function calcFormula(key: FormulaKey, values: TemplateValues, facts: TemplateFacts, fields: TemplateField[]): CalcResult {
  const f = FORMULAS[key];
  const used: CalcResult["used"] = [];
  const missing: string[] = [];
  for (const inp of f.inputs) {
    const inTemplate = fields.some((x) => x.kind === "数値" && x.label === inp.label);
    const typed = inTemplate ? num(values[`数値:${inp.label}`]) : undefined;
    const chart = typed === undefined ? inp.chart?.(facts) : undefined;
    const v = typed ?? chart;
    if (v === undefined || (inp.label !== "IN" && inp.label !== "OUT" && v <= 0)) missing.push(inp.label);
    else used.push({ label: inp.label, value: v, unit: inp.unit, from: typed !== undefined ? "入力" : "カルテ" });
  }
  if (missing.length) return { value: null, used, missing, text: `（${f.name}は計算できません：${missing.join("・")}がありません）` };
  const v = used.map((u) => u.value);
  const value = Number(f.calc(v, facts).toFixed(f.digits));
  return { value, used, missing, text: `${value}${f.unit}（${f.shown(v, facts)}）` };
}

// ---------- 差し込み（カルテから） ----------

export function labQuote(code: string, facts: TemplateFacts): string {
  const a = ANALYTES.find((x) => x.code === code);
  const name = a?.name ?? code;
  const r = latestLab(facts, code);
  if (!r) return `${name} 測定なし`;
  return `${name} ${r.value}${a?.unit ?? ""}（${formatShort(addDays(facts.today, r.day))} ${r.time}）`;
}

export function vitalsQuote(facts: TemplateFacts): string {
  const v = [...facts.patient.vitals].sort((a, b) => a.day - b.day || minutesOf(a.time) - minutesOf(b.time)).at(-1);
  return v ? vitalLine(v, facts.today) : "バイタルの記録なし";
}

/** What a field puts into the note. */
export function fieldText(f: TemplateField, values: TemplateValues, facts: TemplateFacts, fields: TemplateField[]): string {
  const v = values[fieldKey(f)];
  switch (f.kind) {
    case "選択":
      return typeof v === "string" && v ? v : "（未選択）";
    case "複数":
      return Array.isArray(v) && v.length ? f.options.filter((o) => v.includes(o)).join("、") : "（未選択）";
    case "数値": {
      const n = num(v);
      return n === undefined ? "（未入力）" : `${n}${f.unit}`;
    }
    case "時刻":
      return typeof v === "string" && v.trim() ? v.trim() : "（未入力）";
    case "文":
      return typeof v === "string" ? v.trim() : "";
    case "検査":
      return labQuote(f.code, facts);
    case "計算":
      return calcFormula(f.formula, values, facts, fields).text;
    case "バイタル":
      return vitalsQuote(facts);
    case "アレルギー":
      return facts.patient.allergies.join("、") || "なし";
    case "感染症":
      return facts.patient.infections.join("、") || "なし";
    case "日付":
      return formatShort(facts.today);
    case "入院日数":
      return `入院${hospitalDay(facts.patient.admittedOn, 0)}日目`;
  }
}

/** The note text: the template with every field filled in. */
export function fillTemplate(t: ParsedTemplate, values: TemplateValues, facts: TemplateFacts): string {
  return t.parts
    .map((p) => (typeof p === "string" ? p : fieldText(p, values, facts, t.fields)))
    .join("")
    .replace(/[ \t]+$/gm, "");
}

/** Numbers the chart already has (身長・体重), put in as a starting value the writer can change. */
export function startValues(t: ParsedTemplate, facts: TemplateFacts): TemplateValues {
  const out: TemplateValues = {};
  for (const f of t.fields) {
    if (f.kind !== "数値") continue;
    if (f.label === "身長" && facts.patient.heightCm) out[fieldKey(f)] = String(facts.patient.heightCm);
    if (f.label === "体重" && facts.patient.weightKg) out[fieldKey(f)] = String(facts.patient.weightKg);
  }
  return out;
}

/** The fields still empty (choices not chosen, numbers or times not entered). Free text may stay empty. */
export function unanswered(t: ParsedTemplate, values: TemplateValues): string[] {
  return t.fields.flatMap((f) => {
    if (f.kind !== "選択" && f.kind !== "複数" && f.kind !== "数値" && f.kind !== "時刻") return [];
    const v = values[fieldKey(f)];
    const empty = f.kind === "数値" ? num(v) === undefined : Array.isArray(v) ? v.length === 0 : typeof v !== "string" || !v.trim();
    return empty ? [f.label] : [];
  });
}

// ---------- ひな形 ----------

export interface NoteTemplate {
  id: string;
  name: string;
  /** Who it is offered to; a person's own template is offered to them only. */
  roles: Role[];
  body: string;
  /** The person who made it (own templates). */
  by?: string;
}

/** The fictional hospital's templates (架空の病院のひな形). */
export const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    id: "builtin-admission",
    name: "入院時記録",
    roles: ["医師"],
    body: [
      "S) 【入院時記録】{{日付}}",
      "主訴：{{文:主訴}}",
      "現病歴：{{文:現病歴}}",
      "既往歴：{{文:既往歴}}",
      "アレルギー：{{アレルギー}}",
      "生活歴：喫煙 {{選択:喫煙:なし|過去にあり|現在あり}}、飲酒 {{選択:飲酒:なし|機会飲酒|毎日}}",
      "入院前のADL：{{選択:入院前のADL:自立|一部介助|全介助}}",
      "O) {{バイタル}}",
      "身長 {{数値:身長:cm}}　体重 {{数値:体重:kg}}　BMI {{計算:BMI}}",
      "意識 {{選択:意識:清明|傾眠|昏迷|昏睡}}",
      "胸部 {{複数:胸部:異常なし|crackles|wheezes|心雑音}}",
      "腹部 {{複数:腹部:平坦・軟|圧痛あり|膨満|腸蠕動音低下}}",
      "下腿浮腫 {{選択:下腿浮腫:なし|右|左|両側}}",
      "{{検査:WBC}}、{{検査:CRP}}、{{検査:Cre}}、推定CCr {{計算:CCr}}",
      "A) {{文:評価}}",
      "P) {{文:計画}}",
    ].join("\n"),
  },
  {
    id: "builtin-rounds",
    name: "回診",
    roles: ["医師"],
    body: [
      "S) {{複数:自覚症状:特になし|疼痛|呼吸困難|咳嗽|食欲低下|不眠}}　{{文:訴え}}",
      "O) {{バイタル}}",
      "{{検査:WBC}}、{{検査:CRP}}、{{検査:Cre}}",
      "食事摂取 {{選択:食事摂取:全量|半分程度|少量|摂取なし|絶食中}}",
      "A) 経過 {{選択:経過:改善|変わりない|悪化}}　{{文:評価}}",
      "P) 方針 {{選択:方針:継続|変更あり}}　{{文:計画}}",
    ].join("\n"),
  },
  {
    id: "builtin-fall",
    name: "転倒・転落（フォーカス）",
    roles: ["看護師"],
    body: [
      "# 転倒・転落",
      "D) 発見：{{文:発見の時刻と場所}}　状況：{{選択:状況:ベッドからの転落|歩行中の転倒|トイレでの転倒|座り込み}}",
      "意識 {{選択:意識:清明|いつもと違う}}、外傷 {{複数:外傷:なし|擦過傷|打撲|出血|疼痛}}",
      "{{バイタル}}",
      "Act) {{複数:行ったこと:全身の観察|バイタル測定|医師へ報告|創の処置|家族へ連絡}}　{{文:ほかに行ったこと}}",
      "R) {{文:反応}}",
    ].join("\n"),
  },
  {
    id: "builtin-discharge-conf",
    name: "退院前カンファレンス",
    roles: ["医師", "看護師", "薬剤師", "管理栄養士", "MSW"],
    body: [
      "【退院前カンファレンス】{{日付}}（{{入院日数}}）",
      "参加者：{{複数:参加者:主治医|病棟看護師|薬剤師|管理栄養士|MSW|理学療法士|ケアマネジャー|訪問看護師|本人|家族}}",
      "退院の予定：{{文:退院の予定}}　退院先：{{選択:退院先:自宅|施設|転院}}",
      "ADL：移動 {{選択:移動:自立|杖|歩行器|車椅子|全介助}}、食事 {{選択:食事:自立|一部介助|全介助}}、排泄 {{選択:排泄:自立|一部介助|全介助}}",
      "服薬の管理：{{選択:服薬の管理:本人|家族|訪問看護|施設}}",
      "介護サービス：{{複数:介護サービス:訪問看護|訪問介護|通所リハビリ|福祉用具|なし}}",
      "本人・家族の希望：{{文:本人・家族の希望}}",
      "決まったこと：{{文:決まったこと}}",
    ].join("\n"),
  },
];

export const templatesFor = (role: Role, mine: NoteTemplate[]): { builtIn: NoteTemplate[]; mine: NoteTemplate[] } => ({
  builtIn: BUILTIN_TEMPLATES.filter((t) => t.roles.includes(role)),
  mine,
});

/** Why a template cannot be saved yet (empty when it can). */
export function templateProblems(name: string, body: string, others: NoteTemplate[], editingId?: string): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push("名前を付けてください。");
  else if (others.some((t) => t.id !== editingId && t.name === name.trim())) out.push("同じ名前の自分のテンプレートがあります。");
  if (!body.trim()) out.push("本文がありません。");
  out.push(...parseTemplate(body).errors);
  return out;
}

// ---------- 自分のテンプレート（この端末に保存） ----------

const storeKey = (user: string) => `simple-karte:note-templates:${user}`;

export function loadMyTemplates(user: string): NoteTemplate[] {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(storeKey(user));
    const o: unknown = v ? JSON.parse(v) : [];
    return Array.isArray(o) ? (o as NoteTemplate[]).filter((t) => t && typeof t.id === "string" && typeof t.name === "string" && typeof t.body === "string") : [];
  } catch {
    return [];
  }
}

export function saveMyTemplates(user: string, list: NoteTemplate[]): boolean {
  try {
    window.localStorage.setItem(storeKey(user), JSON.stringify(list));
    return true;
  } catch {
    // Storage blocked (private window): the templates last until the page is closed.
    return false;
  }
}
