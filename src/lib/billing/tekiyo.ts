// 2026-11-07確認: 別表Ⅰ（令和8年度）A205 項番18・19、B008 項番142・143、E200/E202。
// 版・URLは kisai-sources.ts。コメント名称は公開 c_20261001.csv を入力し、そのまま用いる。
import type { ClaimAct, ClaimLine, ClaimResult } from "./model";
import type { HistoryEntry } from "../types";
import { chartDate } from "./kisai";
import { sjisLength, unencodable } from "./sjis";
import type { KisaiBasis } from "./kisai-sources";

export interface TekiyoMaster { code: string; name: string; pattern: string; from: string; until: string }
export type TekiyoComment = NonNullable<ClaimLine["comments"]>[number];
export interface TekiyoAnswer {
  patientId: string;
  month: string;
  /** 診療行為コード単位。別患者・別月への転用はしない。 */
  claimCode: string;
  comments: { code: string; text?: string }[];
  /** 医師が条件付き記載事項（指標・転院・医学的根拠等）も確認した記録。 */
  reviewedRequirements: boolean;
  by: string;
  at: string;
}
export interface TekiyoTask {
  claimCode: string;
  status: "自動" | "選択済み" | "人が選ぶ";
  reason: string;
  basis: KisaiBasis;
  candidates: TekiyoMaster[];
  comments: TekiyoComment[];
  evidence: unknown[];
}
export interface TekiyoInput {
  patientId: string;
  today: string;
  entries: HistoryEntry[];
  master: TekiyoMaster[];
  answers?: TekiyoAnswer[];
}
const emergencyKind = (code: string) => code === "190171910" ? "１" : code === "190172010" ? "２" : undefined;
const normalize = (s: string) => s.normalize("NFKC");
const active = (m: TekiyoMaster, month: string) => m.from <= `${month.replace("-", "")}01` && m.until >= `${month.replace("-", "")}01`;

/** CSVの全行形式。終了日（22列目）とコード（23列目）を混同しない。 */
export function tekiyoMasterRows(rows: string[][]): TekiyoMaster[] {
  return rows.filter(r => /^8\d{8}$/.test(r[22] ?? "")).map(r => ({ code: r[22], name: r[6], pattern: r[3], from: r[20], until: r[21] }));
}
export function commentProblem(m: TekiyoMaster, text?: string): string | undefined {
  if (m.pattern === "20" && text) return "選択式のコメントに文字データは不要";
  if (m.pattern !== "20" && !text?.trim()) return "文字データが必要";
  if (text && (/[\r\n,"]/.test(text) || unencodable(text).length || sjisLength(text) > 76)) return "文字データは区切り・改行のないシフトJIS76バイト以内";
  if (m.pattern === "31" && !/^\d{9}$/.test(normalize(text ?? ""))) return "医科診療行為コード9桁が必要";
  if (m.pattern === "42" && !/^\d+(\.\d+)?$/.test(normalize(text ?? ""))) return "数値が必要";
  if (m.pattern === "50" && !/^\d{7}$/.test(normalize(text ?? ""))) return "元号コード付き年月日7桁が必要";
  return undefined;
}

/** 認定できない状態や主要な行為を記事の単語から推測しない。 */
export function resolveTekiyo(claim: ClaimResult, input: TekiyoInput): TekiyoTask[] {
  const master = input.master.filter(m => active(m, claim.month));
  const lines = claim.acts.flatMap(a => a.parts.flatMap(p => p.lines));
  const codes = [...new Set(lines.map(l => l.code))];
  const tasks: TekiyoTask[] = [];
  for (const code of codes) {
    const kind = emergencyKind(code);
    const pharmacy = code === "113010810";
    const xray = ["170000410", "170000510", "170021550"].includes(code);
    const imaging = xray || lines.some(l => l.code === code && /ＣＴ撮影|ＭＲＩ撮影|CT撮影|MRI撮影/.test(l.name));
    if (!kind && !pharmacy && !imaging) continue;
    const name = lines.find(l => l.code === code)!.name;
    const modality = xray ? "X線" : /ＭＲＩ|MRI/.test(name) ? "MRI" : "CT";
    const regionName = xray ? "単純撮影" : `${modality}撮影`;
    const candidates = master.filter(m => kind ? m.name.includes(`救急医療管理加算${kind}`) : pharmacy ? m.code === "830100078" : normalize(m.name).includes(`撮影部位(${regionName})`));
    const answer = input.answers?.filter(a => a.patientId === input.patientId && a.month === claim.month && a.claimCode === code).at(-1);
    const comments: TekiyoComment[] = [];
    let valid = !!answer?.by.trim() && !!answer?.at && !!answer?.reviewedRequirements && !!answer?.comments.length;
    for (const c of answer?.comments ?? []) {
      const m = candidates.find(m => m.code === c.code);
      if (!m || commentProblem(m, c.text)) { valid = false; continue; }
      comments.push({ code: m.code, text: c.text, label: m.name });
    }
    if (kind) {
      const actionCode = kind === "１" ? "831110001" : "831110002";
      valid = valid && comments.some(c => c.code.startsWith("820")) && comments.some(c => c.code === actionCode);
    }
    const evidence: unknown[] = answer ? [answer] : [];
    let status: TekiyoTask["status"] = valid ? "選択済み" : "人が選ぶ";
    if (!valid) comments.length = 0;
    // 実施済み画像オーダの同一部位が、その算定行の全算定日と一致するときのみ自動化。
    // 複数部位・予定・未実施・日不明は人が選ぶ。左右等から医学的状態を推測しない。
    if (imaging && !valid) {
      const acts = claim.acts.filter(a => a.parts.some(p => p.lines.some(l => l.code === code)));
      const days = [...new Set(acts.flatMap(a => Object.keys(a.days).map(Number)))];
      const exams = input.entries.filter(e => e.kind === "order" && e.order.type === "imaging" && (e.order.modality === modality || (xray && e.order.modality === "ポータブルX線")) && !e.exam?.notDone && e.exam?.done && chartDate(input.today, e.exam.done.day).startsWith(claim.month) && days.includes(Number(chartDate(input.today, e.exam.done.day).slice(-2))));
      const regions = [...new Set(exams.flatMap(e => e.kind === "order" && e.order.type === "imaging" ? [e.order.region] : []))];
      // REGIONSのコード→別表Ⅰの区分。複合部位を一つに丸めない。
      const map: Record<string, string> = modality === "CT" ? { "R-HEAD": "820182000", "R-CHEST": "820182210", "R-ABD": "820182300" } : xray ? { "R-HEAD": "820181000", "R-CHEST": "820181220", "R-ABD": "820181300" } : {};
      const m = regions.length === 1 ? candidates.find(m => m.code === map[regions[0]]) : undefined;
      if (m && days.every(d => exams.some(e => e.kind === "order" && e.exam?.done && Number(chartDate(input.today, e.exam.done.day).slice(-2)) === d))) {
        comments.push({ code: m.code, label: m.name });
        evidence.push(...exams);
        status = "自動";
      }
    }
    tasks.push({ claimCode: code, status, reason: kind ? "入院時の状態と指標、3日以内の主要な診療行為、該当時の医学的根拠・転院前病名等を医師が確認" : pharmacy ? "実際に薬学的管理指導を行った薬剤名を選ぶ（投薬一覧だけでは特定しない）。算定日は既存の日別情報を使用" : "撮影部位を記録から照合。複数部位や記録不足は人が選ぶ", basis: { source: "table", section: kind ? `項番${kind === "１" ? 18 : 19} A205` : pharmacy ? "項番142 B008 1" : xray ? "別表Ⅰ 項番377 E001" : "E200・E202 撮影部位", text: kind ? "状態・指標・主要な診療行為等を記載" : pharmacy ? "算定日及び薬剤名を記載" : "撮影部位を選択して記載" }, candidates, comments, evidence });
  }
  return tasks;
}

/** 点数・回数・日別算定を保持して摘要だけを足す。入力を変更しない。
 * 3件を超える分はClaimAct.commentsに保持し、ukeでCOにする。切り捨てない。
 */
export function applyTekiyo(claim: ClaimResult, tasks: TekiyoTask[]): ClaimResult {
  const acts = claim.acts.map(a => {
    const overflow = [...(a.comments ?? [])];
    const parts = a.parts.map(p => ({ ...p, lines: p.lines.map(l => {
      const task = tasks.find(t => t.claimCode === l.code && t.status !== "人が選ぶ");
      if (!task) return l;
      const cm = [...(l.comments ?? [])];
      for (const c of task.comments) if (![...cm, ...overflow].some(x => x.code === c.code && x.text === c.text)) cm.push(c);
      overflow.push(...cm.slice(3));
      return { ...l, comments: cm.slice(0, 3) };
    }) }));
    return { ...a, parts, ...(overflow.length ? { comments: overflow } : {}) } satisfies ClaimAct;
  });
  const resolved = tasks.filter(t => emergencyKind(t.claimCode) && t.status !== "人が選ぶ");
  return { ...claim, acts, issues: claim.issues.filter(i => !resolved.some(t => i.text.includes(`救急医療管理加算${emergencyKind(t.claimCode) === "１" ? "1" : "2"}：`) && i.text.includes("いまは自動では入りません"))) };
}
