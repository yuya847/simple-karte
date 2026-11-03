// DPC（診断群分類別包括評価）: from the recorded diagnosis, age and 手術・処置, the code proposes a DPC code
// with the reason for each digit, the 入院期間 of each day and the 包括 points (点数 × 医療機関別係数).
//
// The 主治医 decides the code, at discharge (保医発0318第４号 第2の1(1)(7)); this only proposes from the
// record so the doctor and 医事課 can check it. No AI. The rules quoted below are from that 通知 and
// from 令和８年厚生労働省告示第96号 (see dpc-table.ts for the sources).

import { DPC_CLASSES, type DpcClass, type DpcItem, type DpcRow } from "./dpc-table";

/**
 * 医療機関別係数 of the FICTIONAL hospital. A real hospital's value is the sum of its 基礎係数・機能評価係数Ⅰ・
 * 機能評価係数Ⅱ・救急補正係数・激変緩和係数 (通知 第3の1(2)); this one is made up and not any real hospital's.
 */
export const FICTIONAL_COEFFICIENT = 1.3;

/** A 診療行為 found in the record: its 区分 in the 医科点数表 ("J045", "J038-2", "K920") and 項 number when known. */
export interface DpcAct {
  kubun: string;
  item?: number;
  name: string;
  /** Where it was found, in words ("算定（11/2）", "輸血のオーダ"). */
  source: string;
  /** false: the record suggests it but does not show it was done → only shown as an alternative. */
  certain: boolean;
}

export interface DpcInput {
  /** ICD-10 of 医療資源を最も投入した傷病名 (no dot, e.g. "L031"). */
  icd10: string;
  diagnosis: string;
  /** 入院時の年齢 (通知 第2の3(3)). */
  age: number;
  acts: DpcAct[];
  /** The other registered diagnoses, 疑い excluded (通知 第2の2(2)②), for 定義副傷病. */
  others: { icd10: string; name: string }[];
  /** 他の病院・診療所の病棟からの転院; null = not in the record. */
  transfer: boolean | null;
}

export interface DpcStep {
  /** Positions in the 14 digits (1-based), e.g. "9〜10". */
  at: string;
  axis: string;
  /** The digits of the chosen code at those positions. */
  digits: string;
  reason: string;
}

export interface DpcIssue {
  level: "review" | "info";
  text: string;
}

export interface DpcDerivation {
  cls: DpcClass;
  row: DpcRow;
  code: string;
  /** false: 包括の対象外 — the row has no points, so the stay is billed by the 医科点数表. */
  hokatsu: boolean;
  steps: DpcStep[];
  issues: DpcIssue[];
  /** Codes that would follow if a record that is not certain were counted. */
  alternatives: { code: string; because: string }[];
}

export type DpcOutcome = { ok: true; d: DpcDerivation } | { ok: false; reason: string; issues: DpcIssue[] };

const norm = (icd: string) => icd.replace(/[.\s]/g, "").toUpperCase();

/** "J69$" matches J69 and every subcode; anything else matches exactly. */
export function icdMatches(pattern: string, icd: string): boolean {
  const c = norm(icd);
  return pattern.endsWith("$") ? c.startsWith(pattern.slice(0, -1)) : c === pattern;
}

export function findClass(icd: string): { cls: DpcClass; pattern: readonly [string, string] } | undefined {
  for (const cls of Object.values(DPC_CLASSES)) {
    const p = cls.icd.find(([pat]) => icdMatches(pat, icd));
    if (p) return { cls, pattern: p };
  }
  return undefined;
}

// 通知 第2の1(2): ICD-10 that are not chosen as 医療資源を最も投入した傷病名.
const R_ALLOWED = ["R040", "R042", "R048", "R049", "R560", "R610", "R611", "R619", "R730"];
export function notForDpc(icd: string): string | null {
  const c = norm(icd);
  const three = c.slice(0, 3);
  if (three === "B89" || (three >= "B95" && three <= "B99"))
    return `${c} は医療資源を最も投入した傷病名に選ばない ICD-10 です（B89、B95〜B99。留意事項 第2の1(2)）。`;
  if (three >= "R00" && three <= "R99" && !R_ALLOWED.includes(c))
    return `${c} は症状・徴候（R00〜R99）のため、医療資源を最も投入した傷病名に選びません（鼻出血・喀血・熱性けいれんなどを除く。留意事項 第2の1(2)）。`;
  if (three === "C97" || three === "T14") return `${c} は選ばず、主たる部位の ICD-10 を選びます（留意事項 第2の1(2)）。`;
  return null;
}

/** Remarks of the coding text (令和８年度版) for the diagnoses of the demo patients. */
const CODING_NOTES: { pattern: string; text: string }[] = [
  {
    pattern: "I509",
    text: "コーディングテキスト：心不全は、原疾患が分かればその病名を選び、I50$ を使うときも I500（うっ血性心不全）と I501（左室不全）を区別する、とされています（I509 は詳細不明）。",
  },
  { pattern: "L039", text: "コーディングテキスト：蜂窩織炎は分かっている部位を含めた病名にし、単に蜂巣炎（L039）とするのは適切でない、とされています。" },
  {
    pattern: "A41$",
    text: "コーディングテキスト：入院後に発症した黄色ブドウ球菌による敗血症は、入院の目的だった病名より明らかに医療資源を多く使ったときに A410 を選ぶ、とされています。検査（SOFA スコアなど）と治療の内容を確かめます。",
  },
];

/** "J0453ｲ" → J045 項3; "K783-2" → K783-2; "0003" (a drug's ダミーコード) → null. */
export function parseItemCode(code: string): { kubun: string; item?: number } | null {
  const m = /^([A-Z]\d{3})(?:-(\d))?(\d)?[ｦ-ﾟ]?$/.exec(code);
  if (!m) return null;
  return { kubun: m[2] ? `${m[1]}-${m[2]}` : m[1], item: m[3] ? Number(m[3]) : undefined };
}

/** yes / no, or maybe when the definition names a 項 the record does not show. */
function matchItem(def: DpcItem, act: DpcAct): "yes" | "maybe" | "no" {
  const p = parseItemCode(def[0]);
  if (!p || p.kubun !== act.kubun) return "no";
  if (p.item === undefined) return "yes";
  if (act.item === undefined) return "maybe";
  return p.item === act.item ? "yes" : "no";
}

// Branch values are 0–9 then A–G (コーディングテキスト Ⅱ). A higher value stands lower in the tree.
const rank = (v: string) => parseInt(v, 36);

function axis(defs: readonly DpcItem[], acts: DpcAct[], loose?: DpcAct) {
  let value = "0";
  const hits: { def: DpcItem; act: DpcAct }[] = [];
  for (const act of acts)
    for (const def of defs) {
      const m = matchItem(def, act);
      if (m === "yes" || (m === "maybe" && act === loose)) {
        hits.push({ def, act });
        if (rank(def[2]) > rank(value)) value = def[2];
      }
    }
  return { value, hits };
}

const isOperation = (a: DpcAct) => a.kubun.startsWith("K") && !a.name.includes("管理料");

const examples = (defs: readonly DpcItem[]) => {
  const names = [...new Set(defs.filter((d) => d[2] !== "0").map((d) => d[1].split("　")[0]))];
  return names.slice(0, 4).join("・") + (names.length > 4 ? " など" : "");
};

interface Picked {
  code: string;
  conv: DpcClass["conv"][number];
  values: { age: string; surgery: string; s1: string; s2: string; fuku: string; transfer: string };
  ops: { act: DpcAct; branch: string }[];
  s1: ReturnType<typeof axis>;
  s2: ReturnType<typeof axis>;
  fukuHits: { icd10: string; name: string }[];
}

/** `loose`: the one act whose unknown 項 may count (for the alternatives). */
function pick(cls: DpcClass, input: DpcInput, acts: DpcAct[], loose?: DpcAct): Picked | null {
  const age = cls.age ? (input.age < cls.age.below ? cls.age.under : cls.age.over) : "";
  const ops = acts.filter(isOperation).map((act) => {
    const hit = cls.surgery.find((def) => {
      const m = matchItem(def, act);
      return m === "yes" || (m === "maybe" && act === loose);
    });
    return { act, branch: hit ? hit[2] : "97" };
  });
  // 通知 第2の1(5): with several operations, the one lower in the tree.
  const surgery = ops.length ? ops.map((o) => o.branch).sort((a, b) => cls.surgeryTree.indexOf(b) - cls.surgeryTree.indexOf(a))[0] : "99";
  const s1 = axis(cls.shochi1, acts, loose);
  const s2 = axis(cls.shochi2, acts, loose);
  // 通知 第2の2(2)①: フラグ 1 共通、2 手術なしのとき、3 手術ありのとき.
  const fukuDefs = cls.fukushobyo.filter(([, , , flag]) => flag === "1" || (flag === "2" && surgery === "99") || (flag === "3" && surgery !== "99"));
  const fukuHits = input.others.filter((o) => fukuDefs.some(([pat]) => icdMatches(pat, o.icd10)));
  const fuku = fukuHits.length ? fukuDefs.find(([pat]) => fukuHits.some((o) => icdMatches(pat, o.icd10)))![2] : "0";
  const transfer = cls.transfer ? (input.transfer ? cls.transfer.yes : cls.transfer.no) : "";
  const values = { age, surgery, s1: s1.value, s2: s2.value, fuku, transfer };
  const want = [age, surgery, s1.value, s2.value, fuku, transfer];
  const conv = cls.conv.find((r) => want.every((v, i) => r[i + 2] === "" || r[i + 2] === "a" || r[i + 2] === v));
  if (!conv) return null;
  return { code: conv[0], conv, values, ops, s1, s2, fukuHits };
}

const hitText = (hits: { def: DpcItem; act: DpcAct }[]) => [...new Set(hits.map((h) => `${h.def[1]}（${h.def[0]}、対応コード ${h.def[2]}。${h.act.source}）`))].join("、");

function steps(cls: DpcClass, pattern: readonly [string, string], input: DpcInput, p: Picked): DpcStep[] {
  const c = p.code;
  const notSplit = "この分類では分けない（x）";
  const out: DpcStep[] = [
    {
      at: "1〜6",
      axis: "傷病名（MDC・分類）",
      digits: c.slice(0, 6),
      reason: `${input.diagnosis}（${norm(input.icd10)}）は ${pattern[0]}「${pattern[1]}」に当たる → MDC ${c.slice(0, 2)} ${cls.mdcName}・${cls.code} ${cls.name}`,
    },
    { at: "7", axis: "病態等分類", digits: c[6], reason: notSplit },
    {
      at: "8",
      axis: "年齢・出生時体重等",
      digits: c[7],
      reason: cls.age ? `入院時の年齢 ${input.age}歳 → ${cls.age.label}${input.age < cls.age.below ? "未満" : "以上"}（${p.values.age}）` : notSplit,
    },
  ];
  const ops = p.ops.map((o) => `${o.act.name}（${o.act.source}）`).join("、");
  const surgeryWord = p.values.surgery === "99" ? "記録に手術（医科点数表 第10部）がない → 手術なし" : `手術あり：${ops}`;
  out.push({
    at: "9〜10",
    axis: "手術",
    digits: c.slice(8, 10),
    reason: c.slice(8, 10) === "xx" ? `${notSplit}。${surgeryWord}` : `${surgeryWord}（${p.values.surgery}）${p.ops.length > 1 ? "。複数あるときはツリー図で下にあるもの（留意事項 第2の1(5)）" : ""}`,
  });
  for (const [at, name, defs, ax] of [
    ["11", "手術・処置等１", cls.shochi1, p.s1],
    ["12", "手術・処置等２", cls.shochi2, p.s2],
  ] as const) {
    const idx = Number(at) - 1;
    const drugs = defs.filter((d) => parseItemCode(d[0]) === null).map((d) => d[1]);
    const none = defs.length ? `定義の診療行為（${examples(defs)}）に当たる記録がない → なし（0）` : "定義の診療行為がない → なし（0）";
    const said = ax.hits.length ? `${hitText(ax.hits)} → ${ax.value}${ax.hits.length > 1 ? "（複数あるときはツリー図で下にあるもの）" : ""}` : none;
    out.push({
      at,
      axis: name,
      digits: c[idx],
      reason: c[idx] === "x" && !defs.length ? notSplit : (c[idx] === "x" ? `${notSplit}。` : "") + said + (drugs.length ? `。薬剤（${drugs.join("・")}）は記録から判定していません` : ""),
    });
  }
  out.push({
    at: "13",
    axis: "定義副傷病",
    digits: c[12],
    reason:
      c[12] === "x"
        ? notSplit
        : p.fukuHits.length
          ? `${p.fukuHits.map((o) => `${o.name}（${o.icd10}）`).join("、")} が定義副傷病に当たる → あり`
          : "ほかの病名（疑いを除く）に定義副傷病がない → なし（0）",
  });
  out.push({
    at: "14",
    axis: "重症度等",
    digits: c[13],
    reason: cls.transfer
      ? input.transfer === null
        ? "入院経路が記録にない → 他の病院・診療所の病棟からの転院以外として計算（0）"
        : input.transfer
          ? "他の病院・診療所の病棟からの転院（1）"
          : "他の病院・診療所の病棟からの転院以外（0）"
      : notSplit,
  });
  return out;
}

/** The proposal for one 医療資源病名: the code, why each digit, and the codes that uncertain records would give. */
export function deriveDpc(input: DpcInput): DpcOutcome {
  const issues: DpcIssue[] = [];
  const bad = notForDpc(input.icd10);
  if (bad) issues.push({ level: "review", text: bad });
  for (const n of CODING_NOTES) if (icdMatches(n.pattern, input.icd10)) issues.push({ level: "info", text: n.text });
  const found = findClass(input.icd10);
  if (!found)
    return {
      ok: false,
      reason: `${input.diagnosis}（${norm(input.icd10)}）の分類は、この試作の DPC の表（デモの患者の病名の分類だけ）に載せていないため、コードを出しません。`,
      issues,
    };
  const { cls, pattern } = found;
  const certain = input.acts.filter((a) => a.certain);
  const main = pick(cls, input, certain);
  if (!main) return { ok: false, reason: `記録の手術・処置の組み合わせに当たる分岐が ${cls.code} ${cls.name} のツリー図にありません。医師と医事課が確かめてください。`, issues };
  const row = cls.rows.find((r) => r.code === main.code)!;
  const alternatives: DpcDerivation["alternatives"] = [];
  for (const a of input.acts) {
    const alt = pick(cls, input, a.certain ? certain : [...certain, a], a);
    if (alt && alt.code !== main.code && !alternatives.some((x) => x.code === alt.code))
      alternatives.push({ code: alt.code, because: `${a.name}（${a.source}）が定義に当たるなら` });
  }
  if (cls.transfer && input.transfer === null) {
    const alt = pick(cls, { ...input, transfer: true }, certain);
    if (alt && alt.code !== main.code) alternatives.push({ code: alt.code, because: "他の病院・診療所の病棟からの転院なら" });
  }
  const hokatsu = main.conv[1] === "1" && row.points !== null;
  if (!hokatsu) issues.push({ level: "review", text: `${main.code} は包括の対象外です（点数の設定がない）。医科点数表（出来高）で算定し、レセプトの摘要に DPC コードを書きます（留意事項 第2の1(1)③）。` });
  return { ok: true, d: { cls, row, code: main.code, hokatsu, steps: steps(cls, pattern, input, main), issues, alternatives } };
}

// ---------- 入院期間と包括の点数 ----------

export type DpcPeriod = "Ⅰ" | "Ⅱ" | "Ⅲ" | "超え";

/**
 * 通知 第2の2(1): 入院期間Ⅰ = 入院日Ⅰ以下、Ⅱ = 入院日Ⅰを超え入院日Ⅱ以下、Ⅲ = 入院日Ⅱを超え入院日Ⅲ以下.
 * Beyond 入院日Ⅲ the day is billed by the 医科点数表 (通知 第3の1(5)). The 入院日 counts the admission day as day 1.
 */
export function periodOf(row: DpcRow, hospitalDay: number): { period: DpcPeriod; points: number | null } {
  if (!row.days || !row.points) return { period: "超え", points: null };
  const [d1, d2, d3] = row.days;
  if (hospitalDay <= d1) return { period: "Ⅰ", points: row.points[0] };
  if (hospitalDay <= d2) return { period: "Ⅱ", points: row.points[1] };
  if (hospitalDay <= d3) return { period: "Ⅲ", points: row.points[2] };
  return { period: "超え", points: null };
}

/** The 1-based range of 入院日 of each 入院期間. */
export function periodRanges(row: DpcRow): { period: DpcPeriod; from: number; to: number | null; points: number | null }[] {
  if (!row.days || !row.points) return [];
  const [d1, d2, d3] = row.days;
  return [
    { period: "Ⅰ", from: 1, to: d1, points: row.points[0] },
    { period: "Ⅱ", from: d1 + 1, to: d2, points: row.points[1] },
    { period: "Ⅲ", from: d2 + 1, to: d3, points: row.points[2] },
    { period: "超え", from: d3 + 1, to: null, points: null },
  ];
}

export interface DpcPackageLine {
  period: DpcPeriod;
  /** 入院日 (1-based) of the first and last day in this month. */
  from: number;
  to: number;
  days: number;
  points: number | null;
  /** 点数 × 医療機関別係数, unrounded (null beyond 入院日Ⅲ). */
  perDay: number | null;
  subtotal: number;
}

/** The coefficient as an integer of 1/10000 (the 告示 gives 4 decimals). */
const coef4 = (c: number) => Math.round(c * 10000);

/**
 * The month's 包括 points: each day's 点数 × 医療機関別係数, summed over the month, and the sum rounded
 * half up at the first decimal (通知 第3の1(1)). Integer arithmetic in 1/10000 so the rounding is exact.
 */
export function packagePoints(row: DpcRow, coefficient: number, hospitalDays: number[]): { lines: DpcPackageLine[]; total: number; raw: number; beyond: number[] } {
  const k = coef4(coefficient);
  const lines: DpcPackageLine[] = [];
  let raw4 = 0;
  const beyond: number[] = [];
  for (const hd of [...hospitalDays].sort((a, b) => a - b)) {
    const { period, points } = periodOf(row, hd);
    if (points === null) beyond.push(hd);
    const last = lines.at(-1);
    if (last && last.period === period && last.to === hd - 1) {
      last.to = hd;
      last.days++;
    } else lines.push({ period, from: hd, to: hd, days: 1, points, perDay: points === null ? null : (points * k) / 10000, subtotal: 0 });
    if (points !== null) raw4 += points * k;
  }
  for (const l of lines) l.subtotal = l.points === null ? 0 : (l.points * k * l.days) / 10000;
  return { lines, total: Math.floor((raw4 + 5000) / 10000), raw: raw4 / 10000, beyond };
}

/** The 14 digits split as in the coding text (疾患・病態・年齢・手術・処置1・処置2・副傷病・重症度). */
export function codeParts(code: string): { digits: string; label: string }[] {
  return [
    { digits: code.slice(0, 6), label: "傷病名" },
    { digits: code[6], label: "病態等分類" },
    { digits: code[7], label: "年齢等" },
    { digits: code.slice(8, 10), label: "手術" },
    { digits: code[10], label: "処置等１" },
    { digits: code[11], label: "処置等２" },
    { digits: code[12], label: "副傷病" },
    { digits: code[13], label: "重症度等" },
  ];
}
