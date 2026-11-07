// 紹介状（診療情報提供書とその仲間）: one record per letter, as many as needed for one patient. The kind decides
// the fields of the letter (別紙様式11 に沿う) and the fee: 告示（令和8年 医科点数表）B009〜B011 and 留意事項通知
// （令和8年3月5日 保医発0305第6号 別添1）B009〜B011 — only what those texts say, nothing added as a rule.
// The doctor writes the account and answers the fee's conditions; the code gathers the chart's facts, judges the fee
// with its reason, and only a confirmed letter goes into the claim.

import { addDays, type CalendarDate } from "./dates";
import { HOSPITAL } from "./billing/facility";
import { facilityByName, type LetterLike } from "./liaison";
import { formatAddress, type PatientContacts } from "./patient-contacts";
import { collectFacts, type DischargeDraft } from "./discharge";
import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { labPasteText } from "./lab-paste";
import { orderLines } from "./format";
import { dischargeLeave } from "./rx";
import type { DayOffset, HistoryEntry, OrderEntry, Patient } from "./types";

export type LetterType = "紹介" | "返書" | "照会" | "介護施設" | "保健福祉" | "歯科" | "セカンドオピニオン";
export type LetterField = "diagnosis" | "history" | "question" | "result" | "findings" | "treatment" | "plan" | "care" | "medication" | "remarks";
export type Stamp = { day: DayOffset; time: string };

/** 相手の区分（留意事項 B011 (1) ア〜ウ の、自院でない側）. */
export type Partner = "大病院" | "中小" | "難病" | "産科" | "その他";
export const PARTNERS: { key: Partner; label: string }[] = [
  { key: "大病院", label: "特定機能病院・地域医療支援病院・400床以上など" },
  { key: "中小", label: "診療所・200床未満の病院" },
  { key: "難病", label: "難病・てんかんの専門の医療機関" },
  { key: "産科", label: "産科・産婦人科" },
  { key: "その他", label: "その他・分からない" },
];
export type PatientKind = "難病・てんかん" | "妊娠中" | "どちらでもない";

/** The answers to a fee's conditions (each one asked only for the kinds whose fee needs it). */
export interface LetterFlags {
  /** 患者の同意を得た（B009 注1・注2・注5、B010-2 注1、B011 注1〜注5）. */
  consent?: boolean;
  /** 退院後の治療計画・検査結果・画像の情報を添付（B009 注8、B010）. */
  attach?: boolean;
  /** 自宅に帰る（B009 注2：留意事項 (12)）. */
  home?: boolean;
  /** 介護支援等連携指導料を算定した（退院前の B009 注2 は算定できない：留意事項 (12)）. */
  kaigoShien?: boolean;
  /** 相手からの求め（B010-2）・求め又は共同で治療管理する合意（B011）. */
  request?: boolean;
  /** B011: 相手の区分と患者の区分、相手が B011 の施設基準を満たすか（注3・注5）. */
  partner?: Partner;
  patientKind?: PatientKind;
  partnerStandard?: boolean;
  /** 患者・家族からの希望（申し出）があった（B010：留意事項 (3)）. */
  wish?: boolean;
}

export interface LetterContent {
  type: LetterType;
  /** 医療機関・施設・事業所の名称. */
  to: string;
  dept: string;
  /** 先生（または担当者）のお名前. */
  doctor: string;
  purpose: string;
  body: Partial<Record<LetterField, string>>;
  flags: LetterFlags;
}

/** An earlier confirmed version of a corrected letter (the fields of the letter are the latest one). */
export interface LetterVersion extends LetterContent {
  at: Stamp;
  by: string;
  /** Why it was corrected (absent for the first version). */
  reason?: string;
}

export interface Letter extends LetterContent {
  id: string;
  patientId: string;
  status: "下書き" | "確定";
  createdBy: string;
  createdAt: Stamp;
  /** The first confirmation: the day the letter was issued (the day of the fee). */
  confirmedAt?: Stamp;
  confirmedBy?: string;
  /** The last correction of a confirmed letter, with its reason. */
  revised?: { at: Stamp; by: string; reason: string };
  versions?: LetterVersion[];
  /** 退院日（予定を含む）as the chart had it when the letter was saved (B009 注2・注8). */
  dischargeDay?: DayOffset;
  /** Where it was started from. */
  from?: "退院サマリ" | "他科依頼";
  /** A letter issued from the 退院サマリ before this tool (kept readable, billed once). */
  legacy?: boolean;
}

/** Kinds written to a 医療機関 (the others go to a 施設・事業所 or through the patient). */
export const MEDICAL: readonly LetterType[] = ["紹介", "返書", "照会", "歯科", "セカンドオピニオン"];

export const LETTER_TYPES: { type: LetterType; tab: string; title: string; to: string; purpose: string; fields: [LetterField, string][] }[] = [
  {
    type: "紹介", tab: "紹介", title: "診療情報提供書", to: "紹介先の医療機関", purpose: "紹介目的",
    fields: [["diagnosis", "傷病名"], ["history", "既往歴・家族歴"], ["findings", "症状経過・検査結果"], ["treatment", "治療経過"], ["medication", "現在の処方"], ["remarks", "備考"]],
  },
  {
    type: "返書", tab: "返書", title: "診療情報提供書（ご報告）", to: "紹介元の医療機関", purpose: "ご紹介いただいた件",
    fields: [["diagnosis", "傷病名"], ["result", "ご紹介いただいた件の結果"], ["findings", "症状経過・検査結果"], ["plan", "今後の方針・患者への指導"], ["medication", "現在の処方"], ["remarks", "備考"]],
  },
  {
    type: "照会", tab: "照会", title: "診療情報提供のお願い", to: "照会先の医療機関", purpose: "照会の目的",
    fields: [["diagnosis", "傷病名"], ["question", "お尋ねしたいこと"], ["findings", "症状経過・検査結果"], ["medication", "現在の処方"], ["remarks", "備考"]],
  },
  {
    type: "介護施設", tab: "老健・介護医療院", title: "診療情報提供書", to: "施設の名称", purpose: "紹介目的",
    fields: [["diagnosis", "傷病名"], ["history", "既往歴・家族歴"], ["findings", "症状経過・検査結果"], ["treatment", "治療経過"], ["medication", "現在の処方"], ["care", "介護上の注意"], ["remarks", "備考"]],
  },
  {
    type: "保健福祉", tab: "市町村・居宅", title: "診療情報提供書", to: "市町村・事業所の名称", purpose: "情報提供の目的",
    fields: [["diagnosis", "傷病名"], ["findings", "症状経過"], ["treatment", "治療経過"], ["medication", "現在の処方"], ["care", "家庭の状況・必要なサービス"], ["remarks", "備考"]],
  },
  {
    type: "歯科", tab: "歯科", title: "診療情報提供書", to: "歯科医療機関", purpose: "歯科からのお尋ね",
    fields: [["diagnosis", "傷病名"], ["findings", "検査結果"], ["medication", "投薬内容"], ["remarks", "備考"]],
  },
  {
    type: "セカンドオピニオン", tab: "セカンドオピニオン", title: "診療情報提供書（セカンドオピニオン）", to: "意見を求める医療機関", purpose: "ご意見を伺いたいこと",
    fields: [["diagnosis", "傷病名"], ["findings", "症状経過・検査結果"], ["treatment", "治療経過"], ["plan", "治療計画"], ["medication", "現在の処方"], ["remarks", "備考"]],
  },
];
export const letterKind = (t: LetterType) => LETTER_TYPES.find((k) => k.type === t)!;

/** The first line of the letter (after the address). */
export const GREETING: Record<LetterType, string> = {
  紹介: "平素より大変お世話になっております。下記の患者さんをご紹介いたします。ご高診のほど、よろしくお願い申し上げます。",
  返書: "このたびは患者さんをご紹介いただき、ありがとうございました。下記のとおりご報告いたします。",
  照会: "下記の患者さんについて、診療情報のご提供をお願い申し上げます。",
  介護施設: "下記の患者さんについて、診療の状況をお知らせいたします。よろしくお願い申し上げます。",
  保健福祉: "下記の患者さんについて、保健福祉サービスに必要な情報をお知らせいたします。",
  歯科: "お尋ねの件について、下記のとおり診療情報を提供いたします。",
  セカンドオピニオン: "下記の患者さんについて、治療法の選択に関するご意見を伺いたく、診療情報を提供いたします。",
};

/** Kinds a role may draft without being a doctor: the 介護・福祉 letters, by those who do 退院支援 (roles.ts assess.discharge). */
export const WELFARE: readonly LetterType[] = ["介護施設", "保健福祉"];

/** 「【紹介状】架空みどり病院 循環器内科（紹介）」 — the line of the record and the list. */
export const letterTitle = (l: Pick<LetterContent, "to" | "dept" | "type">) => `${[l.to.trim() || "（宛先なし）", l.dept.trim()].filter(Boolean).join(" ")}（${letterKind(l.type).tab}）`;

// ---------------------------------------------------------------------------
// The chart's facts in the fields (code; the doctor writes the account around them)
// ---------------------------------------------------------------------------

export interface LetterChart {
  patient: Patient;
  entries: HistoryEntry[];
  diagnoses: Diagnosis[];
  today: CalendarDate;
  /** The 退院時サマリー (its 経過 and 方針 go into a letter started from it). */
  discharge?: DischargeDraft;
}

/**
 * 退院日 as the chart has it: discharged, then the 退院 order, then a confirmed 退院時サマリー (its 退院日 starts as today
 * until the doctor sets it, so a summary still being written does not count).
 */
export function chartDischargeDay(c: Pick<LetterChart, "patient" | "entries" | "discharge">): DayOffset | undefined {
  if (c.patient.dischargedAt) return c.patient.dischargedAt.day;
  const leave = dischargeLeave({ drafts: [], activeOrders: c.entries.filter((e): e is OrderEntry => e.kind === "order") });
  return leave?.from.day ?? (c.discharge?.status === "確定" ? c.discharge.dischargeDay : undefined);
}

const list = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((x) => `・${x}`).join("\n")}` : "");

/** The fields the code fills from the chart: 病名・最新の検査・注射・処方・アレルギー（and the summary's own text when started from it）. */
export function chartFields(c: LetterChart): Partial<Record<LetterField, string>> {
  const orders = c.entries.filter((e): e is OrderEntry => e.kind === "order");
  const facts = collectFacts(c.patient, orders, c.diagnoses, c.today, 0);
  const dx = c.diagnoses.filter((d) => d.outcome === "継続" || d.main).map((d) => `${diagnosisLabel(d)}${d.main ? "（主）" : ""}`);
  const labs = labPasteText(c.patient, c.today);
  const course = c.discharge?.sections.course.trim();
  const plan = c.discharge?.sections.plan.trim();
  return {
    diagnosis: (dx.length ? dx : [c.patient.admissionDiagnosis]).join("\n"),
    findings: labs ?? "",
    treatment: [course, list("注射", facts.injections)].filter(Boolean).join("\n\n"),
    plan: plan ?? "",
    medication: [list("内服", [...facts.prescriptions, ...facts.continuingPrescriptions]), list("注射（有効）", orders.filter((e) => e.status === "有効" && e.order.type === "injection").map((e) => orderLines(e.order, c.today).main))].filter(Boolean).join("\n") || "なし",
    remarks: [`アレルギー・薬剤禁忌：${c.patient.allergies.join("、") || "なし"}`, c.patient.infections.length ? `感染症：${c.patient.infections.join("、")}` : ""].filter(Boolean).join("\n"),
  };
}

/** What a letter started from another screen comes with (退院サマリ: 紹介 with 注8's 添付; 他科依頼: 宛先と目的). */
export type LetterSeed = Partial<Pick<Letter, "to" | "dept" | "doctor" | "purpose" | "from">> & { type?: LetterType; flags?: LetterFlags; /** Text written elsewhere, put before the chart's facts in 症状経過・検査結果. */ note?: string };

/** From the 退院時サマリー: 紹介 with 注8's 添付 marked, to the summary's 退院先 (or the address written there before). */
export const dischargeSeed = (d: DischargeDraft): LetterSeed => ({ type: "紹介", to: d.letter.to || d.destination, dept: d.letter.dept, doctor: d.letter.doctor, purpose: d.letter.purpose, flags: { attach: true }, from: "退院サマリ" });

/** From 他科依頼「院外へ紹介」: the address, and the text written there (one line as the 目的, more lines into 症状経過). */
export const consultSeed = (to: string, dept: string, text: string): LetterSeed => {
  const t = text.trim();
  return { type: "紹介", to, dept, ...(t.includes("\n") ? { note: t } : { purpose: t }), from: "他科依頼" };
};

/** A new letter (not saved yet) with the chart's facts in its fields. */
export function newLetter(id: string, c: LetterChart, type: LetterType, by: string, at: Stamp, seed: LetterSeed = {}): Letter {
  const body = chartFields(c);
  if (seed.note) body.findings = [seed.note, body.findings].filter(Boolean).join("\n\n");
  return {
    id, patientId: c.patient.id, type, to: seed.to ?? "", dept: seed.dept ?? "", doctor: seed.doctor ?? "", purpose: seed.purpose ?? "",
    body, flags: seed.flags ?? {}, status: "下書き", createdBy: by, createdAt: at, dischargeDay: chartDischargeDay(c),
    ...(seed.from ? { from: seed.from } : {}),
  };
}

/** Only the kind's own fields are kept. */
export const pruneBody = (l: LetterContent): LetterContent["body"] => Object.fromEntries(letterKind(l.type).fields.map(([k]) => [k, l.body[k] ?? ""]));

const contentOf = (l: LetterContent): LetterContent => ({ type: l.type, to: l.to, dept: l.dept, doctor: l.doctor, purpose: l.purpose, body: l.body, flags: l.flags });

/** 下書きを保存. */
export const saveDraft = (l: Letter): Letter => ({ ...l, body: pruneBody(l), status: "下書き" });

/** 確定して保存: the first time issues the letter; later, a correction with its reason (the earlier version is kept). */
export function confirmLetter(l: Letter, saved: Letter | undefined, by: string, at: Stamp, reason = ""): Letter {
  const next = { ...l, body: pruneBody(l) };
  if (!saved || saved.status !== "確定") return { ...next, status: "確定", confirmedAt: at, confirmedBy: by };
  const prev: LetterVersion = { ...contentOf(saved), at: saved.revised?.at ?? saved.confirmedAt!, by: saved.revised?.by ?? saved.confirmedBy!, ...(saved.revised ? { reason: saved.revised.reason } : {}) };
  return { ...next, status: "確定", confirmedAt: saved.confirmedAt, confirmedBy: saved.confirmedBy, revised: { at, by, reason: reason.trim() }, versions: [...(saved.versions ?? []), prev] };
}

/** 第N版. */
export const versionNo = (l: Letter) => (l.versions?.length ?? 0) + 1;

/** Whether the role may save a draft of this kind, and confirm it (roles.ts: discharge = 医師; assess.discharge = MSW・看護師). */
export function letterRights(can: (a: "discharge" | "assess.discharge") => boolean, type: LetterType) {
  const doctor = can("discharge");
  return { draft: doctor || (WELFARE.includes(type) && can("assess.discharge")), confirm: doctor };
}

// ---------------------------------------------------------------------------
// The letters of a patient, with the one the old 退院サマリ issued
// ---------------------------------------------------------------------------

export const legacyId = (patientId: string) => `discharge:${patientId}`;

/** The letter the 退院サマリ issued before this tool, as one letter (紹介; 同意 as that screen put it into the claim). */
export function legacyLetter(d: DischargeDraft | undefined): Letter | null {
  if (!d?.letter.issuedAt) return null;
  return {
    id: legacyId(d.patientId), patientId: d.patientId, type: "紹介", to: d.letter.to, dept: d.letter.dept, doctor: d.letter.doctor, purpose: d.letter.purpose,
    body: { treatment: d.sections.course, plan: d.sections.plan }, flags: { consent: true, attach: !!d.letter.attach },
    status: "確定", createdBy: d.confirmedBy ?? "", createdAt: d.letter.issuedAt, confirmedAt: d.letter.issuedAt, confirmedBy: d.confirmedBy ?? "", dischargeDay: d.dischargeDay, from: "退院サマリ", legacy: true,
  };
}

/** One patient's letters, newest first: the saved ones and, once (by its id), the one the old 退院サマリ issued. */
export function lettersFor(patientId: string, saved: Letter[], discharge?: DischargeDraft): Letter[] {
  const mine = saved.filter((l) => l.patientId === patientId);
  const old = legacyLetter(discharge);
  const all = old && !mine.some((l) => l.id === old.id) ? [...mine, old] : mine;
  const at = (l: Letter) => (l.confirmedAt ?? l.createdAt);
  return [...all].sort((a, b) => at(b).day - at(a).day || at(b).time.localeCompare(at(a).time));
}

// ---------------------------------------------------------------------------
// The fee of each letter（告示 B009〜B011・留意事項通知 B009〜B011）
// ---------------------------------------------------------------------------

/** 架空の病院の設定: 許可病床 134床（200床未満の病院）. B011 の施設基準は満たさない（届け出ていない）, 難病・てんかんの専門の外来も産科・産婦人科もない. */
export const LETTER_HOSPITAL = { small: HOSPITAL.beds.general < 200, b011Standard: false, nanbyo: false, obstetrics: false };
export type LetterHospital = typeof LETTER_HOSPITAL;

/** 点数 of the master codes (医科診療行為マスター; a test checks them against the master). */
export const LETTER_FEES = {
  B009: { code: "180016110", points: 250, name: "B009 診療情報提供料（Ⅰ）" },
  B009_8: { code: "113009470", points: 200, name: "注8 退院時診療状況添付加算" },
  B010: { code: "113009510", points: 500, name: "B010 診療情報提供料（Ⅱ）" },
  B010_2: { code: "113028710", points: 120, name: "B010-2 診療情報連携共有料" },
  B011: { code: "113032310", points: 150, name: "B011 連携強化診療情報提供料" },
} as const;

/** Where each kind's rule is written. */
export const LETTER_CITES: Record<LetterType, string> = {
  紹介: "告示 B009 注1・注8、留意事項 B009 (2)(4)(21)",
  介護施設: "告示 B009 注5・注8、留意事項 B009 (4)(14)(21)",
  保健福祉: "告示 B009 注2、留意事項 B009 (4)(11)(12)",
  返書: "告示 B009 注1（紹介）、B011 注1〜注6、留意事項 B011 (1)(6)(7)",
  照会: "告示 B009〜B011（いずれも情報を提供した側の点数）",
  歯科: "告示 B010-2 注1・注2、留意事項 B010-2 (1)(4)",
  セカンドオピニオン: "告示 B010、留意事項 B010 (1)(3)",
};

/** A confirmed letter as the claim reads it. Without `type`/`flags`: a letter of the old 退院サマリ (紹介, put into the claim on issue). */
export interface LetterClaim {
  id?: string;
  day: DayOffset;
  time?: string;
  to: string;
  type?: LetterType;
  flags?: LetterFlags;
  dischargeDay?: DayOffset;
  attach?: boolean;
}

export interface LetterVerdict {
  /** Master codes billed (none = 算定なし). */
  codes: string[];
  points: number;
  /** 「B009 250点＋注8 200点」 */
  fee: string;
  /** 「紹介先ごとに月1回」 */
  limit: string;
  /** What the limit leaves free now (「今月この宛先は未算定」). */
  free: string;
  /** The claim's basis line. */
  basis: string;
  /** Why not (算定なし), or why the 加算 is not added. */
  reason?: string;
  note8?: string;
  cite: string;
  reviews: string[];
}

/** The claim input of the letters that count: confirmed, with the chart's 退院日. */
export const claimLetters = (letters: Letter[]): LetterClaim[] =>
  letters.filter((l) => l.status === "確定" && l.confirmedAt).map((l) => ({ id: l.id, day: l.confirmedAt!.day, time: l.confirmedAt!.time, to: l.to, type: l.type, flags: l.flags, dischargeDay: l.dischargeDay }));

const facilityKey = (s: string) => s.normalize("NFKC").replace(/\s+/g, "") || "（宛先なし）";

/**
 * The fee of each letter, in the order they were issued. 紹介・介護施設・保健福祉 (B009) and セカンドオピニオン (B010) first,
 * then 歯科 (B010-2) and 返書 (B011), which are not billed in a month with a B009 紹介 to the same 医療機関.
 * 月 and 3月 are calendar months (3月に1回: not in the month of the last one nor the two after it).
 */
export function judgeLetters(input: LetterClaim[], today: CalendarDate, opts: { dischargedOn?: DayOffset; inpatient?: boolean; hospital?: LetterHospital } = {}): Map<string, LetterVerdict> {
  const H = opts.hospital ?? LETTER_HOSPITAL;
  const inpatient = opts.inpatient ?? true;
  const items = input.map((l, i) => ({ ...l, id: l.id ?? `#${i}`, time: l.time ?? "00:00", type: l.type ?? ("紹介" as LetterType), flags: l.flags ?? { consent: true, attach: l.attach } }));
  items.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const date = (day: DayOffset) => addDays(today, day);
  const month = (day: DayOffset) => { const c = date(day); return c.y * 12 + c.m - 1; };
  const out = new Map<string, LetterVerdict>();
  const billed: { type: LetterType; fac: string; month: number; day: DayOffset; note8?: boolean }[] = [];
  const none = (l: (typeof items)[number], reason: string): LetterVerdict => ({ codes: [], points: 0, fee: "", limit: "", free: "", basis: "", reason, cite: LETTER_CITES[l.type], reviews: [] });
  const related = (to: string) => !!facilityByName(to)?.related;

  const b009 = (l: (typeof items)[number]): LetterVerdict => {
    const f = l.flags, m = month(l.day), fac = facilityKey(l.to);
    const dischargeDay = opts.dischargedOn ?? l.dischargeDay;
    if (related(l.to)) return none(l, "相手が当院と特別の関係にある機関");
    if (!f.consent) return none(l, "患者の同意の記録がない");
    let limit: string, free: string;
    if (l.type === "紹介") {
      if (billed.some((b) => b.type === "紹介" && b.fac === fac && b.month === m)) return none(l, "今月この宛先へもう算定した（紹介先ごとに月1回）");
      limit = "紹介先ごとに月1回"; free = "今月この宛先は未算定";
    } else {
      if (l.type === "保健福祉") {
        if (!f.home) return none(l, "自宅に帰る患者だけが対象");
        if (inpatient) {
          if (dischargeDay === undefined) return none(l, "退院日が決まっていない（退院日の前後2週間だけ）");
          if (Math.abs(l.day - dischargeDay) > 14) return none(l, "退院日の前後2週間の外");
          if (l.day < dischargeDay && f.kaigoShien) return none(l, "退院前で、介護支援等連携指導料を算定した");
        }
      }
      if (billed.some((b) => b.type === l.type && b.month === m)) return none(l, "今月もう算定した（患者1人につき月1回）");
      limit = "患者1人につき月1回"; free = "今月は未算定";
    }
    billed.push({ type: l.type, fac, month: m, day: l.day });
    const v: LetterVerdict = { codes: [LETTER_FEES.B009.code], points: LETTER_FEES.B009.points, fee: `B009 ${LETTER_FEES.B009.points}点`, limit, free, basis: `${LETTER_FEES.B009.name}（${l.to.trim() || "宛先なし"} へ。${l.type === "紹介" ? "注1" : l.type === "介護施設" ? "注5" : "注2"}・${limit}）`, cite: LETTER_CITES[l.type], reviews: [] };
    // 注8: 退院の月かその翌月、治療計画・検査結果・画像を添付して 紹介（別の保険医療機関・介護老人保健施設・介護医療院へ）.
    if (l.type !== "保健福祉" && f.attach) {
      const why = (() => {
        if (dischargeDay === undefined) return "退院日が決まっていない";
        const months = m - month(dischargeDay);
        if (months !== 0 && months !== 1) return "退院の月かその翌月ではない";
        if (l.type === "介護施設") {
          const d = date(l.day);
          const earlier = billed.find((b) => b.type === "介護施設" && b.note8 && b.day < l.day && (() => { const e = date(b.day); const diff = d.y * 12 + d.m - (e.y * 12 + e.m); return diff < 6 || (diff === 6 && d.d < e.d); })());
          if (earlier) return "介護老人保健施設・介護医療院への加算から6か月の間";
        }
        return null;
      })();
      if (why) v.note8 = `注8 なし：${why}`;
      else {
        billed[billed.length - 1].note8 = true;
        v.codes.push(LETTER_FEES.B009_8.code);
        v.points += LETTER_FEES.B009_8.points;
        v.fee += `＋注8 ${LETTER_FEES.B009_8.points}点`;
        v.basis += "＋注8 退院時診療状況添付加算（退院の月かその翌月、治療計画・検査結果・画像を添付）";
        if (l.day < dischargeDay!) v.reviews.push("退院時診療状況添付加算は退院する患者の紹介に付きます。退院日より前に発行しているので、退院が決まっているか確かめてください。");
      }
    }
    return v;
  };

  const b010 = (l: (typeof items)[number]): LetterVerdict => {
    const m = month(l.day);
    if (!l.flags.wish) return none(l, "患者・家族の希望（申し出）の記録がない");
    if (!l.flags.attach) return none(l, "治療計画・検査結果・画像の添付がない");
    if (billed.some((b) => b.type === "セカンドオピニオン" && b.month === m)) return none(l, "今月もう算定した（患者1人につき月1回）");
    billed.push({ type: l.type, fac: facilityKey(l.to), month: m, day: l.day });
    return { codes: [LETTER_FEES.B010.code], points: LETTER_FEES.B010.points, fee: `B010 ${LETTER_FEES.B010.points}点`, limit: "患者1人につき月1回", free: "今月は未算定", basis: `${LETTER_FEES.B010.name}（患者・家族の希望により患者に交付。患者1人につき月1回）`, cite: LETTER_CITES[l.type], reviews: [] };
  };

  // 提供先ごとに3月に1回, and not in a month with a B009 紹介 to the same 医療機関.
  const window3 = (l: (typeof items)[number], kind: LetterType, label: string): string | null => {
    const m = month(l.day), fac = facilityKey(l.to);
    if (billed.some((b) => b.type === "紹介" && b.fac === fac && b.month === m)) return `今月この宛先へ B009（紹介）を算定した（${label}は同じ月に算定できない）`;
    if (billed.some((b) => b.type === kind && b.fac === fac && m - b.month < 3)) return "この宛先へ3か月の間にもう算定した（提供先ごとに3月に1回）";
    return null;
  };

  const b010_2 = (l: (typeof items)[number]): LetterVerdict => {
    if (!l.flags.request) return none(l, "歯科からの求めの記録がない");
    if (!l.flags.consent) return none(l, "患者の同意の記録がない");
    const no = window3(l, "歯科", "B010-2");
    if (no) return none(l, no);
    billed.push({ type: l.type, fac: facilityKey(l.to), month: month(l.day), day: l.day });
    return { codes: [LETTER_FEES.B010_2.code], points: LETTER_FEES.B010_2.points, fee: `B010-2 ${LETTER_FEES.B010_2.points}点`, limit: "提供先ごとに3月に1回", free: "この3か月この宛先は未算定", basis: `${LETTER_FEES.B010_2.name}（${l.to.trim() || "宛先なし"} の求めに応じて。提供先ごとに3月に1回）`, cite: LETTER_CITES[l.type], reviews: [] };
  };

  const b011 = (l: (typeof items)[number]): LetterVerdict => {
    const f = l.flags;
    const not = (why: string) => none(l, `返書は紹介ではない（B009 なし）。B011 は${why}`);
    if (!f.request) return not("相手の求め・共同で治療管理する合意の記録がない");
    if (!f.consent) return not("患者の同意の記録がない");
    if (related(l.to)) return not("相手が当院と特別の関係にある機関");
    // 留意事項 (1) ア〜ウ: which pair the two are, and the 告示's 注 for it.
    const p = f.partner;
    // ア 診療所・200床未満の病院 ⇔ 特定機能病院など、イ 難病・てんかんの専門 ⇔ その他、ウ 産科・産婦人科 ⇔ その他.
    const pairA = H.small ? p === "大病院" : p === "中小";
    const pairB = H.nanbyo ? !!p && p !== "難病" : p === "難病";
    const pairC = H.obstetrics ? !!p && p !== "産科" : p === "産科";
    let note: string;
    if (pairA) {
      if (!H.b011Standard) return not("自院が施設基準を満たさない");
      note = "注1";
    } else if (pairB || pairC) {
      const need: PatientKind = pairB ? "難病・てんかん" : "妊娠中";
      if (f.patientKind !== need) return not(`患者が${need === "妊娠中" ? "妊娠中" : "指定難病・てんかん（疑いを含む）"}でない`);
      if (H.b011Standard) note = pairB ? "注2" : "注4";
      else if (f.partnerStandard) note = pairB ? "注3" : "注5";
      else return not("自院も相手も施設基準を満たす答えがない");
    } else return not(p ? "相手との組み合わせが連携の区分（ア〜ウ）に当たらない" : "相手の区分が未選択");
    const no = window3(l, "返書", "B011");
    if (no) return not(no);
    billed.push({ type: l.type, fac: facilityKey(l.to), month: month(l.day), day: l.day });
    return { codes: [LETTER_FEES.B011.code], points: LETTER_FEES.B011.points, fee: `B011 ${LETTER_FEES.B011.points}点`, limit: "提供先ごとに3月に1回", free: "この3か月この宛先は未算定", basis: `${LETTER_FEES.B011.name}（${l.to.trim() || "宛先なし"} へ。${note}・提供先ごとに3月に1回）`, cite: LETTER_CITES[l.type], reviews: [] };
  };

  for (const l of items) {
    if (l.type === "紹介" || l.type === "介護施設" || l.type === "保健福祉") out.set(l.id, b009(l));
    else if (l.type === "セカンドオピニオン") out.set(l.id, b010(l));
  }
  for (const l of items) {
    if (l.type === "歯科") out.set(l.id, b010_2(l));
    else if (l.type === "返書") out.set(l.id, b011(l));
    else if (l.type === "照会") out.set(l.id, none(l, "照会（提供のお願い）には点数がない（点数は情報を提供した側）"));
  }
  return out;
}

/** The fee of a letter now: a draft as if confirmed now, among the confirmed ones. */
export function letterVerdict(l: Letter, all: Letter[], today: CalendarDate, now: Stamp, opts: { dischargedOn?: DayOffset; inpatient?: boolean } = {}): LetterVerdict {
  const others = claimLetters(all.filter((x) => x.id !== l.id));
  const self: LetterClaim = l.status === "確定" && l.confirmedAt ? claimLetters([l])[0] : { id: l.id, day: now.day, time: now.time, to: l.to, type: l.type, flags: l.flags, dischargeDay: l.dischargeDay };
  return judgeLetters([...others, self], today, opts).get(l.id)!;
}

/** 「B009 250点・紹介先ごとに月1回（今月この宛先は未算定）」 or 「算定なし：…」. */
export function verdictLine(v: LetterVerdict, confirmed: boolean): string {
  if (!v.codes.length) return `算定なし：${v.reason}`;
  return `${v.fee}・${v.limit}${confirmed ? "" : `（${v.free}）`}${v.note8 ? `／${v.note8}` : ""}`;
}

/** 地域医療連携の台帳: confirmed 紹介 to a 医療機関 = 逆紹介 (one row per letter, the old 退院サマリ's included once). */
export function ledgerLetters(saved: Letter[], discharges: Record<string, DischargeDraft>, find: (id: string) => Pick<Patient, "name" | "kana" | "department" | "attending"> | undefined): LetterLike[] {
  const ids = [...new Set([...Object.keys(discharges), ...saved.map((l) => l.patientId)])];
  return ids.flatMap((pid) => {
    const p = find(pid);
    if (!p) return [];
    return lettersFor(pid, saved, discharges[pid])
      .filter((l) => l.status === "確定" && l.type === "紹介" && l.confirmedAt)
      .map((l) => ({ id: l.id, patientId: pid, name: p.name, kana: p.kana, department: p.department, doctor: l.confirmedBy || p.attending, to: l.to, purpose: l.purpose, issuedDay: l.confirmedAt!.day }));
  });
}

/** Saving a letter: the same id is replaced in place, a new one is added. */
export const upsertLetter = (all: Letter[], l: Letter): Letter[] => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [...all, l]);

/** 患者の住所・電話 for the letter (患者基本情報). */
export const letterContact = (c?: Pick<PatientContacts, "address" | "phones">): string | undefined => {
  if (!c) return undefined;
  const text = [formatAddress(c.address), c.phones.home || c.phones.mobile].filter(Boolean).join("　");
  return text || undefined;
};
