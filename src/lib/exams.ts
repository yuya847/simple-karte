// Imaging (画像検査) and physiological tests (生理検査) of the FICTIONAL hospital: what can be
// ordered, the questions an order must answer, and the checks — all in code. Claude only fills
// in what the doctor said; it never picks a study, a region or a contrast.

import { consentIssue, type CheckContext, type Draft, type Issue } from "./drafts";
import { consentFor } from "./consent";
import { minutesOf } from "./dates";
import { findOralDrug } from "./master";
import type { DayOffset, OrderEntry, Patient, Sex } from "./types";

export type Modality = "X線" | "ポータブルX線" | "CT" | "MRI";
export const MODALITIES: Modality[] = ["X線", "ポータブルX線", "CT", "MRI"];
export type Contrast = "単純" | "造影" | "単純＋造影" | "放射線科一任";
export type Reading = "緊急読影" | "当日中" | "後日" | "読影不要";
export const READINGS: Reading[] = ["緊急読影", "当日中", "後日", "読影不要"];
export type Transport = "独歩" | "車椅子" | "ストレッチャー" | "病室（ポータブル）";
export type ExamPriority = "予約" | "至急";

export interface RegionMaster {
  code: string;
  name: string;
  modalities: Modality[];
  /** X線 views offered (one set is chosen). */
  views?: string[][];
  /** E001 写真診断: イ = 頭部・胸部・腹部・脊椎, ロ = その他. */
  xray?: "イ" | "ロ";
  aliases: string[];
}

export const REGIONS: RegionMaster[] = [
  { code: "R-CHEST", name: "胸部", modalities: ["X線", "ポータブルX線", "CT"], views: [["立位正面（PA）"], ["立位正面（PA）", "側面"], ["臥位正面（AP）"]], xray: "イ", aliases: ["胸", "胸部", "肺", "チェスト"] },
  { code: "R-ABD", name: "腹部", modalities: ["X線", "ポータブルX線", "CT"], views: [["臥位"], ["臥位", "立位"]], xray: "イ", aliases: ["腹", "腹部", "おなか"] },
  { code: "R-CHEST-ABD", name: "胸腹部", modalities: ["CT"], aliases: ["胸腹部", "胸から腹"] },
  { code: "R-ABD-PELVIS", name: "腹部・骨盤", modalities: ["CT", "MRI"], aliases: ["腹部骨盤", "腹骨盤", "骨盤"] },
  { code: "R-HEAD", name: "頭部", modalities: ["X線", "CT", "MRI"], views: [["正面", "側面"]], xray: "イ", aliases: ["頭", "頭部", "脳"] },
  { code: "R-CSPINE", name: "頸椎", modalities: ["X線", "MRI"], views: [["正面", "側面"]], xray: "イ", aliases: ["頸椎", "首"] },
  { code: "R-LSPINE", name: "腰椎", modalities: ["X線", "CT", "MRI"], views: [["正面", "側面"]], xray: "イ", aliases: ["腰椎", "腰"] },
  { code: "R-KNEE", name: "膝関節", modalities: ["X線", "MRI"], views: [["正面", "側面"]], xray: "ロ", aliases: ["膝"] },
  { code: "R-LEG", name: "下腿", modalities: ["X線", "MRI"], views: [["正面", "側面"]], xray: "ロ", aliases: ["下腿", "すね"] },
  { code: "R-HIP", name: "股関節", modalities: ["X線"], views: [["正面"], ["正面", "側面"]], xray: "ロ", aliases: ["股関節", "股"] },
];

export function findRegion(code: string) {
  return REGIONS.find((r) => r.code === code);
}

export interface PhysioMaster {
  code: string;
  name: string;
  /** 診療行為コード billed when done (60 検査). */
  codes: string[];
  bedside: boolean;
  note?: string;
  aliases: string[];
}

export const PHYSIO: PhysioMaster[] = [
  { code: "PHY-ECG", name: "心電図（12誘導）", codes: ["160068410"], bedside: true, aliases: ["心電図", "ECG", "12誘導", "エクグ"] },
  { code: "PHY-UCG", name: "心エコー（経胸壁）", codes: ["160072510"], bedside: true, aliases: ["心エコー", "UCG", "心臓超音波", "TTE"] },
  { code: "PHY-ABDUS", name: "腹部エコー", codes: ["160072210"], bedside: true, note: "検査の前は絶食（院内の約束・架空）", aliases: ["腹部エコー", "腹エコー", "腹部超音波"] },
  { code: "PHY-CAROTID", name: "頸動脈エコー", codes: ["160165010"], bedside: false, aliases: ["頸動脈エコー", "頸部エコー", "頸動脈超音波"] },
  { code: "PHY-LEVEIN", name: "下肢静脈エコー", codes: ["160213010"], bedside: true, aliases: ["下肢静脈エコー", "下肢エコー", "DVT検索", "下肢血管エコー"] },
  { code: "PHY-SPIRO", name: "呼吸機能（肺気量分画・フローボリューム）", codes: ["160062610", "160062710"], bedside: false, aliases: ["呼吸機能", "スパイロ", "肺機能", "PFT"] },
  { code: "PHY-ABI", name: "ABI（血管伸展性検査）", codes: ["160071750"], bedside: false, aliases: ["ABI", "PWV", "血管伸展性"] },
  { code: "PHY-HOLTER", name: "ホルター心電図（24時間）", codes: ["160069610"], bedside: true, aliases: ["ホルター", "24時間心電図"] },
  { code: "PHY-EEG", name: "脳波", codes: ["160075310"], bedside: false, aliases: ["脳波", "EEG"] },
  // 内視鏡（院内の約束・架空：上部は検査の前の食事を止める、大腸は前日から検査食と下剤）
  { code: "PHY-EGD", name: "上部消化管内視鏡（胃カメラ）", codes: ["160093810"], bedside: false, note: "検査の前は絶食（院内の約束・架空）", aliases: ["胃カメラ", "上部内視鏡", "上部消化管内視鏡", "GF", "EGD", "GIF"] },
  { code: "PHY-CF", name: "大腸内視鏡（全大腸）", codes: ["160094910"], bedside: false, note: "前日から検査食と下剤、当日は絶食（院内の約束・架空）", aliases: ["大腸カメラ", "大腸内視鏡", "下部内視鏡", "CF", "TCS"] },
  { code: "PHY-BF", name: "気管支鏡", codes: ["160092810"], bedside: false, note: "検査の前は絶食（院内の約束・架空）", aliases: ["気管支鏡", "BF", "ブロンコ"] },
];

export function findPhysio(code: string) {
  return PHYSIO.find((p) => p.code === code);
}

/** Booking slots of the fictional hospital (X線 every 30 min, CT/MRI/生理 by the hour). */
export const EXAM_RULES = { open: "09:00", close: "16:30", stat: "今から（至急）" };

// ---------------------------------------------------------------------------
// eGFR（日本人の推算式、日本腎臓学会）: 194 × Cr^-1.094 × 年齢^-0.287（女性 × 0.739）
// ---------------------------------------------------------------------------

export function egfr(cre: number, age: number, sex: Sex): number {
  const v = 194 * Math.pow(cre, -1.094) * Math.pow(age, -0.287) * (sex === "女" ? 0.739 : 1);
  return Math.round(v * 10) / 10;
}

export function latestCre(p: Patient): { value: number; day: DayOffset } | null {
  const rows = [...p.labs].filter((l) => l.values.Cre !== undefined).sort((a, b) => a.day - b.day || minutesOf(a.time) - minutesOf(b.time));
  const last = rows.at(-1);
  return last ? { value: last.values.Cre, day: last.day } : null;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

interface ExamBase {
  id: string;
  origin: "ai" | "manual";
  sourceText: string;
  comment: string | null;
  purpose: string | null;
  when: { day: DayOffset | null; time: string | null; priority: ExamPriority | null };
  acks: string[];
  duplicateOk: boolean;
}

export interface ImagingDraft extends ExamBase {
  kind: "imaging";
  modality: Modality | null;
  region: string | null;
  regionSaid: string;
  views: string[] | null;
  contrast: Contrast | null;
  transport: Transport | null;
  /** Answers to the safety questions (MRI 体内金属, 妊娠). */
  answers: { metal?: string; pregnancy?: string };
  /** 読影区分（単純写真）. */
  reading: Reading | null;
  /** Prepare the consent form with the order. */
  consentPlanned?: boolean;
}

export interface PhysioDraft extends ExamBase {
  kind: "physio";
  test: string | null;
  said: string;
  place: "検査室" | "ベッドサイド" | null;
  transport: Transport | null;
}

export const EXAM_ACK = { 腎機能: "腎機能承知", 造影剤: "造影剤アレルギー承知", 喘息: "喘息承知", ビグアナイド: "ビグアナイド休薬指示済み", ホルター: "ホルター装着中承知" } as const;

const set = <T extends ImagingDraft | PhysioDraft>(patch: Partial<T>) => (x: Draft) => ({ ...(x as T), ...patch });
const ack = (a: string) => (x: Draft) => ({ ...(x as ImagingDraft), acks: [...new Set([...(x as ImagingDraft).acks, a])] });

function whenChoices<T extends ImagingDraft | PhysioDraft>(): { label: string; apply: (x: Draft) => Draft }[] {
  return [
    { label: EXAM_RULES.stat, apply: set<T>({ when: { day: 0, time: null, priority: "至急" } } as Partial<T>) },
    { label: "今日 14:00 の枠", apply: set<T>({ when: { day: 0, time: "14:00", priority: "予約" } } as Partial<T>) },
    { label: "明日 09:30 の枠", apply: set<T>({ when: { day: 1, time: "09:30", priority: "予約" } } as Partial<T>) },
    { label: "明日 14:00 の枠", apply: set<T>({ when: { day: 1, time: "14:00", priority: "予約" } } as Partial<T>) },
  ];
}

function checkWhen(d: ImagingDraft | PhysioDraft, ctx: CheckContext, issues: Issue[]) {
  if (!d.when.priority) {
    issues.push({ key: "when", level: "ask", title: "日時", message: "いつ行うかが抜けています。", choices: whenChoices() });
  } else if (d.when.priority === "予約" && d.when.time && (d.when.day ?? 0) === 0 && minutesOf(d.when.time) <= minutesOf(ctx.nowTime)) {
    issues.push({ key: "when", level: "ask", title: "日時", message: `今日 ${d.when.time} はもう過ぎています。`, choices: whenChoices() });
  } else {
    issues.push({ key: "when", level: "info", title: "日時", message: d.when.priority === "至急" ? EXAM_RULES.stat : `${ctx.fmtDay(d.when.day ?? 0)} ${d.when.time ?? "（時刻は検査室が決める）"} 予約` });
  }
  if (!d.purpose) issues.push({ key: "purpose", level: "ask", title: "目的", message: "検査の目的（臨床診断・知りたいこと）が抜けています。言い足してください。" });
}

export interface ExamPatientFacts {
  sex: Sex;
  age: number;
  allergies: string[];
  cre: { value: number; day: DayOffset } | null;
  heightCm?: number;
  weightKg?: number;
  /** 妊娠中 marked on the chart (weeks if known). */
  pregnancy?: { weeks: number | null } | null;
}

/** Running oral drugs of a class (e.g. ビグアナイド系), for the contrast check. */
function runningOfClass(orders: OrderEntry[], cls: string): string[] {
  return orders.flatMap((o) => (o.order.type === "prescription" && findOralDrug(o.order.drugCode)?.classes?.includes(cls) ? [findOralDrug(o.order.drugCode)!.name] : []));
}

export function checkImaging(d: ImagingDraft, ctx: CheckContext, pt: ExamPatientFacts | null): Issue[] {
  const issues: Issue[] = [];
  if (!d.modality) issues.push({ key: "modality", level: "ask", title: "種類", message: "検査の種類が抜けています。", choices: MODALITIES.map((m) => ({ label: m, apply: set<ImagingDraft>({ modality: m }) })) });
  const region = d.region ? findRegion(d.region) : undefined;
  if (!region) {
    const options = REGIONS.filter((r) => !d.modality || r.modalities.includes(d.modality));
    issues.push({
      key: "region",
      level: d.regionSaid ? "stop" : "ask",
      title: "部位",
      message: d.regionSaid ? `「${d.regionSaid}」は部位のマスターにありません。` : "部位が抜けています。",
      choices: options.map((r) => ({ label: r.name, apply: set<ImagingDraft>({ region: r.code }) })),
    });
  } else if (d.modality && !region.modalities.includes(d.modality)) {
    issues.push({ key: "region", level: "stop", title: "部位", message: `${region.name}の${d.modality}は、この院の検査のマスターにありません（${region.modalities.join("・")}）。` });
  }
  const xray = d.modality === "X線" || d.modality === "ポータブルX線";
  if (xray && region?.views) {
    if (d.modality === "ポータブルX線" && !d.views) {
      issues.push({ key: "views", level: "info", title: "撮影", message: "ポータブルは病室で臥位正面（AP）" });
    } else if (!d.views) {
      issues.push({ key: "views", level: "ask", title: "撮影", message: "撮影の方向が抜けています。", choices: region.views.map((v) => ({ label: v.join("＋"), apply: set<ImagingDraft>({ views: v }) })) });
    }
    if ((d.views?.length ?? 1) > 1) issues.push({ key: "films", level: "info", title: "算定", message: "同じ部位の2枚目からは写真診断・撮影が100分の50になります（E001・E002 通則）。" });
  }
  if (xray && !d.reading) {
    issues.push({ key: "reading", level: "ask", title: "読影", message: "読影区分が抜けています。", choices: READINGS.map((r) => ({ label: r, apply: set<ImagingDraft>({ reading: r }) })) });
  }
  if ((d.modality === "CT" || d.modality === "MRI") && !d.contrast) {
    issues.push({ key: "contrast", level: "ask", title: "造影", message: "単純か造影かが抜けています。", choices: (["単純", "造影", "単純＋造影", "放射線科一任"] as Contrast[]).map((c) => ({ label: c, apply: set<ImagingDraft>({ contrast: c }) })) });
  }
  if (d.modality === "ポータブルX線") {
    if (d.transport !== "病室（ポータブル）") issues.push({ key: "transport", level: "info", title: "移動", message: "病室で撮影（移動なし）" });
  } else if (!d.transport) {
    issues.push({ key: "transport", level: "ask", title: "移動", message: "移動の方法が抜けています。", choices: (["独歩", "車椅子", "ストレッチャー"] as Transport[]).map((t) => ({ label: t, apply: set<ImagingDraft>({ transport: t }) })) });
  }

  // 造影: 腎機能・アレルギー・喘息・ビグアナイド（判断は医師。コードは値と指針の名前を出して承知を求めるだけ）
  // 「放射線科一任」も造影の可能性があるので同じ確認をする。
  if (d.contrast && d.contrast !== "単純" && pt) {
    const gd = d.modality === "MRI";
    const agent = gd ? "ガドリニウム造影剤" : "ヨード造影剤";
    const guideline = gd
      ? "「腎障害患者におけるガドリニウム造影剤使用に関するガイドライン」第3版（2024）は、長期透析・透析をしていない eGFR 30未満の慢性腎不全・急性腎不全では、できるだけ避けて他の検査で代替するとしています"
      : "「腎障害患者におけるヨード造影剤使用に関するガイドライン2018」は、静脈からの造影で eGFR 30未満に予防策を勧めています";
    if (pt.cre) {
      const e = egfr(pt.cre.value, pt.age, pt.sex);
      const stale = pt.cre.day < -90;
      const msg = `eGFR ${e}（Cre ${pt.cre.value}、${ctx.fmtDay(pt.cre.day)}。194 × Cr^−1.094 × 年齢^−0.287${pt.sex === "女" ? " × 0.739" : ""}）`;
      if ((e < 30 || stale) && !d.acks.includes(EXAM_ACK.腎機能)) {
        issues.push({
          key: "egfr",
          level: "ask",
          title: "腎機能",
          message: stale ? `${msg}。Cre の測定から90日を超えています。` : `${msg}。${guideline}。`,
          choices: [{ label: `確かめた・承知（${EXAM_ACK.腎機能}）`, apply: ack(EXAM_ACK.腎機能) }],
        });
      } else issues.push({ key: "egfr", level: "info", title: "腎機能", message: msg });
    } else {
      issues.push({ key: "egfr", level: "ask", title: "腎機能", message: "Cre の値がありません。造影の前に腎機能を確かめてください。", choices: [{ label: `承知（${EXAM_ACK.腎機能}）`, apply: ack(EXAM_ACK.腎機能) }] });
    }
    const allergy = pt.allergies.find((a) => a.includes("造影剤") && (gd ? a.includes("ガドリニウム") : !a.includes("ガドリニウム")));
    if (allergy && !d.acks.includes(EXAM_ACK.造影剤)) {
      issues.push({ key: "allergy", level: "ask", title: "アレルギー", message: `カルテのアレルギー：${allergy}（${agent}）`, choices: [{ label: `承知して出す（${EXAM_ACK.造影剤}）`, apply: ack(EXAM_ACK.造影剤) }] });
    }
    const asthma = pt.allergies.find((a) => a.includes("喘息"));
    if (asthma && !d.acks.includes(EXAM_ACK.喘息)) {
      issues.push({ key: "asthma", level: "ask", title: "喘息", message: `カルテに喘息の記載：${asthma}`, choices: [{ label: `承知して出す（${EXAM_ACK.喘息}）`, apply: ack(EXAM_ACK.喘息) }] });
    }
    const bg = gd ? [] : runningOfClass(ctx.activeOrders, "ビグアナイド系");
    if (bg.length && !d.acks.includes(EXAM_ACK.ビグアナイド)) {
      issues.push({
        key: "biguanide",
        level: "ask",
        title: "内服",
        message: `ビグアナイド系（${bg.join("、")}）を内服中です。日本医学放射線学会ほかの「ヨード造影剤とビグアナイド系糖尿病薬との併用注意について」は、造影の前後の一時休薬を求めています。`,
        choices: [{ label: `休薬の指示を出した（${EXAM_ACK.ビグアナイド}）`, apply: ack(EXAM_ACK.ビグアナイド) }],
      });
    }
  }
  // ホルター心電図をつけている日は、X線・CT・MRI と重ならないように（生理検査の案内の例）
  {
    const day = d.when.day ?? 0;
    const holter = ctx.activeOrders.find((o) => o.order.type === "physio" && o.order.test === "PHY-HOLTER" && (o.order.when.day === day || o.order.when.day === day - 1));
    if (holter && !d.acks.includes(EXAM_ACK.ホルター)) {
      issues.push({ key: "holter", level: "ask", title: "ホルター", message: `ホルター心電図をつけている時期と重なります：${ctx.describe(holter)}`, choices: [{ label: `承知（${EXAM_ACK.ホルター}）`, apply: ack(EXAM_ACK.ホルター) }] });
    }
  }
  if (d.modality === "MRI" && !d.answers.metal) {
    issues.push({
      key: "metal",
      level: "ask",
      title: "MRI",
      message: "ペースメーカー・体内金属・人工内耳などの確認が要ります。",
      choices: [
        { label: "確認済み：なし", apply: (x) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, metal: "なし（確認済み）" } }) },
        { label: "あり：MRI 対応を確認済み", apply: (x) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, metal: "あり（MRI 対応を確認済み）" } }) },
      ],
    });
  }
  if (pt && ((pt.sex === "女" && pt.age >= 12 && pt.age <= 55) || pt.pregnancy) && d.modality !== "MRI" && !d.answers.pregnancy) {
    issues.push({
      key: "pregnancy",
      level: "ask",
      title: "妊娠",
      message: pt.pregnancy ? `カルテに妊娠中${pt.pregnancy.weeks ? `（${pt.pregnancy.weeks}週）` : ""}の印があります。放射線科と相談してください。` : "妊娠の可能性の確認が要ります。",
      choices: ["なし（確認済み）", "可能性あり（放射線科と相談）"].map((a) => ({ label: a, apply: (x: Draft) => ({ ...(x as ImagingDraft), answers: { ...(x as ImagingDraft).answers, pregnancy: a } }) })),
    });
  }
  checkWhen(d, ctx, issues);
  // 重複: same modality and region on the same day
  if (d.modality && d.region && !d.duplicateOk) {
    const day = d.when.day ?? 0;
    const dup = ctx.activeOrders.find((o) => o.order.type === "imaging" && o.order.modality === d.modality && o.order.region === d.region && o.order.when.day === day);
    if (dup) issues.push({ key: "dup", level: "ask", title: "重複", message: `同じ日に同じ検査があります：${ctx.describe(dup)}`, choices: [{ label: "重ねて出す", apply: set<ImagingDraft>({ duplicateOk: true }) }, { label: "この下書きを消す", remove: true }] });
  }
  if (d.modality && d.contrast) {
    const ci = consentIssue(consentFor({ type: "imaging", modality: d.modality, contrast: d.contrast }), ctx, !!d.consentPlanned, (x) => ({ ...(x as ImagingDraft), consentPlanned: true }));
    if (ci) issues.push(ci);
  }
  if (d.acks.length) issues.push({ key: "acks", level: "info", title: "承知", message: d.acks.join("・") });
  return issues;
}

export function checkPhysio(d: PhysioDraft, ctx: CheckContext, pt: ExamPatientFacts | null = null): Issue[] {
  const issues: Issue[] = [];
  const m = d.test ? findPhysio(d.test) : undefined;
  if (!m) {
    const s = d.said.replace(/\s/g, "");
    issues.push({
      key: "test",
      level: d.said ? "stop" : "ask",
      title: "検査",
      message: d.said ? `「${d.said}」は生理検査のマスターにありません。` : "検査が抜けています。",
      choices: PHYSIO.filter((p) => !s || [p.name, ...p.aliases].some((a) => a.includes(s) || s.includes(a)))
        .slice(0, 6)
        .map((p) => ({ label: p.name, apply: set<PhysioDraft>({ test: p.code }) })),
    });
    return issues;
  }
  if (!d.place) {
    issues.push({
      key: "place",
      level: "ask",
      title: "場所",
      message: "検査室かベッドサイドかが抜けています。",
      choices: (m.bedside ? (["検査室", "ベッドサイド"] as const) : (["検査室"] as const)).map((p) => ({ label: p, apply: set<PhysioDraft>({ place: p }) })),
    });
  } else if (d.place === "ベッドサイド" && !m.bedside) {
    issues.push({ key: "place", level: "stop", title: "場所", message: `${m.name}はベッドサイドでは行えません（院内の約束・架空）。` });
  } else if (d.place === "検査室" && !d.transport) {
    issues.push({ key: "transport", level: "ask", title: "移動", message: "移動の方法が抜けています。", choices: (["独歩", "車椅子", "ストレッチャー"] as Transport[]).map((t) => ({ label: t, apply: set<PhysioDraft>({ transport: t }) })) });
  }
  if (m.note) issues.push({ key: "note", level: "info", title: "準備", message: m.note });
  if ((d.test === "PHY-ABI" || d.test === "PHY-SPIRO") && pt && (!pt.heightCm || !pt.weightKg)) {
    issues.push({ key: "body", level: "stop", title: "身長・体重", message: `${m.name}には身長と体重が要ります。カルテに入れてください。` });
  }
  if (d.when.priority === "至急" || d.place === "ベッドサイド") {
    issues.push({ key: "phone", level: "info", title: "連絡", message: "至急・ベッドサイドの生理検査は、生理検査室に電話で伝えます（感染症も）。" });
  }
  checkWhen(d, ctx, issues);
  if (!d.duplicateOk) {
    const day = d.when.day ?? 0;
    const dup = ctx.activeOrders.find((o) => o.order.type === "physio" && o.order.test === d.test && o.order.when.day === day);
    if (dup) issues.push({ key: "dup", level: "ask", title: "重複", message: `同じ日に同じ検査があります：${ctx.describe(dup)}`, choices: [{ label: "重ねて出す", apply: set<PhysioDraft>({ duplicateOk: true }) }, { label: "この下書きを消す", remove: true }] });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface ImagingOrder {
  type: "imaging";
  modality: Modality;
  region: string;
  views?: string[];
  contrast?: Contrast;
  purpose: string;
  when: { day: DayOffset; time?: string; priority: ExamPriority };
  transport: Transport;
  acks?: string[];
  answers?: { metal?: string; pregnancy?: string };
  reading?: Reading;
  comment?: string;
}

export interface PhysioOrder {
  type: "physio";
  test: string;
  purpose: string;
  when: { day: DayOffset; time?: string; priority: ExamPriority };
  place: "検査室" | "ベッドサイド";
  transport?: Transport;
  comment?: string;
}

/** When the study counts as done (no 実施 record in this prototype): its time, or the order time when 至急. */
export function examAt(o: ImagingOrder | PhysioOrder, orderedAbs: number): number {
  if (o.when.priority === "至急" || !o.when.time) return o.when.priority === "至急" ? orderedAbs + 30 : o.when.day * 1440 + minutesOf(EXAM_RULES.open);
  return o.when.day * 1440 + minutesOf(o.when.time);
}

export function toImagingOrder(d: ImagingDraft): ImagingOrder {
  return {
    type: "imaging",
    modality: d.modality!,
    region: d.region!,
    views: d.modality === "ポータブルX線" ? ["臥位正面（AP）"] : (d.views ?? undefined),
    contrast: d.modality === "CT" || d.modality === "MRI" ? d.contrast! : undefined,
    reading: d.reading ?? undefined,
    purpose: d.purpose!,
    when: { day: d.when.day ?? 0, time: d.when.time ?? undefined, priority: d.when.priority! },
    transport: d.modality === "ポータブルX線" ? "病室（ポータブル）" : d.transport!,
    acks: d.acks.length ? d.acks : undefined,
    answers: d.answers.metal || d.answers.pregnancy ? d.answers : undefined,
    comment: d.comment ?? undefined,
  };
}

export function toPhysioOrder(d: PhysioDraft): PhysioOrder {
  return {
    type: "physio",
    test: d.test!,
    purpose: d.purpose!,
    when: { day: d.when.day ?? 0, time: d.when.time ?? undefined, priority: d.when.priority! },
    place: d.place!,
    transport: d.place === "検査室" ? (d.transport ?? undefined) : undefined,
    comment: d.comment ?? undefined,
  };
}

export const emptyImaging = (id: string, modality: Modality | null = null): ImagingDraft => ({
  id,
  origin: "manual",
  sourceText: "（マスターから選択）",
  comment: null,
  kind: "imaging",
  modality,
  region: null,
  regionSaid: "",
  views: null,
  contrast: null,
  transport: modality === "ポータブルX線" ? "病室（ポータブル）" : null,
  answers: {},
  reading: null,
  purpose: null,
  when: { day: null, time: null, priority: null },
  acks: [],
  duplicateOk: false,
});

export const emptyPhysio = (id: string, test: string | null = null): PhysioDraft => ({
  id,
  origin: "manual",
  sourceText: "（マスターから選択）",
  comment: null,
  kind: "physio",
  test,
  said: "",
  place: null,
  transport: null,
  purpose: null,
  when: { day: null, time: null, priority: null },
  acks: [],
  duplicateOk: false,
});
