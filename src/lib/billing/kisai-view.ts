// 記載・書類の画面（算定の「記載・書類」タブ）が使う、記録から決まる表示と保存の形。画面から読む（fs を読まない）。
// 点検の「ない」は算定の可否ではない。詳記の文は医師が書き、ここは事実を並べて貼るだけ。
import type { PanelKind } from "../../components/ToolRail";
import { labName } from "../format";
import type { KisaiCheck } from "./kisai";
import type { KisaiWorkspace } from "./kisai-workspace";
import type { ClaimLine, ClaimResult } from "./model";
import { shokiSeries, type collectShokiFacts, type Shoki, type ShokiCategory, type ShokiTarget } from "./shoki";
import type { TekiyoAnswer, TekiyoTask } from "./tekiyo";

/** 点検の行を押したときに開く場所。ある→その記録、ない→作る道具。 */
export interface KisaiTarget {
  panel: PanelKind;
  key?: string;
  /** 書類作成で最初に開く書類。 */
  docKind?: "栄養管理計画書" | "退院支援計画書";
  /** 記事を開く日（入院時の記事など）。 */
  day?: number;
}

export const PANEL_LABEL: Partial<Record<PanelKind, string>> = {
  docs: "書類作成",
  nutrition: "栄養管理",
  bedside: "ベッドサイド表示",
  "msw-support": "退院支援",
  "nursing-plan": "看護計画",
  "guide-record": "指導の記録",
  "pharmacy-tdm": "TDM",
  letter: "紹介状",
  restraint: "身体的拘束",
  templates: "テンプレート",
  billing: "記事",
};

export function kisaiTarget(c: KisaiCheck): KisaiTarget {
  const docKind = c.id === "nutrition-plan" ? "栄養管理計画書" : c.id === "discharge-plan" ? "退院支援計画書" : undefined;
  const e = c.evidence[0];
  if (e) {
    // 入院時の記事はカルテのその日を開く（算定の画面の中ではない）。
    if (e.panel === "billing") return { panel: "billing", day: (e.data as { day?: number }).day };
    return { panel: e.panel, key: e.key, ...(e.panel === "docs" && docKind ? { docKind } : {}) };
  }
  // 救急医療管理加算の根拠は「型のある記録」で書く。
  if (c.open.panel === "billing") return { panel: "templates" };
  return { panel: c.open.panel, ...(c.open.panel === "docs" && docKind ? { docKind } : {}) };
}

/** SI の算定行（コードごとに1つ）。 */
export function siLines(claim: ClaimResult): ClaimLine[] {
  return [...new Map(claim.acts.flatMap((a) => a.parts.flatMap((p) => p.lines)).filter((l) => l.record === "SI").map((l) => [l.code, l])).values()];
}

/** 照合していない算定行（「記載不要」ではない）。 */
export const unverifiedLines = (claim: ClaimResult, codes: Iterable<string>) => {
  const seen = new Set(codes);
  return siLines(claim).filter((l) => !seen.has(l.code));
};

export const lineName = (claim: ClaimResult, code: string) => siLines(claim).find((l) => l.code === code)?.name ?? code;

/** 人の手がまだ要る件数（タブの数字）。「人が確かめる」は数えない（ほぼ全部が人の確認を含むため）。 */
export function kisaiPending(checks: KisaiCheck[], tekiyo: TekiyoTask[], required: { target: ShokiTarget }[], shoki: Shoki[]): number {
  const confirmed = new Set(shoki.filter((s) => s.status === "確定").flatMap((s) => s.targets.map((t) => t.code)));
  return checks.filter((c) => c.status === "ない").length + tekiyo.filter((t) => t.status === "人が選ぶ").length + required.filter((r) => !confirmed.has(r.target.code)).length;
}

// 症状詳記区分（記録条件仕様 別表）。この画面で選べるのは 01〜07。
export const SHOKI_CATEGORIES: { code: ShokiCategory; label: string }[] = [
  { code: "01", label: "01 主たる疾患の診断根拠となった臨床症状" },
  { code: "02", label: "02 主たる疾患の診断根拠となった診察・検査所見" },
  { code: "03", label: "03 主な治療行為の必要性" },
  { code: "04", label: "04 主な治療行為の経過" },
  { code: "05", label: "05 100万点以上：薬剤に係る症状等" },
  { code: "06", label: "06 100万点以上：処置に係る症状等" },
  { code: "07", label: "07 その他" },
];

export interface ShokiSeriesView {
  series: string;
  targets: ShokiTarget[];
  /** 確定した版（古い順）。 */
  versions: Shoki[];
  /** 確定した最新の版より新しい下書き。 */
  draft?: Shoki;
}

/** その患者・月の詳記を系列ごとに。 */
export function shokiSeriesOf(items: Shoki[], patientId: string, month: string): ShokiSeriesView[] {
  const by = new Map<string, Shoki[]>();
  for (const s of items) if (s.patientId === patientId && s.month === month) by.set(shokiSeries(s), [...(by.get(shokiSeries(s)) ?? []), s]);
  return [...by.entries()].map(([series, list]) => {
    const versions = list.filter((s) => s.status === "確定").sort((a, b) => a.version - b.version);
    const last = versions.at(-1)?.version ?? 0;
    const draft = list.filter((s) => s.status === "下書き" && s.version > last).sort((a, b) => b.version - a.version)[0];
    return { series, targets: (draft ?? versions.at(-1) ?? list[0]).targets, versions, ...(draft ? { draft } : {}) };
  });
}

/** 下書きの保存と確定。確定した版は消さずに残し、直すと次の版の下書きになる。 */
export function saveShoki(w: KisaiWorkspace, input: { series?: string; patientId: string; month: string; targets: ShokiTarget[]; category: ShokiCategory; body: string; by: string; at: string; newId: () => string }, status: Shoki["status"]): KisaiWorkspace {
  const view = input.series ? shokiSeriesOf(w.shoki, input.patientId, input.month).find((v) => v.series === input.series) : undefined;
  const version = (view?.versions.at(-1)?.version ?? 0) + 1;
  const base = { patientId: input.patientId, month: input.month, targets: input.targets, category: input.category, body: input.body, status, by: input.by, at: input.at, version };
  if (view?.draft) return { ...w, shoki: w.shoki.map((s) => (s === view.draft ? { ...s, ...base } : s)) };
  const id = input.newId();
  const series = input.series ?? id;
  return { ...w, shoki: [...w.shoki, { id, ...base, ...(series !== id ? { series } : {}) }] };
}

export const latestAnswer = (w: KisaiWorkspace, patientId: string, month: string, claimCode: string): TekiyoAnswer | undefined =>
  w.tekiyoAnswers.filter((a) => a.patientId === patientId && a.month === month && a.claimCode === claimCode).at(-1);

/** 患者・月・項目ごとに最新の答えだけを残す。 */
export function saveAnswer(w: KisaiWorkspace, a: TekiyoAnswer): KisaiWorkspace {
  return { ...w, tekiyoAnswers: [...w.tekiyoAnswers.filter((x) => !(x.patientId === a.patientId && x.month === a.month && x.claimCode === a.claimCode)), a] };
}

/** 元号コード付き年月日7桁（令和＝5）。令和より前は出さない。 */
export function gengoDate(iso: string): string | undefined {
  const [y, m, d] = iso.split("-");
  if (!y || iso < "2019-05-01") return undefined;
  return `5${String(Number(y) - 2018).padStart(2, "0")}${m}${d}`;
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export interface FactChip {
  group: "病名" | "検査" | "経過" | "薬";
  id: string;
  label: string;
  /** 本文に貼る文（記録のまま。言い換えない）。 */
  text: string;
}

/** カルテの事実を、押すと本文に貼れる形に並べる。検査は項目ごとに日付順。 */
export function factChips(facts: ReturnType<typeof collectShokiFacts>): FactChip[] {
  const out: FactChip[] = [];
  for (const d of facts.diagnoses) out.push({ group: "病名", id: `dx:${d.id}`, label: d.name, text: `${d.name}（${md(d.startDate)}〜）` });
  const labs = new Map<string, typeof facts.labs>();
  for (const l of facts.labs) labs.set(l.code, [...(labs.get(l.code) ?? []), l]);
  for (const [code, vs] of labs) {
    const series = vs.map((v) => `${v.value}（${md(v.date)}）`).join("→");
    out.push({ group: "検査", id: `lab:${code}`, label: `${labName(code)} ${vs.slice(-3).map((v) => v.value).join("→")}`, text: `${labName(code)} ${series}` });
  }
  for (const n of facts.notes) out.push({ group: "経過", id: `note:${n.id ?? `${n.date}${n.time}`}`, label: `${md(n.date)} ${n.heading}`, text: `${md(n.date)} ${n.heading}` });
  for (const m of facts.medications) {
    const what = m.items.map((i) => `${i.name} ${i.amount}${i.unit}`).join("・");
    out.push({ group: "薬", id: `rx:${m.id}`, label: what, text: `${what}（${md(m.date)}〜）` });
  }
  return out;
}
