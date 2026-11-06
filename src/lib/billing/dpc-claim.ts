// DPC for one (fictional) patient and one claim month, next to the 出来高 claim. Server only: it reads the
// 医科診療行為マスター to know the 区分 of each claimed line.
//
// What the 包括 points contain and what stays 出来高 follows 令和８年厚生労働省告示第96号 別表 2・3
// (same list in 保医発0318第４号 第3の1(3)): イ the parts of the 点数表 that are contained, ロ the items taken
// out of them again. Anything not contained (手術・麻酔・リハビリ・在宅・評価料 …) is billed by the 点数表.

import { z } from "zod";
import { diagnosisClaimable, diagnosisLabel, isSuspected, type Diagnosis } from "../diagnoses";
import { loadMaster } from "../masters/server";
import type { OrderEntry, ProcedureOrder } from "../types";
import { deriveDpc, packagePoints, periodOf, type DpcAct, type DpcDerivation, type DpcIssue, type DpcOutcome, type DpcPackageLine, type DpcPeriod } from "./dpc";
import { DPC_SOURCES } from "./dpc-table";
import { calculateClaim } from "./engine";
import type { ClaimAct, ClaimInput, ClaimPart, ClaimResult, Shikibetsu } from "./model";
import { ClaimRequest } from "./request";

// ---------- 区分 of a claimed line ----------

interface Kubun {
  alpha: string;
  /** 章・部 of the 点数表 ("1"/"02" = 第1章第2部 入院料等). */
  sho: string;
  bu: string;
  no: number;
  eda: number;
  /** 項番 (0 = none). For 加算 (告示等識別区分 7) it is not the 項 of the 告示. */
  ko: number;
  name: string;
  /** 告示等識別区分（１）: 1 基本 / 3 合成 / 5 準用 / 7 加算 / 9 通則加算. */
  kokuji: string;
}

let kubunMap: Map<string, Kubun> | null = null;

/** 区分 of a 診療行為コード, from the master (columns 85 and 90–94 of the official layout). */
export function kubunOf(code: string): Kubun | undefined {
  if (!kubunMap) {
    const m = loadMaster("s");
    const at = (col: number) => m.cols!.indexOf(col);
    const c = { code: at(3), name: at(5), k1: at(68), alpha: at(85), sho: at(90), bu: at(91), no: at(92), eda: at(93), ko: at(94), base: at(113) };
    kubunMap = new Map(
      m.rows.map((r) => [
        r[c.code],
        { alpha: r[c.alpha], sho: r[c.sho], bu: r[c.bu], no: Number(r[c.no]), eda: Number(r[c.eda]), ko: Number(r[c.ko]), name: r[c.base] || r[c.name], kokuji: r[c.k1] },
      ]),
    );
  }
  return kubunMap.get(code);
}

export const kubunText = (k: Pick<Kubun, "alpha" | "no" | "eda">) => `${k.alpha}${String(k.no).padStart(3, "0")}${k.eda ? `-${k.eda}` : ""}`;

const parseKu = (s: string) => {
  const m = /^([A-Z])(\d{3})(?:-(\d+))?$/.exec(s)!;
  return { alpha: m[1], no: Number(m[2]), eda: m[3] ? Number(m[3]) : 0 };
};
/** from ≤ k ≤ to, by 区分番号 then 枝番 (the master keeps one level of 枝番: B001-3-3 is 枝番 3). */
const range = (from: string, to = from) => {
  const f = parseKu(from);
  const t = parseKu(to);
  return (k: Kubun) => k.alpha === f.alpha && (k.no - f.no || k.eda - f.eda) >= 0 && (k.no - t.no || k.eda - t.eda) <= 0;
};
const of = (s: string) => range(s);

/** 別表 2 ロ: items taken out of the 包括 again (they are billed by the 点数表). */
const TAKEN_OUT: { label: string; test: (k: Kubun) => boolean }[] = [
  {
    label: "A100 注4・注5、A104 注5・注10、A105 注3・注4",
    test: (k) => k.alpha === "A" && [100, 104, 105].includes(k.no) && k.eda === 0 && /重症児（者）受入連携加算|救急・在宅等支援病床初期加算|看護必要度加算|入院栄養管理体制加算|一般病棟看護必要度評価加算/.test(k.name),
  },
  { label: "A200 急性期総合体制加算", test: of("A200") },
  { label: "A204-2 臨床研修病院入院診療加算", test: of("A204-2") },
  { label: "A204-4〜A206（救急医療管理加算など）", test: range("A204-4", "A206") },
  { label: "A207-3 注4 看護補助体制充実加算", test: (k) => of("A207-3")(k) && k.name.includes("看護補助体制充実加算") },
  { label: "A208〜A213", test: range("A208", "A213") },
  { label: "A214 注4 看護補助体制充実加算", test: (k) => of("A214")(k) && k.name.includes("看護補助体制充実加算") },
  { label: "A219〜A233-3", test: range("A219", "A233-3") },
  { label: "A234-3〜A242-2（患者サポート体制充実加算・褥瘡ハイリスク患者ケア加算など）", test: range("A234-3", "A242-2") },
  { label: "A243-2 バイオ後続品使用体制加算", test: of("A243-2") },
  { label: "A244 病棟薬剤業務実施加算（3に限る）", test: (k) => of("A244")(k) && k.ko === 3 },
  { label: "A246〜A251（入退院支援加算・認知症ケア加算・せん妄ハイリスク患者ケア加算など）", test: range("A246", "A251") },
  { label: "A253 協力対象施設入所者入院加算", test: of("A253") },
  { label: "A255 精神科地域密着多機能体制加算", test: of("A255") },
  { label: "A400 短期滞在手術等基本料１", test: (k) => of("A400")(k) && k.ko === 1 },
  { label: "B000〜B001-3-3（特定疾患療養管理料〜生活習慣病管理料(Ⅱ)。入院栄養食事指導料（B001 10）を含む）", test: range("B000", "B001-3") },
  { label: "B001-6〜B015（薬剤管理指導料・診療情報提供料など）", test: range("B001-6", "B015") },
  { label: "D206 心臓カテーテル法による諸検査", test: of("D206") },
  { label: "D295〜D325（内視鏡検査など）", test: range("D295", "D325") },
  { label: "D401〜D419-2（穿刺・採取など）", test: range("D401", "D419-2") },
  { label: "画像診断管理加算１〜４", test: (k) => k.alpha === "E" && k.name.includes("画像診断管理加算") },
  { label: "E003 造影剤注入手技 3のイ（注1・注2を含む）", test: (k) => of("E003")(k) && k.ko === 3 && k.name.includes("選択的血管造影") },
  { label: "G020 無菌製剤処理料", test: of("G020") },
  { label: "J001 熱傷処置（5に限る）", test: (k) => of("J001")(k) && k.ko === 5 },
  ...["J003", "J003-3", "J003-4", "J007-2", "J010-2", "J017", "J017-2", "J027", "J034", "J034-3", "J043-6", "J043-7", "J045-2", "J045-3", "J047", "J047-2", "J049", "J052-2", "J054-2", "J062", "J062-2", "J116-5", "J118-4"].map((s) => ({ label: `${s}（処置）`, test: of(s) })),
  { label: "J038〜J042（人工腎臓・腹膜灌流など）", test: range("J038", "J042") },
  { label: "J045 人工呼吸（3のイ：5時間を超えた場合の14日目まで）", test: (k) => of("J045")(k) && k.name.includes("５時間を超えた場合") && k.name.includes("１４日目まで") },
  { label: "J122 四肢ギプス包帯（4〜6）", test: (k) => of("J122")(k) && k.ko >= 4 && k.ko <= 6 },
  { label: "J123〜J128（ギプス包帯）", test: range("J123", "J128") },
  { label: "J129・J129-2（2に限る）", test: (k) => (of("J129")(k) || of("J129-2")(k)) && k.ko === 2 },
  { label: "N003 術中迅速病理組織標本作製", test: of("N003") },
];

const PART_NAME: Record<string, string> = {
  "02": "在宅医療（第2部）",
  "07": "リハビリテーション（第7部。薬剤料を除く）",
  "08": "精神科専門療法（第8部。薬剤料を除く）",
  "10": "手術（第10部）",
  "11": "麻酔（第11部）",
  "12": "放射線治療（第12部）",
  "14": "その他（第14部：評価料・物価対応料）",
};

export interface LineClass {
  inPackage: boolean;
  /** The rule, in words. */
  rule: string;
  /** A case this prototype does not work out: a person checks it. */
  review?: boolean;
}

/** Whether a claimed line is contained in the 包括 points (別表 2 イ minus ロ), with the rule. */
export function classifyCode(code: string): LineClass {
  const k = kubunOf(code);
  if (!k) return { inPackage: false, rule: "マスターに区分がないため出来高のまま（確かめる）", review: true };
  const ku = kubunText(k);
  if (k.sho === "1" && k.bu === "02") {
    if (k.no >= 300 && k.no < 400) return { inPackage: false, rule: `${ku} 特定入院料（第1章第2部第3節）は算定告示 別表4〜6 の加算で扱う。この試作では計算しない`, review: true };
  } else if (k.sho === "1") return { inPackage: false, rule: `${ku} 初・再診料（第1章第1部）は包括に含まれない（別表 2 イ）` };
  else if (k.sho === "2") {
    if (PART_NAME[k.bu]) return { inPackage: false, rule: `${ku} ${PART_NAME[k.bu]}は包括に含まれない（別表 2 イにない → 別表 3）` };
    if (k.bu === "13" && k.no >= 6) return { inPackage: false, rule: `${ku} 病理診断・判断料（第13部第2節）は包括に含まれない（別表 2 イにない → 別表 3）` };
    if (!["01", "03", "04", "05", "06", "09", "13"].includes(k.bu)) return { inPackage: false, rule: `${ku} 包括に含まれない部（確かめる）`, review: true };
  } else return { inPackage: false, rule: `${ku} 区分を判定できない（確かめる）`, review: true };
  const out = TAKEN_OUT.find((t) => t.test(k));
  if (out) return { inPackage: false, rule: `${out.label}：包括から除かれる（別表 2 ロ）` };
  return { inPackage: true, rule: `${ku}：包括に含まれる（別表 2 イ）` };
}

/** A part is classed by its first SI line; a drug-only part by the act's first SI line, else by the 診療識別. */
function classifyPart(part: ClaimPart, act: ClaimAct): LineClass {
  const si = part.lines.find((l) => l.record === "SI") ?? act.parts.flatMap((p) => p.lines).find((l) => l.record === "SI");
  if (si) return classifyCode(si.code);
  const byShikibetsu: Partial<Record<Shikibetsu, string>> = { "21": "投薬（第5部）", "22": "投薬（第5部）", "24": "投薬（第5部）", "27": "投薬（第5部）", "31": "注射（第6部）", "32": "注射（第6部）", "33": "注射（第6部）", "40": "処置（第9部）" };
  const w = byShikibetsu[act.shikibetsu];
  return w ? { inPackage: true, rule: `${w}の薬剤料：包括に含まれる（別表 2 イ）` } : { inPackage: false, rule: "区分を判定できない（確かめる）", review: true };
}

// ---------- 手術・処置 in the record ----------

/** 診療行為 of the whole stay as DPC needs them: from the claimed lines and from orders the claim does not bill. */
export function recordedActs(claims: ClaimResult[], entries: ClaimInput["entries"]): DpcAct[] {
  const out: DpcAct[] = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const mm = Number(c.month.slice(5));
    for (const a of c.acts)
      for (const l of a.parts.flatMap((p) => p.lines)) {
        if (l.record !== "SI") continue;
        const k = kubunOf(l.code);
        // 加算・通則加算 are not the act itself.
        if (!k || k.kokuji === "7" || k.kokuji === "9" || k.sho !== "2") continue;
        const key = `${l.code}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const days = Object.keys(a.days).map(Number);
        out.push({
          kubun: kubunText(k),
          // 準用 (告示等識別区分 5): its 項 is not the 告示's, so it is left open (通知 第2の1(6): 準用元で判断).
          item: k.kokuji === "5" || !k.ko ? undefined : k.ko,
          name: k.name,
          source: `算定（${mm}/${days[0]}${days.length > 1 ? "ほか" : ""}）`,
          certain: true,
        });
      }
  }
  for (const e of entries.filter((x): x is OrderEntry => x.kind === "order" && x.status !== "中止")) {
    if (e.order.type !== "procedure") continue;
    const o = e.order as ProcedureOrder;
    if (o.code === "PROC-TX")
      out.push({ kubun: "K920", name: "輸血（K920、医科点数表 第10部）", source: "輸血のオーダ", certain: e.status === "実施済" });
    if (o.code === "PROC-HD")
      out.push({ kubun: "J038", name: `人工腎臓（透析指示：${o.hd?.purpose ?? ""}${o.hd?.method ? `・${o.hd.method}` : ""}。項はこの記録から決めない）`, source: "透析指示", certain: true });
    if (o.code === "PROC-CVC")
      out.push({ kubun: "G005", name: "中心静脈注射（中心静脈カテーテルの記録あり。中心静脈から注射したかは記録にない）", source: "中心静脈カテーテルのオーダ", certain: false });
  }
  return out;
}

// ---------- the month ----------

export interface DpcOptions {
  /** 医療資源を最も投入した傷病名, chosen by the doctor (diagnosis id). */
  mainDiagnosisId?: string;
  coefficient: number;
  /** 他の病院・診療所の病棟からの転院; null = not recorded. */
  transfer: boolean | null;
}

export interface DpcOutsideLine {
  shikibetsu: Shikibetsu;
  name: string;
  code: string;
  points: number;
  count: number;
  total: number;
  rule: string;
  review?: boolean;
  days: number[];
}

export interface DpcMonth {
  month: string;
  diagnoses: { id: string; label: string; icd10: string; main: boolean; start: number }[];
  chosen: { id: string; label: string; icd10: string; by: "doctor" | "default" } | null;
  outcome: DpcOutcome | null;
  acts: DpcAct[];
  /** Today's (or the discharge day's) 入院日 and 入院期間. */
  now: { hospitalDay: number; period: DpcPeriod | null; points: number | null };
  pkg: { lines: DpcPackageLine[]; total: number; raw: number } | null;
  outside: DpcOutsideLine[];
  outsideTotal: number;
  /** 出来高 points of the items the 包括 points replace (this month). */
  replaced: number;
  /** The 出来高 claim of this month, as on the 算定 tab. */
  ffsTotal: number;
  dpcTotal: number | null;
  coefficient: number;
  meals: ClaimResult["meals"];
  issues: DpcIssue[];
  sources: { label: string; url: string }[];
}

const dayMs = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const monthOf = (ms: number) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** The doctor's choice, else (a proposal only) the 主病名 given first — the nearest to 入院の契機となった傷病名. */
function chooseDiagnosis(diagnoses: Diagnosis[], id?: string): { d: Diagnosis; by: "doctor" | "default" } | null {
  const coded = diagnoses.filter((d) => d.icd10);
  const picked = id ? coded.find((d) => d.id === id) : undefined;
  if (picked) return { d: picked, by: "doctor" };
  const mains = coded.filter((d) => d.main && !isSuspected(d));
  const pool = mains.length ? mains : coded.filter((d) => !isSuspected(d));
  const first = [...pool].sort((a, b) => a.start - b.start)[0];
  return first ? { d: first, by: "default" } : null;
}

export function dpcMonth(input: Omit<ClaimInput, "month">, month: string, opts: DpcOptions): DpcMonth {
  const p = input.patient;
  const base = utc(input.today);
  const admitted = base + p.admittedOn * dayMs;
  const last = p.dischargedOn ?? 0;
  const months: string[] = [];
  for (let d = p.admittedOn; d <= last; d++) {
    const m = monthOf(base + d * dayMs);
    if (!months.includes(m)) months.push(m);
  }
  const claims = months.map((m) => calculateClaim({ ...input, month: m }));
  const claim = claims[months.indexOf(month)] ?? calculateClaim({ ...input, month });
  const issues: DpcIssue[] = [];
  const acts = recordedActs(claims, input.entries);

  input = { ...input, diagnoses: input.diagnoses.filter(d => diagnosisClaimable(d, month)) };
  const choice = chooseDiagnosis(input.diagnoses, opts.mainDiagnosisId);
  const outcome: DpcOutcome | null = choice
    ? deriveDpc({
        icd10: choice.d.icd10!,
        diagnosis: diagnosisLabel(choice.d),
        age: p.age,
        acts,
        others: input.diagnoses.filter((d) => d.id !== choice.d.id && d.icd10 && !isSuspected(d)).map((d) => ({ icd10: d.icd10!, name: diagnosisLabel(d) })),
        transfer: opts.transfer,
      })
    : null;
  if (!choice) issues.push({ level: "review", text: "ICD-10 の付いた病名がないため、DPC コードを出せません。" });
  if (choice?.by === "default")
    issues.push({
      level: "info",
      text: `医療資源を最も投入した傷病名は主治医が選びます（留意事項 第2の1(2)）。まだ選ばれていないので、主病名のうち最も早く付いた「${diagnosisLabel(choice.d)}」で仮に計算しています。`,
    });
  issues.push({ level: "info", text: "年齢は入院時の年齢で分けます（留意事項 第2の3(3)）。この試作では患者の欄の年齢を使っています。" });

  const lastHd = Math.round(((base + last * dayMs) - admitted) / dayMs) + 1;
  const [cy, cm] = month.split("-").map(Number);
  const hospitalDay = (dom: number) => Math.round((Date.UTC(cy, cm - 1, dom) - admitted) / dayMs) + 1;
  const monthDays = claim.from === null || claim.to === null ? [] : Array.from({ length: claim.to - claim.from + 1 }, (_, i) => claim.from! + i);
  const d = outcome?.ok ? outcome.d : null;
  const now = d ? { hospitalDay: lastHd, ...periodOf(d.row, lastHd) } : { hospitalDay: lastHd, period: null, points: null };
  const pkg = d?.hokatsu ? packagePoints(d.row, opts.coefficient, monthDays.map(hospitalDay)) : null;
  const beyond = new Set(pkg?.beyond ?? []);

  // Split the 出来高 claim of the month: what the 包括 points replace, and what stays 出来高.
  const outside = new Map<string, DpcOutsideLine>();
  let replaced = 0;
  for (const a of claim.acts) {
    if (a.shikibetsu === "97") continue; // 入院時食事療養 stays as it is (算定告示 別表とは別)
    const classes = a.parts.map((part) => classifyPart(part, a));
    for (const [domText, times] of Object.entries(a.days)) {
      const dom = Number(domText);
      a.parts.forEach((part, i) => {
        const c: LineClass = !pkg
          ? { inPackage: false, rule: "包括にならないため医科点数表で算定" }
          : beyond.has(hospitalDay(dom))
            ? { inPackage: false, rule: "入院日Ⅲを超えた日：医科点数表で算定（留意事項 第3の1(5)）" }
            : classes[i];
        if (c.inPackage) {
          replaced += part.points * times;
          return;
        }
        const key = `${claim.acts.indexOf(a)}|${i}|${c.rule}`;
        const line = outside.get(key) ?? {
          shikibetsu: a.shikibetsu,
          name: part.lines.map((l) => l.name).join("＋"),
          code: part.lines[0]?.code ?? "",
          points: part.points,
          count: 0,
          total: 0,
          rule: c.rule,
          review: c.review,
          days: [],
        };
        line.count += times;
        line.total += part.points * times;
        line.days.push(dom);
        outside.set(key, line);
      });
    }
  }
  const outsideLines = [...outside.values()].sort((x, y) => x.shikibetsu.localeCompare(y.shikibetsu));
  const outsideTotal = outsideLines.reduce((s, l) => s + l.total, 0);
  if (outsideLines.some((l) => l.review)) issues.push({ level: "review", text: "出来高の行のうち「確かめる」と書いたものは、この試作で区分を判定できませんでした。医事課が確かめてください。" });
  issues.push({ level: "info", text: "抗HIV薬と血友病等の製剤は包括から除かれます（別表 2 ロ(10)(11)）。この試作では薬の名前から判定していません。" });
  if (pkg)
    issues.push({ level: "info", text: "退院時に決まった診断群分類が、前の月までに請求した分類と違うときは、差額を退院の月に調整します（留意事項 第3の2(4)）。" });

  return {
    month,
    diagnoses: input.diagnoses.filter((x) => x.icd10).map((x) => ({ id: x.id, label: diagnosisLabel(x), icd10: x.icd10!, main: x.main, start: x.start })),
    chosen: choice ? { id: choice.d.id, label: diagnosisLabel(choice.d), icd10: choice.d.icd10!, by: choice.by } : null,
    outcome,
    acts,
    now,
    pkg: pkg ? { lines: pkg.lines, total: pkg.total, raw: pkg.raw } : null,
    outside: outsideLines,
    outsideTotal,
    replaced,
    ffsTotal: claim.totalPoints,
    dpcTotal: pkg ? pkg.total + outsideTotal : null,
    coefficient: opts.coefficient,
    meals: claim.meals,
    issues,
    sources: Object.values(DPC_SOURCES),
  };
}

/** POST /api/dpc: the 算定 request plus the doctor's choices and the (fictional) coefficient. */
export const DpcRequest = ClaimRequest.extend({
  dpc: z.object({
    mainDiagnosisId: z.string().max(80).optional(),
    coefficient: z.number().min(0.5).max(3),
    transfer: z.boolean().nullable(),
  }),
});

/** What the screen gets: the class without its lookup tables (they stay on the server). */
export type DpcDerivationView = Omit<DpcDerivation, "cls"> & { cls: { code: string; name: string; mdcName: string; usesTransfer: boolean } };
export type DpcMonthView = Omit<DpcMonth, "outcome"> & { outcome: { ok: true; d: DpcDerivationView } | { ok: false; reason: string; issues: DpcIssue[] } | null };

export function dpcView(r: DpcMonth): DpcMonthView {
  if (!r.outcome?.ok) return { ...r, outcome: r.outcome };
  const { cls, ...d } = r.outcome.d;
  return { ...r, outcome: { ok: true, d: { ...d, cls: { code: cls.code, name: cls.name, mdcName: cls.mdcName, usesTransfer: !!cls.transfer } } } };
}
