// The DICOM side of 放射線部, as a SIMULATION (模擬): no device is connected. The Modality Worklist (MWL) the
// simulated modality reads is built from the imaging orders, with the attributes PS3.4 Table K.6-1 defines for
// it; the Modality Performed Procedure Step (MPPS) it sends has the attributes of PS3.4 Table F.7.2-1; the CT
// dose it reports uses the concepts of PS3.16 TID 10013. Tags, keywords and VRs are those of the PS3.6 registry.
// The same items can be sent to a local Orthanc (dicomweb.ts) when someone runs one (docs/dicom-local.md).

import { addDays, type CalendarDate } from "./dates";
import { findRegion } from "./exams";
import { makeRng, seedFrom } from "./pacs/random";
import { findRoom, type RisDose, type RisExposure, type RisRow } from "./ris";

export const DICOM_SOURCES = {
  mwl: { label: "DICOM PS3.4 K.6.1.2.2 Table K.6-1「Attributes for the Modality Worklist Information Model」", url: "https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_K.6.html" },
  mpps: { label: "DICOM PS3.4 F.7.2 Table F.7.2-1「Modality Performed Procedure Step SOP Class N-CREATE, N-SET and Final State Attributes」", url: "https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_F.7.2.html" },
  registry: { label: "DICOM PS3.6 Table 6-1「Registry of DICOM Data Elements」（タグ・キーワード・VR）", url: "https://dicom.nema.org/medical/dicom/current/output/chtml/part06/chapter_6.html" },
  dose: { label: "DICOM PS3.16 TID 10013「CT Irradiation Event Data」（Mean CTDIvol (113830, DCM)・DLP (113838, DCM)）", url: "https://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_tid_10013.html" },
  pregnancy: { label: "DICOM PS3.3 C.2.4 Patient Medical Module（Pregnancy Status の値）", url: "https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.2.4.html" },
};

/** MPPS の線量の属性（Radiation Dose Module）は、いまの規格では廃止（retired）になっている（PS3.4 F.7.2 Note 6）。線量は RDSR で報告する. */
export const MPPS_DOSE_NOTE =
  "MPPS（実施済み手続きの通知）に線量を入れる属性（Radiation Dose Module）は、いまの DICOM 規格では廃止されています（PS3.4 F.7.2 の注6）。線量は X線線量の構造化報告（RDSR）の形で送るので、この模擬装置も「撮影終了（MPPS COMPLETED）」と「線量の報告（RDSR の模擬）」を分けて送ります。";

export type Vr = "AE" | "CS" | "DA" | "DS" | "LO" | "PN" | "SH" | "SQ" | "TM" | "UI" | "US";

export interface DicomAttr {
  tag: string;
  keyword: string;
  name: string;
  vr: Vr;
  /** Text value (empty = sent with no value, as a Type 2 attribute). Not used for SQ. */
  value?: string;
  /** Items of a sequence (SQ). */
  items?: DicomAttr[][];
  /** MWL: matching key type / return key type (Table K.6-1). */
  keys?: string;
}

const attr = (tag: string, keyword: string, name: string, vr: Vr, value: string, keys?: string): DicomAttr => ({ tag, keyword, name, vr, value, ...(keys ? { keys } : {}) });

// ---------------------------------------------------------------------------
// Identifiers (made from the order ID, the same every time). Fictional.
// ---------------------------------------------------------------------------

/** Accession Number (0008,0050), SH: 16 characters at most. */
export const accessionOf = (orderId: string) => `SK${String(seedFrom(`acc:${orderId}`) % 100_000_000).padStart(8, "0")}`;

/**
 * Study Instance UID (0020,000D): a "2.25." UID (a UID made from a 128-bit number, PS3.5 B.2), here from the
 * order ID so the same order always has the same study. 64 characters at most.
 */
export function studyUidOf(orderId: string): string {
  let n = BigInt(0);
  for (let i = 0; i < 4; i++) n = (n << BigInt(32)) + BigInt(seedFrom(`uid${i}:${orderId}`));
  return `2.25.${n.toString()}`;
}

export const seriesUidOf = (orderId: string, series: number) => `${studyUidOf(orderId).slice(0, 56)}.${series}`;

/** A fictional birth date that gives the patient's age today (the records keep only the age). */
export function fictionalBirthDate(patientId: string, age: number, today: CalendarDate): string {
  const r = makeRng(seedFrom(`birth:${patientId}`));
  const m = 1 + Math.floor(r() * 12);
  const d = 1 + Math.floor(r() * 28);
  const hadBirthday = m < today.m || (m === today.m && d <= today.d);
  const y = today.y - age - (hadBirthday ? 0 : 1);
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

const da = (date: CalendarDate) => `${date.y}${String(date.m).padStart(2, "0")}${String(date.d).padStart(2, "0")}`;
const tm = (time: string) => `${time.replace(":", "")}00`;

/** Patient's Name (PN) with the ideographic and phonetic groups: 「=北村^博=キタムラ^ヒロシ」 (no alphabetic group). */
export function personName(name: string, kana: string): { ideographic: string; phonetic: string; text: string } {
  const caret = (s: string) => s.trim().split(/[\s　]+/).join("^");
  const ideographic = caret(name);
  const phonetic = caret(kana);
  return { ideographic, phonetic, text: `=${ideographic}=${phonetic}` };
}

/** Pregnancy Status (0010,21C0): 0001 not pregnant, 0002 possibly pregnant, 0004 unknown; empty when not asked. */
function pregnancyStatus(r: RisRow): string {
  const a = r.order.answers?.pregnancy;
  if (!a) return "";
  if (a.startsWith("なし")) return "0001";
  if (a.includes("可能性")) return "0002";
  return "0004";
}

// ---------------------------------------------------------------------------
// Modality Worklist (C-FIND の応答の模擬)
// ---------------------------------------------------------------------------

/** One worklist item for a study, with the attributes of Table K.6-1 (values from the order, the patient and the room). */
export function mwlItem(r: RisRow, today: CalendarDate, extra: { wardRoom?: string; alerts?: string[] } = {}): DicomAttr[] {
  const room = findRoom(r.work?.room);
  const when = r.work?.slot ?? { day: r.order.when.day, time: r.order.when.time ?? "" };
  const pn = personName(r.name, r.kana);
  const region = `${r.order.side ?? ""}${findRegion(r.order.region)?.name ?? r.order.region}`;
  const description = `${r.order.modality} ${region}${r.order.contrast ? ` ${r.order.contrast}` : ""}${r.order.views ? ` ${r.order.views.join("+")}` : ""}${r.order.position ? ` ${r.order.position}` : ""}`;
  const acc = accessionOf(r.orderId);
  return [
    attr("0008,0005", "SpecificCharacterSet", "Specific Character Set", "CS", "ISO_IR 192"),
    {
      tag: "0040,0100",
      keyword: "ScheduledProcedureStepSequence",
      name: "Scheduled Procedure Step Sequence",
      vr: "SQ",
      keys: "R / 1",
      items: [
        [
          attr("0040,0001", "ScheduledStationAETitle", "Scheduled Station AE Title", "AE", room?.ae ?? "", "R / 1"),
          attr("0040,0002", "ScheduledProcedureStepStartDate", "Scheduled Procedure Step Start Date", "DA", da(addDays(today, when.day)), "R / 1"),
          attr("0040,0003", "ScheduledProcedureStepStartTime", "Scheduled Procedure Step Start Time", "TM", when.time ? tm(when.time) : "", "R / 1"),
          attr("0008,0060", "Modality", "Modality", "CS", room?.dicom ?? "", "R / 1"),
          attr("0040,0006", "ScheduledPerformingPhysicianName", "Scheduled Performing Physician's Name", "PN", "", "R / 2"),
          attr("0040,0007", "ScheduledProcedureStepDescription", "Scheduled Procedure Step Description", "LO", description, "O / 1C"),
          attr("0040,0010", "ScheduledStationName", "Scheduled Station Name", "SH", room?.station ?? "", "O / 2"),
          attr("0040,0011", "ScheduledProcedureStepLocation", "Scheduled Procedure Step Location", "SH", room?.location ?? "", "O / 2"),
          attr("0040,0009", "ScheduledProcedureStepID", "Scheduled Procedure Step ID", "SH", `SPS${acc.slice(2)}`, "O / 1"),
        ],
      ],
    },
    attr("0040,1001", "RequestedProcedureID", "Requested Procedure ID", "SH", `RP${acc.slice(2)}`, "O / 1"),
    attr("0032,1060", "RequestedProcedureDescription", "Requested Procedure Description", "LO", description, "O / 1C"),
    attr("0020,000D", "StudyInstanceUID", "Study Instance UID", "UI", studyUidOf(r.orderId), "O / 1"),
    attr("0008,0050", "AccessionNumber", "Accession Number", "SH", acc, "O / 2"),
    attr("0032,1032", "RequestingPhysician", "Requesting Physician", "PN", r.orderedBy.replace(/[（(].*$/, ""), "O / 2"),
    attr("0008,0090", "ReferringPhysicianName", "Referring Physician's Name", "PN", r.orderedBy.replace(/[（(].*$/, ""), "O / 2"),
    attr("0010,0010", "PatientName", "Patient's Name", "PN", pn.text, "R / 1"),
    attr("0010,0020", "PatientID", "Patient ID", "LO", r.patientId, "R / 1"),
    attr("0010,0030", "PatientBirthDate", "Patient's Birth Date", "DA", fictionalBirthDate(r.patientId, r.age, today), "O / 2"),
    attr("0010,0040", "PatientSex", "Patient's Sex", "CS", r.sex === "男" ? "M" : "F", "O / 2"),
    attr("0010,1030", "PatientWeight", "Patient's Weight", "DS", r.weightKg ? String(r.weightKg) : "", "O / 2"),
    attr("0010,21C0", "PregnancyStatus", "Pregnancy Status", "US", pregnancyStatus(r), "O / 2"),
    attr("0010,2000", "MedicalAlerts", "Medical Alerts", "LO", (extra.alerts ?? []).join("\\"), "O / 2"),
    attr("0010,2110", "Allergies", "Allergies", "LO", r.allergies.join("\\"), "O / 2"),
    attr("0038,0010", "AdmissionID", "Admission ID", "LO", `ADM${r.patientId}`, "O / 2"),
    attr("0038,0300", "CurrentPatientLocation", "Current Patient Location", "LO", extra.wardRoom ?? r.room, "O / 2"),
  ];
}

/** The worklist one device (AE title) receives: studies taken in (受付済み) or being done, assigned to it, for today. */
export function worklistFor(ae: string, rows: RisRow[]): RisRow[] {
  return rows.filter((r) => findRoom(r.work?.room)?.ae === ae && (r.status === "受付済み" || r.status === "撮影中") && (r.work?.slot?.day ?? r.order.when.day) === 0);
}

// ---------------------------------------------------------------------------
// MPPS（N-CREATE：IN PROGRESS、N-SET：COMPLETED / DISCONTINUED）の模擬
// ---------------------------------------------------------------------------

/** N-CREATE (status IN PROGRESS, which the SCU must send first) with the attributes of Table F.7.2-1. */
export function mppsCreate(r: RisRow, today: CalendarDate, at: { day: number; time: string }): DicomAttr[] {
  const room = findRoom(r.work?.room);
  const acc = accessionOf(r.orderId);
  const date = da(addDays(today, at.day));
  return [
    {
      tag: "0040,0270",
      keyword: "ScheduledStepAttributesSequence",
      name: "Scheduled Step Attributes Sequence",
      vr: "SQ",
      items: [
        [
          attr("0020,000D", "StudyInstanceUID", "Study Instance UID", "UI", studyUidOf(r.orderId)),
          attr("0008,0050", "AccessionNumber", "Accession Number", "SH", acc),
          attr("0040,1001", "RequestedProcedureID", "Requested Procedure ID", "SH", `RP${acc.slice(2)}`),
          attr("0040,0009", "ScheduledProcedureStepID", "Scheduled Procedure Step ID", "SH", `SPS${acc.slice(2)}`),
        ],
      ],
    },
    attr("0010,0010", "PatientName", "Patient's Name", "PN", personName(r.name, r.kana).text),
    attr("0010,0020", "PatientID", "Patient ID", "LO", r.patientId),
    attr("0040,0241", "PerformedStationAETitle", "Performed Station AE Title", "AE", room?.ae ?? ""),
    attr("0040,0242", "PerformedStationName", "Performed Station Name", "SH", room?.station ?? ""),
    attr("0040,0243", "PerformedLocation", "Performed Location", "SH", room?.location ?? ""),
    attr("0040,0244", "PerformedProcedureStepStartDate", "Performed Procedure Step Start Date", "DA", date),
    attr("0040,0245", "PerformedProcedureStepStartTime", "Performed Procedure Step Start Time", "TM", tm(at.time)),
    attr("0040,0253", "PerformedProcedureStepID", "Performed Procedure Step ID", "SH", `PPS${acc.slice(2)}`),
    attr("0040,0250", "PerformedProcedureStepEndDate", "Performed Procedure Step End Date", "DA", ""),
    attr("0040,0251", "PerformedProcedureStepEndTime", "Performed Procedure Step End Time", "TM", ""),
    attr("0040,0252", "PerformedProcedureStepStatus", "Performed Procedure Step Status", "CS", "IN PROGRESS"),
    attr("0040,0254", "PerformedProcedureStepDescription", "Performed Procedure Step Description", "LO", r.label.replace(/　/g, " ")),
    attr("0008,0060", "Modality", "Modality", "CS", room?.dicom ?? ""),
    { tag: "0040,0340", keyword: "PerformedSeriesSequence", name: "Performed Series Sequence", vr: "SQ", items: [] },
  ];
}

/** N-SET to the final state: end date and time, the status, and the series done (Performed Series Sequence). */
export function mppsSet(r: RisRow, today: CalendarDate, at: { day: number; time: string }, status: "COMPLETED" | "DISCONTINUED", operator: string, series: number): DicomAttr[] {
  return [
    attr("0040,0250", "PerformedProcedureStepEndDate", "Performed Procedure Step End Date", "DA", da(addDays(today, at.day))),
    attr("0040,0251", "PerformedProcedureStepEndTime", "Performed Procedure Step End Time", "TM", tm(at.time)),
    attr("0040,0252", "PerformedProcedureStepStatus", "Performed Procedure Step Status", "CS", status),
    {
      tag: "0040,0340",
      keyword: "PerformedSeriesSequence",
      name: "Performed Series Sequence",
      vr: "SQ",
      items: status === "COMPLETED"
        ? Array.from({ length: series }, (_, i) => [
            attr("0008,1050", "PerformingPhysicianName", "Performing Physician's Name", "PN", ""),
            attr("0008,1070", "OperatorsName", "Operators' Name", "PN", operator),
            attr("0020,000E", "SeriesInstanceUID", "Series Instance UID", "UI", seriesUidOf(r.orderId, i + 1)),
            { tag: "0008,1140", keyword: "ReferencedImageSequence", name: "Referenced Image Sequence", vr: "SQ" as const, items: [] },
          ])
        : [],
    },
  ];
}

// ---------------------------------------------------------------------------
// 線量（CT は RDSR の CTDIvol と DLP）と、模擬の撮影条件
// ---------------------------------------------------------------------------

export interface DoseConcept {
  code: string;
  scheme: "DCM";
  meaning: string;
  value: number;
  unit: string;
}

/** The CT dose as the content items of TID 10013 (Mean CTDIvol, DLP). */
export function ctDoseConcepts(d: RisDose): DoseConcept[] {
  return [
    ...(d.ctdiVol !== undefined ? [{ code: "113830", scheme: "DCM" as const, meaning: "Mean CTDIvol", value: d.ctdiVol, unit: "mGy" }] : []),
    ...(d.dlp !== undefined ? [{ code: "113838", scheme: "DCM" as const, meaning: "DLP", value: d.dlp, unit: "mGy.cm" }] : []),
  ];
}

const round = (v: number, step: number) => Math.round(v / step) * step;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Exposure conditions, dose and image count the SIMULATED device reports for a study (fictional numbers, the same
 * every time for the same order). Not a model of any real device.
 */
export function simulatedAcquisition(r: RisRow): { exposure: RisExposure; dose: RisDose; images: number; series: number } {
  const rng = makeRng(seedFrom(`acq:${r.orderId}`));
  const o = r.order;
  if (o.modality === "X線" || o.modality === "ポータブルX線") {
    const chest = o.region === "R-CHEST";
    const films = o.views?.length ?? 1;
    const kv = chest ? (o.modality === "ポータブルX線" ? 90 : 120) : 75;
    const mas = r1(chest ? 2 + rng() * 1.5 : 10 + rng() * 15);
    return { exposure: { kv, mas, distanceCm: chest && o.modality === "X線" ? 200 : 100, films }, dose: { esak: r1(chest ? 0.12 + rng() * 0.1 : 0.8 + rng() * 0.8) }, images: films, series: films };
  }
  if (o.modality === "CT") {
    const phases = o.contrast === "単純＋造影" ? 2 : 1;
    const head = o.region === "R-HEAD";
    const ctdi = r1(head ? 50 + rng() * 15 : 8 + rng() * 5);
    const lengthCm = head ? 16 : o.region === "R-ABD-PELVIS" ? 45 : 35;
    const range = head ? "頭頂〜頭蓋底" : o.region === "R-ABD-PELVIS" ? "横隔膜上〜恥骨結合" : o.region === "R-CHEST" ? "肺尖〜肺底" : "撮影部位の全体";
    return {
      exposure: { kv: 120, ma: round(150 + rng() * 150, 10), rotationSec: 0.5, sliceMm: 5, range, films: phases * 70 },
      dose: { ctdiVol: ctdi, dlp: Math.round(ctdi * lengthCm * phases) },
      images: phases * 70,
      series: phases,
    };
  }
  return { exposure: { sequences: "T1 強調像・T2 強調像", films: 60 }, dose: {}, images: 60, series: 2 };
}

// ---------------------------------------------------------------------------
// Encodings: the DICOM JSON model (PS3.18 F.2) and Orthanc's keyword JSON (for docs/dicom-local.md)
// ---------------------------------------------------------------------------

type JsonAttr = { vr: Vr; Value?: unknown[] };

/** The DICOM JSON model: tags without the comma as keys, PN as {Ideographic, Phonetic}, multi-valued text split at "\". */
export function toDicomJson(attrs: DicomAttr[]): Record<string, JsonAttr> {
  const out: Record<string, JsonAttr> = {};
  for (const a of attrs) {
    const key = a.tag.replace(",", "").toUpperCase();
    if (a.vr === "SQ") out[key] = { vr: "SQ", Value: (a.items ?? []).map(toDicomJson) };
    else if (!a.value) out[key] = { vr: a.vr };
    else if (a.vr === "PN") {
      const [alphabetic, ideographic, phonetic] = a.value.split("=");
      out[key] = { vr: "PN", Value: [{ ...(alphabetic ? { Alphabetic: alphabetic } : {}), ...(ideographic ? { Ideographic: ideographic } : {}), ...(phonetic ? { Phonetic: phonetic } : {}) }] };
    } else if (a.vr === "US" || a.vr === "DS") out[key] = { vr: a.vr, Value: a.value.split("\\").map(Number) };
    else out[key] = { vr: a.vr, Value: a.value.split("\\") };
  }
  return out;
}

/** Orthanc's REST API (POST /worklists/create) takes {"Tags": {keyword: value}}; sequences as arrays of objects. */
export function toOrthancTags(attrs: DicomAttr[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attrs) {
    if (a.vr === "SQ") out[a.keyword] = (a.items ?? []).map(toOrthancTags);
    else if (a.value) out[a.keyword] = a.value;
  }
  return out;
}
