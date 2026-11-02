// The electronic receipt file (RECEIPTC.UKE) for inpatient 医科 claims.
// Layout: 記録条件仕様（医科）令和8年度版 and the 電子レセプト作成の手引き. Dates are 西暦.
// One file goes to one 審査支払機関: 社会保険 (1) or 国民健康保険団体連合会 (2, also 後期高齢者).

import type { Diagnosis, Outcome } from "../diagnoses";
import { UNCODED } from "../diagnoses";
import { HOSPITAL } from "./facility";
import { futanKubun, type Insurance, receiptType, tokkiCode } from "./insurance";
import { shinryoItem } from "./master-items";
import type { ClaimResult } from "./model";
import { encodeSjis, sjisLength, unencodable } from "./sjis";

export interface ReceiptPatient {
  id: string;
  name: string;
  kana: string;
  sex: "男" | "女";
  /** 入院基本料の起算日としての入院年月日, YYYY-MM-DD. */
  admittedDate: string;
  insurance: Insurance;
  ageAtMonth: number;
  preschool: boolean;
}

export interface ReceiptDiagnosis extends Diagnosis {
  /** YYYY-MM-DD. */
  startDate: string;
}

export interface WindowAmounts {
  /** 医療の一部負担金 the window collected (after the 高額療養費 limit). */
  medicalYen: number;
  /** The window applied the 高額療養費 limit (現物給付). */
  kogaku: boolean;
  tasuu: boolean;
}

export interface Receipt {
  patient: ReceiptPatient;
  claim: ClaimResult;
  diagnoses: ReceiptDiagnosis[];
  window: WindowAmounts;
}

export type Payer = "1" | "2";

/** 社保 → 1, 国保・後期高齢者 → 2. */
export const payerOf = (ins: Insurance): Payer => (ins.kind === "国保" || ins.kind === "後期高齢者" ? "2" : "1");

const FIELDS = { IR: 10, RE: 38, HO: 15, SN: 9, JD: 33, MF: 33, SY: 8, SI: 44, IY: 44, TO: 48, CO: 5, GO: 4 } as const;

function record(kind: keyof typeof FIELDS, values: (string | number | undefined | null)[]): string {
  const n = FIELDS[kind];
  if (values.length > n) throw new Error(`${kind} の項目が多すぎます（${values.length}）`);
  const cells = [kind as string, ...values.slice(1).map((v) => (v === undefined || v === null ? "" : String(v)))];
  while (cells.length < n) cells.push("");
  return cells.join(",");
}

/** 数字モード（可変）: no leading zeros, no trailing decimal zeros. */
export function num(v: number, decimals = 0): string {
  const s = v.toFixed(decimals);
  return decimals ? s.replace(/\.?0+$/, "") : s;
}

const ymd = (iso: string) => iso.replaceAll("-", "");

/** 半角英数とスペースを全角に（氏名は全角だけにする）. */
export function toZenkaku(s: string): string {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　");
}

const katakana = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[\s　]/g, "");

const OUTCOME: Record<Outcome, string> = { 継続: "1", 治癒: "2", 死亡: "3", 中止: "4" };

const days31 = (days: Record<number, number>) => Array.from({ length: 31 }, (_, i) => (days[i + 1] ? String(days[i + 1]) : ""));

/** The records of one receipt (RE … the last 摘要), numbered `no`. */
export function receiptRecords(r: Receipt, no: number, month: string): string[] {
  const { patient: p, claim: c } = r;
  const ins = p.insurance;
  const out: string[] = [];
  const tokki = tokkiCode(ins, p.ageAtMonth);
  out.push(
    record("RE", [
      "RE",
      no,
      receiptType(ins, p.ageAtMonth, p.preschool),
      month.replace("-", ""),
      toZenkaku(p.name),
      p.sex === "男" ? 1 : 2,
      ymd(ins.birthDate),
      null, // 給付割合: 原則省略（手引き）
      ymd(p.admittedDate),
      null, // 病棟区分: 一般病棟は省略
      futanKubun(ins, p.ageAtMonth),
      tokki,
      null, // 病床数: 入院では省略
      p.id,
      ...Array(22).fill(null), // 15〜36
      katakana(p.kana),
      null,
    ]),
  );
  const symbol = ins.symbol ? toZenkaku(ins.symbol) : null;
  out.push(
    record("HO", [
      "HO",
      ins.insurerNumber.padStart(8, " "),
      symbol,
      symbol ? toZenkaku(ins.number) : ins.number,
      c.days,
      c.totalPoints,
      null,
      mealCount(c),
      c.meals.ryoyoYen,
      null,
      null,
      r.window.kogaku ? r.window.medicalYen : null,
      null,
      null,
      null,
    ]),
  );
  if (ins.kind !== "後期高齢者") out.push(record("SN", ["SN", 1, "01", null, null, null, ins.branch ?? null, null, null]));
  const inDays: Record<number, number> = {};
  if (c.from && c.to) for (let d = c.from; d <= c.to; d++) inDays[d] = 1;
  out.push(record("JD", ["JD", 1, ...days31(inDays)]));
  out.push(record("MF", ["MF", r.window.kogaku ? (r.window.tasuu ? "02" : "01") : "00"]));

  for (const d of [...r.diagnoses].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const uncoded = d.code === UNCODED;
    out.push(
      record("SY", [
        "SY",
        d.code,
        ymd(d.startDate),
        OUTCOME[d.outcome],
        uncoded ? null : [...d.prefixes, ...d.suffixes].map((m) => m.code).join("") || null,
        uncoded ? d.name : null,
        d.main ? "01" : null,
        null,
      ]),
    );
  }

  for (const act of c.acts) {
    let first = true;
    for (const part of act.parts) {
      part.lines.forEach((l, i) => {
        const last = i === part.lines.length - 1;
        const sk = first ? act.shikibetsu : null;
        first = false;
        const points = last ? num(part.points) : null;
        const cm = (l.comments ?? []).slice(0, 3);
        const commentCells = [0, 1, 2].flatMap((k) => [cm[k]?.code ?? null, cm[k]?.text ?? null]);
        if (l.record === "IY") {
          out.push(record("IY", ["IY", sk, 1, l.code, num(l.quantity ?? 0, 5), points, act.count, ...commentCells, ...days31(act.days)]));
        } else if (l.record === "TO") {
          // 使用量 整数部5桁・小数部3桁. 単位コード only when the master has none. 単価 for 購入価格 and always for 酸素.
          out.push(
            record("TO", [
              "TO",
              sk,
              1,
              l.code,
              l.quantity !== undefined ? num(l.quantity, 3) : null,
              points,
              act.count,
              l.unitCode ?? null,
              l.unitPrice !== undefined ? num(l.unitPrice, 2) : null,
              null,
              l.product ? toZenkaku(l.product) : null,
              ...commentCells,
              ...days31(act.days),
            ]),
          );
        } else {
          const quantity = l.quantity !== undefined && shinryoQuantity(l.code) ? num(l.quantity) : null;
          out.push(record("SI", ["SI", sk, 1, l.code, quantity, points, act.count, ...commentCells, ...days31(act.days)]));
        }
      });
    }
  }
  return out;
}

/** SI 数量データ is recorded for 食事療養 (食数) and codes whose master asks for a quantity. */
function shinryoQuantity(code: string): boolean {
  return code.startsWith("197");
}

/** HO 食事療養 回数: the number of meals (食数) of 食事療養費. */
function mealCount(c: ClaimResult): number {
  let n = 0;
  for (const a of c.acts) {
    if (a.shikibetsu !== "97") continue;
    const part = a.parts.find((p) => shinryoItem(p.lines[0].code)?.sumInpatient === "970" && p.lines[0].code !== "197000470");
    n += (part?.lines[0].quantity ?? 0) * a.count;
  }
  return n;
}

export interface UkeFile {
  payer: Payer;
  text: string;
  bytes: Uint8Array;
  count: number;
  totalPoints: number;
  problems: string[];
}

/** One RECEIPTC.UKE for one 審査支払機関, claim month `month` ("YYYY-MM"), submitted in `submitMonth`. */
export function buildUke(receipts: Receipt[], payer: Payer, month: string, submitMonth: string): UkeFile {
  const mine = receipts.filter((r) => payerOf(r.patient.insurance) === payer);
  const lines: string[] = [record("IR", ["IR", payer, HOSPITAL.prefecture, 1, HOSPITAL.code, null, HOSPITAL.name, submitMonth.replace("-", ""), "00", HOSPITAL.tel])];
  mine.forEach((r, i) => lines.push(...receiptRecords(r, i + 1, month)));
  const totalPoints = mine.reduce((s, r) => s + r.claim.totalPoints, 0);
  lines.push(record("GO", ["GO", mine.length, totalPoints, "99"]));
  const text = lines.map((l) => `${l}\r\n`).join("");
  const problems = checkUke(lines, mine);
  const body = encodeSjis(text);
  const bytes = new Uint8Array(body.length + 1);
  bytes.set(body);
  bytes[body.length] = 0x1a;
  return { payer, text, bytes, count: mine.length, totalPoints, problems };
}

/** Checks of the 記録条件仕様 that the file itself can show (7章). */
export function checkUke(lines: string[], receipts: Receipt[]): string[] {
  const problems: string[] = [];
  for (const [i, line] of lines.entries()) {
    const kind = line.slice(0, 2) as keyof typeof FIELDS;
    const cells = line.split(",");
    if (FIELDS[kind] && cells.length !== FIELDS[kind]) problems.push(`${i + 1}行目 ${kind}：項目数が ${cells.length}（${FIELDS[kind]} のはず）`);
    const bad = unencodable(line);
    if (bad.length) problems.push(`${i + 1}行目：シフトJISにない文字 ${bad.join(" ")}`);
    if (kind === "SI" || kind === "IY" || kind === "TO") {
      const count = Number(cells[6]);
      const sum = cells.slice(kind === "TO" ? 17 : 13).reduce((s, v) => s + (v ? Number(v) : 0), 0);
      if (count !== sum) problems.push(`${i + 1}行目 ${kind}：回数 ${count} と算定日の合計 ${sum} が合いません`);
    }
    if (kind === "RE" && sjisLength(cells[4]) > 40) problems.push(`${i + 1}行目 RE：氏名が40バイトを超えます`);
  }
  for (const r of receipts) {
    const who = r.patient.name;
    if (!r.diagnoses.length) problems.push(`${who}：傷病名が1つもありません（SY は必須）`);
    if (!r.diagnoses.some((d) => d.main)) problems.push(`${who}：主傷病がありません`);
    const uncoded = r.diagnoses.filter((d) => d.code === UNCODED);
    if (uncoded.length) problems.push(`${who}：未コード化傷病名が ${uncoded.length} 件あります（${uncoded.map((d) => d.name).join("、")}）。傷病名マスターの名前に直してください`);
    if (!r.claim.acts.length) problems.push(`${who}：摘要（SI・IY・TO）がありません`);
  }
  return problems;
}
