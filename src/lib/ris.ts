import type { ExecutionCancellation } from "./mar";
// 放射線部（RIS：放射線情報システム）of the fictional hospital: the imaging orders doctors gave (exams.ts) are
// taken in (受付), given a room and a device (撮影室・装置の割り当て), done (撮影済み), written in the 照射録
// (診療放射線技師法 第28条・施行規則 第16条) with the dose and the contrast medium used, read by a radiologist
// (読影レポート), and read by the ordering doctor (既読). The 照射録 is signed by the doctor who gave the order.
// What is due, the state, what the 照射録 still lacks, the dose compared with the national DRL and what goes to
// the claim are code; the technologist and the doctors decide and write. No device is connected: the modality
// in this app is a simulation (模擬, ris-modality.ts / dicom-mwl.ts).

import { addDays, formatShort, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { consentText, examAt, regionLabel, usesContrast, viewsText, type ImagingOrder, type Modality } from "./exams";
import { imagingMethodText, imagingTitle } from "./format";
import type { ResultItem } from "./results";
import type { DayOffset, ExamRecord, HistoryEntry, OrderEntry, Patient, Sex } from "./types";

export interface Moment {
  day: DayOffset;
  time: string;
}
export interface Stamp extends Moment {
  by: string;
}

/** How a step was recorded: by the simulated modality (MPPS・C-STORE の模擬) or typed in by the technologist. */
export type Via = "模擬装置" | "手入力";

// ---------------------------------------------------------------------------
// 撮影室と装置
// ---------------------------------------------------------------------------

export type RoomKey = "XR1" | "PORT" | "CT1" | "MR1";

export interface RisRoom {
  key: RoomKey;
  room: string;
  device: string;
  /** DICOM の AE タイトル（Application Entity Title。16文字まで）. */
  ae: string;
  /** Scheduled Station Name (0040,0010)（16文字まで）. */
  station: string;
  /** DICOM の Modality (0008,0060) に入れる値. */
  dicom: "DX" | "CT" | "MR";
  handles: Modality[];
  /** Scheduled Procedure Step Location (0040,0011). */
  location: string;
}

/** The rooms and devices of the fictional hospital (架空). The CT and MRI match the facility's billing (16列以上64列未満・1.5テスラ以上3テスラ未満). */
export const RIS_ROOMS: RisRoom[] = [
  { key: "XR1", room: "一般撮影室1", device: "一般撮影装置（FPD）1号機", ae: "SK_DR1", station: "DR1", dicom: "DX", handles: ["X線"], location: "RAD-XR1" },
  { key: "PORT", room: "病棟（回診用）", device: "回診用X線撮影装置", ae: "SK_PORTA", station: "PORTA", dicom: "DX", handles: ["ポータブルX線"], location: "WARD" },
  { key: "CT1", room: "CT室", device: "マルチスライスCT（32列）", ae: "SK_CT1", station: "CT1", dicom: "CT", handles: ["CT"], location: "RAD-CT1" },
  { key: "MR1", room: "MRI室", device: "MRI装置（1.5テスラ）", ae: "SK_MR1", station: "MR1", dicom: "MR", handles: ["MRI"], location: "RAD-MR1" },
];

export const findRoom = (k: RoomKey | undefined) => RIS_ROOMS.find((r) => r.key === k);
export const roomsFor = (m: Modality) => RIS_ROOMS.filter((r) => r.handles.includes(m));
export const defaultRoom = (m: Modality): RoomKey => roomsFor(m)[0].key;

export const RIS_RULES = {
  rooms: "",
  reading: "読影は放射線科医（医師）が行い、確定した読影レポートは、オーダした医師のカルテの「未確認の結果」に出ます。X線で「読影不要」のオーダは読影の依頼を作りません。",
  sign: "照射録は、照射について指示をした医師の署名を受けます（診療放射線技師法 第28条）。この試作では、オーダした医師がカルテか放射線部の画面で「署名」を押します。",
  contrast: "造影剤は、この病院の採用品から選びます。使った本数は算定（画像診断の薬剤料 E300）に入ります。",
};

// ---------------------------------------------------------------------------
// 出典
// ---------------------------------------------------------------------------

export const RIS_SOURCES = {
  law: { label: "診療放射線技師法（昭和26年法律第226号）第28条（照射録）", url: "https://laws.e-gov.go.jp/law/326AC0100000226" },
  rule: { label: "診療放射線技師法施行規則（昭和26年厚生省令第33号）第16条（照射録に記載する事項）", url: "https://laws.e-gov.go.jp/law/326M50000100033" },
  dose: {
    label: "医療法施行規則の一部を改正する省令の施行等について（平成31年3月12日 厚生労働省医政局長通知）第2 4 (1)(2)：全身用X線CT診断装置などの線量の管理と記録。照射録に被ばく線量を記録していれば線量記録にできる",
    url: "https://www.ajha.or.jp/topics/admininfo/pdf/2019/190318_4.pdf",
  },
  drl: { label: "日本の診断参考レベル（2025年版）Japan DRLs 2025（医療被ばく研究情報ネットワーク J-RIME ほか、令和7年7月7日）3.1.1 成人 CT・3.2 一般撮影", url: "https://j-rime.qst.go.jp/report/JapanDRLs2025_ja.pdf" },
  e300: { label: "診療報酬の算定方法 別表第一 医科診療報酬点数表（令和8年）E300 薬剤（薬価が15円を超える場合は、15円を引いて10円で割り、1点未満を切り上げて1点を足す。15円以下は算定しない）", url: "https://www.mhlw.go.jp/content/12400000/001686842.pdf" },
};

// ---------------------------------------------------------------------------
// 造影剤（架空の病院の採用品。コードと薬価は厚生労働省の医薬品マスターのもの）
// ---------------------------------------------------------------------------

export interface ContrastProduct {
  /** 医薬品マスターのコード（9桁）. */
  code: string;
  name: string;
  kind: "ヨード" | "ガドリニウム";
  unit: string;
}

export const CONTRAST_PRODUCTS: ContrastProduct[] = [
  { code: "620003689", name: "イオパミロン注３００シリンジ　６１．２４％１００ｍＬ", kind: "ヨード", unit: "筒" },
  { code: "620003688", name: "イオパミロン注３００シリンジ　６１．２４％８０ｍＬ", kind: "ヨード", unit: "筒" },
  { code: "621464301", name: "プロハンス静注シリンジ１３ｍＬ", kind: "ガドリニウム", unit: "筒" },
  { code: "621464401", name: "プロハンス静注シリンジ１７ｍＬ", kind: "ガドリニウム", unit: "筒" },
];

export const contrastFor = (m: Modality) => CONTRAST_PRODUCTS.filter((c) => (m === "MRI" ? c.kind === "ガドリニウム" : c.kind === "ヨード"));

// ---------------------------------------------------------------------------
// The record of each study
// ---------------------------------------------------------------------------

/** 照射の方法（施行規則 第16条 三：具体的にかつ精細に）. */
export interface RisExposure {
  /** X線・CT：管電圧 kV. */
  kv?: number;
  /** X線：管電流時間積 mAs. */
  mas?: number;
  /** X線：撮影距離 cm. */
  distanceCm?: number;
  /** CT：管電流 mA（自動露出のときはその基準）. */
  ma?: number;
  /** CT：回転時間 秒. */
  rotationSec?: number;
  /** CT：スライス厚 mm. */
  sliceMm?: number;
  /** CT：撮影範囲（例：横隔膜上〜恥骨結合）. */
  range?: string;
  /** MRI：撮像の内容（例：T1・T2 強調像）. */
  sequences?: string;
  /** 撮影した枚数（X線）・画像の数. */
  films?: number;
  note?: string;
}

/** 線量（CT：CTDIvol・DLP、X線：正面1枚の入射表面空気カーマ Ka,e）. */
export interface RisDose {
  ctdiVol?: number;
  dlp?: number;
  esak?: number;
}

export interface RisContrast extends Stamp {
  code: string;
  name: string;
  count: number;
  route: "静注";
  lot: string;
  reaction: "なし" | "あり";
  reactionNote?: string;
}

export interface RisReport extends Stamp {
  findings: string;
  impression: string;
  /** 推奨される次検査（提言 1-2 の診断欄の一項目。reports.ts では「推奨」の見出しで出す）. */
  recommendation?: string;
  /** Why this version replaced the one before (訂正). */
  reason?: string;
}

/** A message the simulated modality sent (MPPS の模擬). */
export interface MppsEvent extends Moment {
  kind: "N-CREATE" | "N-SET";
  status: "IN PROGRESS" | "COMPLETED" | "DISCONTINUED";
  ae: string;
}

export interface RisWork {
  cancellations?: ExecutionCancellation[];
  orderId: string;
  patientId: string;
  /** e.g. 「CT　腹部・骨盤　単純」. */
  label: string;
  /** 指示受け・受付 by the technologist (ris-take.ts): from here the study is 受付済み. */
  arrived?: Stamp;
  /** 指示確認 after taking a contrast or MRI order: what the technologist looked at (ris-take.ts). */
  confirmed?: Stamp & { items: string[] };
  /** 呼出: the waiting room display, or the ward asked to bring the patient (ris-take.ts). */
  called?: Stamp & { how: "待合の表示" | "病棟へ搬送依頼" };
  /** 来室 (for a portable: the technologist reached the bedside). */
  inRoom?: Stamp;
  identityChecked?: Stamp;
  room?: RoomKey;
  /** 撮影の予定時刻（割り当てたとき）. */
  slot?: Moment;
  assignedBy?: string;
  started?: Stamp & { via: Via };
  done?: Stamp & { via: Via };
  notDone?: Stamp & { via: Via; reason: string };
  exposure?: RisExposure;
  dose?: RisDose;
  contrast?: RisContrast;
  /** 画像を PACS に送った（C-STORE の模擬）. */
  images?: Stamp & { count: number; series: number; via: Via };
  /** 照射録を確定した（技師）. */
  record?: Stamp;
  /** 照射録の署名（指示をした医師）. */
  signed?: Stamp;
  report?: RisReport;
  earlier?: RisReport[];
  mpps?: MppsEvent[];
}

export type RisDesk = Record<string, RisWork>;

export type RisStatus = "依頼" | "受付済み" | "撮影中" | "撮影済み" | "読影済み" | "中止";

export function risStatus(w: RisWork | undefined): RisStatus {
  if (!w) return "依頼";
  if (w.notDone) return "中止";
  if (w.report) return "読影済み";
  if (w.done) return "撮影済み";
  if (w.started) return "撮影中";
  if (w.arrived) return "受付済み";
  return "依頼";
}

/** X線 with 「読影不要」 gets no 読影の依頼; CT・MRI are always read (架空の病院の取り決め). */
export const needsReading = (o: Pick<ImagingOrder, "modality" | "reading">) => !((o.modality === "X線" || o.modality === "ポータブルX線") && o.reading === "読影不要");

/** MRI does not irradiate: no 照射録. */
export const irradiates = (m: Modality) => m !== "MRI";

export interface RisRow {
  orderId: string;
  patientId: string;
  name: string;
  kana: string;
  sex: Sex;
  age: number;
  weightKg?: number;
  pregnancy?: Patient["pregnancy"];
  allergies: string[];
  room: string;
  order: ImagingOrder;
  label: string;
  /** When it is due (minutes from today 00:00). */
  at: number;
  orderedBy: string;
  orderedAt: Moment;
  status: RisStatus;
  work?: RisWork;
}

type Person = { patient: Pick<Patient, "id" | "name" | "kana" | "sex" | "age" | "weightKg" | "allergies" | "pregnancy">; room: string; entries: OrderEntry[] };

/** The studies the department looks at: including future bookings, and older ones not finished. Stopped orders are left out. */
export function risRows(people: Person[], desk: RisDesk): RisRow[] {
  const rows: RisRow[] = [];
  const seen = new Set<string>();
  for (const x of people) {
    for (const e of x.entries) {
      if (e.order.type !== "imaging" || e.status === "中止") continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const o = e.order;
      // Older saves could attach the inherited ward order to the emergency chart.
      // The order ID owns the record; restore its actual chart owner on read.
      const saved = desk[e.id];
      const w = saved ? { ...saved, patientId: x.patient.id } : undefined;
      const status = risStatus(w);
      const finished = status === "中止" || status === "読影済み" || (status === "撮影済み" && (!needsReading(o) || !!w?.report));
      if (o.when.day < -1 && finished) continue;
      rows.push({
        orderId: e.id,
        patientId: x.patient.id,
        name: x.patient.name,
        kana: x.patient.kana,
        sex: x.patient.sex,
        age: x.patient.age,
        weightKg: x.patient.weightKg,
        pregnancy: x.patient.pregnancy,
        allergies: x.patient.allergies,
        room: x.room,
        order: o,
        label: imagingTitle(o),
        at: o.when.priority === "至急" ? abs(e.day, e.time) : w?.slot ? abs(w.slot.day, w.slot.time) : examAt(o, abs(e.day, e.time)),
        orderedBy: e.author,
        orderedAt: { day: e.day, time: e.time },
        status,
        work: w,
      });
    }
  }
  const rank: Record<RisStatus, number> = { 撮影中: 0, 受付済み: 1, 依頼: 2, 撮影済み: 3, 読影済み: 4, 中止: 5 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.order.when.priority === "至急" ? 0 : 1) - (b.order.when.priority === "至急" ? 0 : 1) || a.at - b.at);
}

/** The work record to change, made when the row has none yet. */
export const risScheduleText = (r: Pick<RisRow, "order" | "orderedAt"> & { at?: number }, today?: CalendarDate) => {
  if (r.order.when.priority === "至急") return `至急（${r.orderedAt.time} 指示）`;
  const at = r.at ?? 0;
  const day = Math.floor(at / 1440);
  const label = day === 0 ? "今日" : day === -1 ? "昨日" : day === 1 ? "明日" : day < 0 ? `${-day}日前` : `${day}日後`;
  return `${today ? formatShort(addDays(today, day)) : label} ${hhmm(at)}`;
};

export const workOf = (desk: RisDesk, r: Pick<RisRow, "orderId" | "patientId" | "label">): RisWork => (desk[r.orderId] ? { ...desk[r.orderId], patientId: r.patientId } : undefined) ?? { orderId: r.orderId, patientId: r.patientId, label: r.label };

export const putWork = (desk: RisDesk, r: Pick<RisRow, "orderId" | "patientId" | "label">, f: (w: RisWork) => RisWork): RisDesk => ({ ...desk, [r.orderId]: f(workOf(desk, r)) });

// ---------------------------------------------------------------------------
// 照射録（施行規則 第16条の4つの事項と、法 第28条の署名）
// ---------------------------------------------------------------------------

export interface ShoshaItem {
  /** 「一　照射を受けた者の氏名、性別及び年齢」など、条文の言葉. */
  label: string;
  value: string;
  missing: string[];
}

const n = (v: number | undefined, unit: string) => (v === undefined ? null : `${v}${unit}`);

/** 照射の方法 in one line, and what is still missing for the modality. */
export function exposureText(o: ImagingOrder, w: RisWork | undefined): { text: string; missing: string[] } {
  const e = w?.exposure ?? {};
  const room = findRoom(w?.room);
  const region = regionLabel(o.region, o.side);
  const missing: string[] = [];
  const parts: string[] = [room ? room.device : "（装置が未割り当て）", `${o.modality} ${region}`];
  if (!room) missing.push("装置");
  if (o.position) parts.push(o.modality === "ポータブルX線" ? `病室で${o.position}` : o.position);
  if (o.modality === "X線" || o.modality === "ポータブルX線") {
    parts.push(viewsText(o.views));
    const cond = [n(e.kv, "kV"), n(e.mas, "mAs"), n(e.distanceCm, "cm")].filter(Boolean);
    if (e.kv === undefined) missing.push("管電圧（kV）");
    if (e.mas === undefined) missing.push("管電流時間積（mAs）");
    if (e.distanceCm === undefined) missing.push("撮影距離（cm）");
    if (cond.length) parts.push(cond.join("・"));
    if (e.films === undefined) missing.push("枚数");
    else parts.push(`${e.films}枚`);
  } else if (o.modality === "CT") {
    const cond = [n(e.kv, "kV"), n(e.ma, "mA"), n(e.rotationSec, "秒/回転"), n(e.sliceMm, "mm 厚")].filter(Boolean);
    if (e.kv === undefined) missing.push("管電圧（kV）");
    if (e.ma === undefined) missing.push("管電流（mA）");
    if (e.sliceMm === undefined) missing.push("スライス厚（mm）");
    if (!e.range?.trim()) missing.push("撮影範囲");
    if (cond.length) parts.push(cond.join("・"));
    if (e.range) parts.push(`範囲：${e.range}`);
    parts.push(o.contrast ?? "");
    if (o.ct) parts.push(imagingMethodText({ modality: o.modality, region: o.region, ct: o.ct }));
  } else {
    if (o.mri?.sequences.length) parts.push(`オーダ：${o.mri.sequences.join("・")}`);
    if (e.sequences) parts.push(e.sequences);
  }
  if (o.note) parts.push(o.note);
  if (w?.contrast) parts.push(`造影剤：${w.contrast.name} ${w.contrast.count}${contrastUnit(w.contrast.code)}（${w.contrast.route}）`);
  if (e.note) parts.push(e.note);
  return { text: parts.filter(Boolean).join("　"), missing };
}

const contrastUnit = (code: string) => CONTRAST_PRODUCTS.find((c) => c.code === code)?.unit ?? "";

/** 造影剤使用の説明と同意, as the department sees it on the order: 「同意済（…）」「同意：未取得」, nothing for a plain study. */
export const orderConsentText = (o: ImagingOrder): string => (usesContrast(o) ? consentText(o.consent) || "同意：未取得" : "");

/** What the dose record still lacks: CT needs CTDIvol and DLP (全身用X線CT診断装置 is a 管理・記録対象医療機器). */
export function doseMissing(o: ImagingOrder, d: RisDose | undefined): string[] {
  if (o.modality !== "CT") return [];
  return [d?.ctdiVol === undefined && "CTDIvol（mGy）", d?.dlp === undefined && "DLP（mGy・cm）"].filter((x): x is string => !!x);
}

export function doseText(o: ImagingOrder, d: RisDose | undefined): string {
  if (!d) return "—";
  if (o.modality === "CT") return [n(d.ctdiVol, " mGy（CTDIvol）"), n(d.dlp, " mGy・cm（DLP）")].filter(Boolean).join("　") || "—";
  return d.esak === undefined ? "—" : `${d.esak} mGy（正面1枚の入射表面空気カーマ）`;
}

/**
 * The 照射録 of one study: the four items of 施行規則 第16条 filled in from the order, the patient and the
 * technologist's record, with what each still lacks. `fmtDay` writes a day offset as a date.
 */
export function shoshaRoku(r: RisRow, fmtDay: (d: DayOffset) => string): { items: ShoshaItem[]; doseMissing: string[]; ready: boolean } {
  const w = r.work;
  const how = exposureText(r.order, w);
  const items: ShoshaItem[] = [
    { label: "一　照射を受けた者の氏名、性別及び年齢", value: `${r.name}（${r.kana}）　${r.sex}　${r.age}歳`, missing: [] },
    { label: "二　照射の年月日", value: w?.done ? `${fmtDay(w.done.day)} ${w.done.time}` : "（まだ撮影していない）", missing: w?.done ? [] : ["撮影の記録"] },
    { label: "三　照射の方法（具体的にかつ精細に）", value: how.text, missing: how.missing },
    {
      label: "四　指示を受けた医師の氏名及びその指示の内容",
      value: `${r.orderedBy}（${fmtDay(r.orderedAt.day)} ${r.orderedAt.time} のオーダ）：${r.label}${imagingMethodText(r.order) ? `　${imagingMethodText(r.order)}` : ""}　目的：${r.order.purpose}${orderConsentText(r.order) ? `　${orderConsentText(r.order)}` : ""}`,
      missing: [],
    },
  ];
  const dm = doseMissing(r.order, w?.dose);
  return { items, doseMissing: dm, ready: items.every((i) => i.missing.length === 0) && dm.length === 0 };
}

// ---------------------------------------------------------------------------
// 線量と診断参考レベル（DRLs 2025）
// ---------------------------------------------------------------------------

export interface DrlEntry {
  protocol: string;
  ctdiVol?: number;
  dlp?: number;
  esak?: number;
}

/** CT（成人、1相、標準体格 50〜70kg）: 表 3.1.1 から、この病院の部位マスターに当たるものだけ. */
const CT_DRL: Record<string, DrlEntry> = {
  "R-HEAD": { protocol: "頭部単純ルーチン", ctdiVol: 67, dlp: 1260 },
  "R-CHEST": { protocol: "胸部1相", ctdiVol: 11, dlp: 430 },
  "R-ABD-PELVIS": { protocol: "上腹部〜骨盤1相", ctdiVol: 14, dlp: 720 },
};

/** 一般撮影（入射表面空気カーマ Ka,e mGy）: 表 3.2 から、正面1枚. */
function xrayDrl(region: string, kv: number | undefined): DrlEntry | null {
  if (region === "R-CHEST") return kv === undefined ? null : kv >= 100 ? { protocol: "胸部正面（100kV 以上）", esak: 0.2 } : { protocol: "胸部正面（100kV 未満）", esak: 0.3 };
  if (region === "R-ABD") return { protocol: "腹部正面（臥位）", esak: 1.4 };
  if (region === "R-HEAD") return { protocol: "頭部正面", esak: 1.3 };
  if (region === "R-CSPINE") return { protocol: "頚椎正面", esak: 0.5 };
  if (region === "R-LSPINE") return { protocol: "腰椎正面", esak: 2.5 };
  return null;
}

/** The DRL a study is compared with, or why there is none. */
export function drlFor(o: ImagingOrder, w: RisWork | undefined): { drl: DrlEntry | null; why?: string } {
  if (o.modality === "MRI") return { drl: null, why: "MRI は放射線を使いません。" };
  if (o.modality === "CT") {
    if (o.contrast === "単純＋造影") return { drl: null, why: "2相の撮影なので、1相の DRL とは比べません。" };
    const d = CT_DRL[o.region];
    return d ? { drl: d } : { drl: null, why: "この部位に当たる DRL の区分がありません。" };
  }
  const d = xrayDrl(o.region, w?.exposure?.kv);
  return d ? { drl: d } : { drl: null, why: o.region === "R-CHEST" ? "管電圧を入れると区分（100kV 以上・未満）が決まります。" : "この部位に当たる DRL の区分がありません。" };
}

export const DRL_NOTE =
  "診断参考レベル（DRL）は線量限度ではなく、診療の是非を分ける境界でもありません。患者群に用いるもので、個々の患者や検査の線量が高すぎるかを判断するものではありません（Japan DRLs 2025 2.1）。施設の典型的な線量（中央値）と比べます。";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

export interface DoseGroup {
  protocol: string;
  modality: "CT" | "X線";
  count: number;
  median: { ctdiVol?: number; dlp?: number; esak?: number };
  drl: DrlEntry;
  /** Which medians are above the DRL (a reason to review the protocol, not a judgement on a patient). */
  above: string[];
}

/** The facility's median dose by DRL protocol, from the studies recorded here. */
export function doseGroups(rows: RisRow[]): DoseGroup[] {
  const by = new Map<string, { drl: DrlEntry; modality: "CT" | "X線"; ctdi: number[]; dlp: number[]; esak: number[] }>();
  for (const r of rows) {
    const d = r.work?.dose;
    if (!r.work?.done || !d) continue;
    const { drl } = drlFor(r.order, r.work);
    if (!drl) continue;
    const g = by.get(drl.protocol) ?? { drl, modality: r.order.modality === "CT" ? "CT" : "X線", ctdi: [], dlp: [], esak: [] };
    if (d.ctdiVol !== undefined) g.ctdi.push(d.ctdiVol);
    if (d.dlp !== undefined) g.dlp.push(d.dlp);
    if (d.esak !== undefined) g.esak.push(d.esak);
    by.set(drl.protocol, g);
  }
  return [...by.entries()].map(([protocol, g]) => {
    const med = { ...(g.ctdi.length ? { ctdiVol: median(g.ctdi) } : {}), ...(g.dlp.length ? { dlp: median(g.dlp) } : {}), ...(g.esak.length ? { esak: median(g.esak) } : {}) };
    const above = [
      med.ctdiVol !== undefined && g.drl.ctdiVol !== undefined && med.ctdiVol > g.drl.ctdiVol && "CTDIvol",
      med.dlp !== undefined && g.drl.dlp !== undefined && med.dlp > g.drl.dlp && "DLP",
      med.esak !== undefined && g.drl.esak !== undefined && med.esak > g.drl.esak && "入射表面空気カーマ",
    ].filter((x): x is string => !!x);
    return { protocol, modality: g.modality, count: Math.max(g.ctdi.length, g.dlp.length, g.esak.length), median: med, drl: g.drl, above };
  });
}

// ---------------------------------------------------------------------------
// What the record checks before a step
// ---------------------------------------------------------------------------

/** What stops the study from being recorded as done (撮影済み). */
export function doneProblems(r: RisRow, w: RisWork): string[] {
  const out: string[] = [];
  if (!w.identityChecked) out.push("氏名・生年月日・リストバンドを確認してください。");
  if (!w.arrived) out.push("指示受け（受付）がまだです。");
  if (!w.room) out.push("撮影室・装置を割り当ててください。");
  const usesContrast = r.order.contrast && r.order.contrast !== "単純";
  if (r.order.contrast === "造影" || r.order.contrast === "単純＋造影") {
    if (!w.contrast) out.push("造影のオーダです。使った造影剤を記録してください（使わなかったときは、医師に確かめてオーダを直します）。");
  }
  if (w.contrast && !usesContrast) out.push("単純のオーダに造影剤の記録があります。医師の指示を確かめてください。");
  if (usesContrast && r.order.consent?.state === "同意しない") out.push("造影剤の使用に同意が得られていないオーダです。医師に確かめてください。");
  if (w.contrast && w.contrast.reaction === "あり" && !w.contrast.reactionNote?.trim()) out.push("造影剤の副作用の内容を書いてください。");
  return out;
}

/** What stops the 照射録 from being confirmed by the technologist. */
export function recordProblems(r: RisRow, fmtDay: (d: DayOffset) => string): string[] {
  if (!irradiates(r.order.modality)) return ["MRI は放射線を照射しないので、照射録の対象ではありません。"];
  const s = shoshaRoku(r, fmtDay);
  return [...(!r.work?.exposure ? ["撮影条件の記録がまだです。"] : []), ...s.items.flatMap((i) => i.missing.map((m) => `${i.label.slice(0, 1)}：${m}が入っていません。`)), ...s.doseMissing.map((m) => `線量：${m}が入っていません（CT は線量の記録が要ります）。`)];
}

/** What stops a reading report from being confirmed. */
export function reportProblems(rep: Pick<RisReport, "findings" | "impression" | "reason">, hadReport: boolean): string[] {
  return [!rep.findings.trim() && "所見を書いてください。", !rep.impression.trim() && "診断（まとめ）を書いてください。", hadReport && !rep.reason?.trim() && "訂正の理由を書いてください。"].filter((x): x is string => !!x);
}

export const reportVersion = (w: RisWork) => (w.report ? (w.earlier?.length ?? 0) + 1 : 0);

// ---------------------------------------------------------------------------
// To the chart, the PACS viewer and the claim
// ---------------------------------------------------------------------------

/** Reading reports as results the ordering doctor marks as read (a corrected report is a new result). */
export function risResultItems(desk: RisDesk): ResultItem[] {
  return Object.values(desk)
    .filter((w) => w.report)
    .map((w) => {
      const r = w.report!;
      const v = reportVersion(w);
      return {
        key: `ris|${w.orderId}|v${v}`,
        patientId: w.patientId,
        kind: "画像" as const,
        day: r.day,
        time: r.time,
        title: `${w.label.replace(/　/g, " ")}${v > 1 ? "（訂正）" : ""}`,
        detail: r.impression,
        panic: [],
        ...(v > 1 ? { corrected: `訂正（第${v}版）：${r.reason ?? ""}（${r.time} ${r.by}）` } : {}),
      };
    });
}

/** 照射録 waiting for the ordering doctor's signature. */
export function unsignedRecords(rows: RisRow[], doctor?: string): RisRow[] {
  return rows.filter((r) => r.work?.record && !r.work.signed && (!doctor || r.orderedBy === doctor));
}

/** What the claim reads from the department's record (types.ts ExamRecord). */
export function examRecordOf(w: RisWork | undefined): ExamRecord {
  if (!w) return {};
  if (w.notDone) return { notDone: true };
  if (!w.done) return {};
  return { done: { day: w.done.day, time: w.done.time }, ...(w.contrast ? { contrast: { code: w.contrast.code, name: w.contrast.name, count: w.contrast.count } } : {}) };
}

/**
 * The imaging orders of a patient the department works for, with what it recorded: the claim then counts a study
 * on the day it was done (not when its time passed), leaves out the ones not done, and adds the contrast medium used.
 */
export function withExamRecords(entries: HistoryEntry[], desk: RisDesk): HistoryEntry[] {
  return entries.map((e) => (e.kind === "order" && e.order.type === "imaging" ? { ...e, exam: examRecordOf(desk[e.id]) } : e));
}

/** For the PACS viewer: whether images were stored, and the report to show. */
export function studyStateOf(o: ImagingOrder, w: RisWork | undefined): { pending: boolean; report: string; reader: string; at?: Moment } {
  if (!w?.images) {
    const state = risStatus(w);
    return {
      pending: true,
      report: state === "中止" ? `撮影できなかった：${w?.notDone?.reason ?? ""}` : `${state === "依頼" ? "撮影の依頼" : state}：${o.when.priority === "至急" ? "至急" : (o.when.time ?? "")}　目的：${o.purpose}`,
      reader: `（${state}${w?.done ? "・画像未送信" : ""}）`,
      at: w?.done,
    };
  }
  if (w.report) return { pending: false, report: `${w.report.findings}\n【診断】${w.report.impression}${w.report.recommendation ? `\n【推奨】${w.report.recommendation}` : ""}`, reader: `${w.report.by}（${w.report.time}）`, at: w.done };
  return { pending: false, report: needsReading(o) ? "撮影済み。読影をお待ちください。" : "撮影済み（読影不要のオーダ）。", reader: needsReading(o) ? "（読影待ち）" : "（読影不要）", at: w.done };
}

// ---------------------------------------------------------------------------
// Fictional orders and work of this demo
// ---------------------------------------------------------------------------

export const RADIOLOGIST = "放射線科 石田";

const hhmm = (a: number) => {
  const m = ((a % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Imaging orders for the fictional ward patients (merged into their records like the demo physiological tests). */
export function demoRisOrders(nowAbs: number): Record<string, OrderEntry[]> {
  const DR = "山本（専攻医）";
  const entry = (id: string, day: DayOffset, time: string, order: ImagingOrder): OrderEntry => ({ kind: "order", id, day, time, author: DR, status: "有効", order });
  return {
    "90010198": [
      entry("o-ris-demo1", -1, "17:30", { type: "imaging", modality: "ポータブルX線", region: "R-CHEST", views: ["臥位正面（AP）"], reading: "当日中", purpose: "心不全の経過。胸水・肺うっ血の変化。", when: { day: 0, time: "06:30", priority: "予約" }, transport: "病室（ポータブル）" }),
    ],
    "90010260": [
      entry("o-ris-demo2", 0, hhmm(Math.max(0, nowAbs - 45)), {
        type: "imaging",
        modality: "CT",
        region: "R-ABD-PELVIS",
        contrast: "単純＋造影",
        purpose: "急性腎盂腎炎で解熱しない。腎膿瘍・水腎症・気腫性変化の有無。",
        when: { day: 0, time: "15:00", priority: "予約" },
        transport: "車椅子",
        answers: { pregnancy: "なし（確認済み）" },
      }),
    ],
    "90010244": [entry("o-ris-demo3", 0, hhmm(Math.max(0, nowAbs - 20)), { type: "imaging", modality: "X線", region: "R-CHEST", views: ["立位正面（PA）"], reading: "当日中", purpose: "誤嚥性肺炎の経過。浸潤影の広がり。", when: { day: 0, priority: "至急" }, transport: "車椅子" })],
    "90010231": [
      entry("o-ris-demo4", 0, "09:10", { type: "imaging", modality: "MRI", region: "R-LEG", contrast: "単純", purpose: "右下腿蜂窩織炎。膿瘍・筋膜への広がり・骨髄炎の有無。", when: { day: 1, time: "10:00", priority: "予約" }, transport: "車椅子", answers: { metal: "なし（確認済み）" } }),
    ],
  };
}

/** 北村さんのポータブル胸部X線 was taken this morning, recorded and read (not signed or read by the doctor yet). */
export function initialRisDesk(nowAbs: number): RisDesk {
  const at = (back: number): Moment => ({ day: 0, time: hhmm(Math.max(0, nowAbs - back)) });
  const TECH = "放射線技師 松本";
  return {
    "o-ris-demo1": {
      orderId: "o-ris-demo1",
      patientId: "90010198",
      label: "ポータブルX線　胸部",
      arrived: { ...at(150), by: TECH },
      room: "PORT",
      slot: { day: 0, time: "06:30" },
      assignedBy: TECH,
      started: { ...at(145), by: TECH, via: "模擬装置" },
      done: { ...at(140), by: TECH, via: "模擬装置" },
      exposure: { kv: 90, mas: 2.5, distanceCm: 100, films: 1 },
      dose: { esak: 0.18 },
      images: { ...at(138), by: TECH, count: 1, series: 1, via: "模擬装置" },
      record: { ...at(130), by: TECH },
      report: {
        ...at(70),
        by: RADIOLOGIST,
        findings: "臥位正面（AP）。両側の肋骨横隔膜角は前回（昨日）と同じく鈍。肺血管影の増強は軽度。",
        impression: "両側胸水と肺うっ血は前回と著変なし。",
        recommendation: "胸水の増減は臨床所見と合わせて。必要なら立位で再撮影。",
      },
      mpps: [
        { ...at(145), kind: "N-CREATE", status: "IN PROGRESS", ae: "SK_PORTA" },
        { ...at(140), kind: "N-SET", status: "COMPLETED", ae: "SK_PORTA" },
      ],
    },
  };
}
