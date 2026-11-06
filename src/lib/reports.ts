// レポート（読影レポート・病理・内視鏡・生理検査の報告書）を、カルテの一つの一覧にまとめる。
// 放射線部（ris.ts）・生理検査室（physio-desk.ts）・内視鏡室（endoscopy.ts）・病理（pathology.ts）が確定した報告と、
// 入院前からある架空の画像検査（Patient.imaging）を、同じ形（見出しと本文）に揃える。どれが未読かは、
// 「未確認の結果」と同じ既読の記録（results.ts の Ack、キーも同じ）で決める。要約は本文の1行目を切り出すだけ
// （AI で要約しない）。並び・数・切り出しはコードで行い、読んだかどうかは医師が「確認した」で残す。

import { findPhysio, findRegion } from "./exams";
import { caseTitle, versionOf as pathVersion, type PathCase } from "./pathology";
import { versionOf as endoVersion, type EndoDesk } from "./endoscopy";
import { valuesLine, versionOf as physioVersion, type PhysioDesk } from "./physio-desk";
import type { Ack } from "./results";
import { reportVersion, type RisDesk } from "./ris";
import type { DayOffset, HistoryEntry, ImagingStudy, OrderEntry } from "./types";

export type ReportKind = "画像" | "病理" | "内視鏡" | "生理";

export interface Moment {
  day: DayOffset;
  time: string;
}

/** One block of a report under its heading (所見・診断・推奨 …). */
export interface ReportSection {
  label: string;
  text: string;
}

export interface Report {
  /** The same key as the result item (results.ts), so one 確認 serves both. */
  key: string;
  patientId: string;
  kind: ReportKind;
  /** The order this report answers (the mark on the order row). A pathology case made from the panel has none. */
  orderId?: string;
  /** 検査名（例：CT　腹部・骨盤　単純＋造影）. */
  title: string;
  /** 部位. */
  region?: string;
  /** 検査日時（撮影・実施）. */
  examAt?: Moment;
  /** 報告の日時. */
  at: Moment;
  /** 読影医・報告医. */
  by: string;
  version: number;
  /** Why this version replaced the one before. */
  reason?: string;
  sections: ReportSection[];
  /** The study to open in the PACS viewer (the order id, or the study id). */
  imageOf?: string;
  /** The pathologist marked it as needing a direct word with the attending. */
  important?: boolean;
}

// ---------------------------------------------------------------------------
// 出典と、架空の病院の取り決め
// ---------------------------------------------------------------------------

export const REPORT_SOURCES = {
  items: {
    label: "日本医学放射線学会 電子情報委員会「次世代の画像診断に向けた 画像診断報告書に関する提言」Ver.001.221005（2022年3月10日公開）1-2 画像診断報告書の記載項目：患者基本情報欄・検査目的欄（依頼医）・所見欄（検査内容、画像に表示された異常と正常、比較に用いた過去検査）・診断欄（診断、解釈、鑑別疾患、推奨される次検査）",
    url: "https://www.radiology.jp/content/files/画像診断報告書に関する提言Ver.001.221005.pdf",
  },
  check: {
    label: "日本医学放射線学会「画像診断報告書の確認不足等に関する医療安全対策についての見解」（平成30年7月19日）：画像診断報告書を必ずチェックする仕組みを電子カルテあるいは PACS 上で構築することが求められる",
    url: "https://www.radiology.jp/content/files/kenkai_20180719.pdf",
  },
};

export const REPORT_RULES = {
  headings: "見出しは提言の所見欄・診断欄に合わせ、「推奨される次検査」は「推奨」として分けて出します。病理・内視鏡・生理検査の報告は、それぞれの部門の見出し（病理診断・所見・コメント、所見・診断、測定値・所見・まとめ）のままです。",
  unread: "レポートは報告医が確定するとカルテに出ます。開いただけでは既読になりません。「確認した」を押すと、誰がいつ確認したかが残ります（未確認の結果と同じ記録）。前日までのレポートは前の記録として既読に数えます。",
  summary: "一覧の一言は、本文（最初の見出しの文）の1行目を切り出しただけです。AI による要約ではありません。",
};

// ---------------------------------------------------------------------------
// Headings in a report written as one text
// ---------------------------------------------------------------------------

/**
 * A report kept as one string (the fictional studies of Patient.imaging, the PACS viewer's text) marks its
 * headings as 【診断】【推奨】; the text before the first heading is the 所見.
 */
export function sectionsOf(text: string): ReportSection[] {
  const out: ReportSection[] = [];
  for (const part of text.split(/(?=【[^】\n]{1,8}】)/)) {
    const m = /^【([^】\n]+)】\s*([\s\S]*)$/.exec(part);
    const label = m ? m[1] : "所見";
    const body = (m ? m[2] : part).trim();
    if (body) out.push({ label, text: body });
  }
  return out;
}

/** The one line a list shows: the first line of the first section (no summarising). */
export const summaryOf = (r: Pick<Report, "sections">): string => r.sections[0]?.text.split(/\n/)[0].trim() ?? "";

// ---------------------------------------------------------------------------
// The reports of one patient
// ---------------------------------------------------------------------------

export interface ReportSources {
  ris?: RisDesk;
  physio?: PhysioDesk;
  pathology?: PathCase[];
  endo?: EndoDesk;
}

const minutes = (m: Moment) => m.day * 1440 + Number(m.time.slice(0, 2) || 0) * 60 + Number(m.time.slice(3) || 0);

const orderOf = (entries: readonly HistoryEntry[], id: string): OrderEntry | undefined => entries.find((e): e is OrderEntry => e.kind === "order" && e.id === id);

/** A pathology case made from an endoscopic biopsy carries the endoscopy's order id (endoscopy.ts biopsyCase). */
const ENDO_CASE = "path-endo-";

/** Every report of a patient, newest first. */
export function reportsOf(patient: { id: string; imaging: ImagingStudy[] }, entries: readonly HistoryEntry[], src: ReportSources): Report[] {
  const out: Report[] = [];
  for (const s of patient.imaging) {
    if (s.pending) continue;
    const at = { day: s.day, time: s.time ?? "" };
    out.push({ key: `img|${s.id}`, patientId: patient.id, kind: "画像", title: `${s.modality}　${s.region}`, region: s.region, examAt: at, at, by: s.reader, version: 1, sections: sectionsOf(s.report), imageOf: s.id });
  }
  for (const w of Object.values(src.ris ?? {})) {
    if (w.patientId !== patient.id || !w.report) continue;
    const r = w.report;
    const o = orderOf(entries, w.orderId)?.order;
    const region = o?.type === "imaging" ? (findRegion(o.region)?.name ?? o.region) : undefined;
    out.push({
      key: `ris|${w.orderId}|v${reportVersion(w)}`,
      patientId: patient.id,
      kind: "画像",
      orderId: w.orderId,
      title: w.label,
      region,
      examAt: w.done ? { day: w.done.day, time: w.done.time } : undefined,
      at: { day: r.day, time: r.time },
      by: r.by,
      version: reportVersion(w),
      reason: r.reason,
      sections: [{ label: "所見", text: r.findings }, { label: "診断", text: r.impression }, ...(r.recommendation ? [{ label: "推奨", text: r.recommendation }] : [])],
      imageOf: w.orderId,
    });
  }
  for (const w of Object.values(src.physio ?? {})) {
    if (w.patientId !== patient.id || !w.report) continue;
    const r = w.report;
    const values = valuesLine(w.test, r.values);
    out.push({
      key: `phy|${w.orderId}|v${physioVersion(w)}`,
      patientId: patient.id,
      kind: "生理",
      orderId: w.orderId,
      title: findPhysio(w.test)?.name ?? w.test,
      examAt: w.done ? { day: w.done.day, time: w.done.time } : undefined,
      at: { day: r.day, time: r.time },
      by: r.by,
      version: physioVersion(w),
      reason: r.reason,
      sections: [...(values ? [{ label: "測定値", text: values }] : []), { label: "所見", text: r.findings }, { label: "まとめ", text: r.conclusion }],
    });
  }
  for (const w of Object.values(src.endo?.works ?? {})) {
    if (w.patientId !== patient.id || !w.report) continue;
    const r = w.report;
    out.push({
      key: `endo|${w.orderId}|v${endoVersion(w)}`,
      patientId: patient.id,
      kind: "内視鏡",
      orderId: w.orderId,
      title: findPhysio(w.test)?.name ?? w.test,
      examAt: w.done ? { day: w.done.day, time: w.done.start } : undefined,
      at: { day: r.day, time: r.time },
      by: r.by,
      version: endoVersion(w),
      reason: r.reason,
      sections: [{ label: "所見", text: r.findings }, { label: "診断", text: `${r.diagnosis}${w.done?.biopsy ? `\n生検 ${w.done.biopsy}個（病理へ）` : ""}` }],
    });
  }
  for (const c of src.pathology ?? []) {
    if (c.patientId !== patient.id || !c.report) continue;
    const r = c.report;
    out.push({
      key: `path|${c.id}|v${pathVersion(c)}`,
      patientId: patient.id,
      kind: "病理",
      orderId: c.id.startsWith(ENDO_CASE) ? c.id.slice(ENDO_CASE.length) : undefined,
      title: `${caseTitle(c)}${c.received ? `　${c.received.number}` : ""}`,
      region: c.site,
      examAt: c.received ? { day: c.received.day, time: c.received.time } : undefined,
      at: { day: r.day, time: r.time },
      by: r.by,
      version: pathVersion(c),
      reason: r.reason,
      important: r.important,
      sections: [{ label: "病理診断", text: r.diagnosis }, ...(r.findings ? [{ label: "所見", text: r.findings }] : []), ...(r.comment ? [{ label: "コメント", text: r.comment }] : [])],
    });
  }
  return out.sort((a, b) => minutes(b.at) - minutes(a.at) || a.key.localeCompare(b.key));
}

/** The reports on one order (an endoscopy may carry its own report and the biopsy's pathology). */
export const reportsForOrder = (reports: readonly Report[], orderId: string): Report[] => reports.filter((r) => r.orderId === orderId);

/** The reports (from today on) the doctor has not marked as seen — the same rule as results.ts unseen. */
export const unreadReports = (reports: readonly Report[], acks: Record<string, Ack>): Report[] => reports.filter((r) => r.at.day >= 0 && !acks[r.key]);

/** How a report stands for the reader: not yet seen, seen (by whom, when), or from before today. */
export type ReadState = { state: "未読" } | { state: "確認済み"; ack: Ack } | { state: "前の記録" };
export function readStateOf(r: Pick<Report, "key" | "at">, acks: Record<string, Ack>): ReadState {
  const ack = acks[r.key];
  if (ack) return { state: "確認済み", ack };
  return r.at.day >= 0 ? { state: "未読" } : { state: "前の記録" };
}

// ---------------------------------------------------------------------------
// The ward's list: by patient, the ones with unread reports first
// ---------------------------------------------------------------------------

export interface WardReportRow {
  patientId: string;
  name: string;
  room: string;
  reports: Report[];
  unread: number;
}

export function wardReportRows(people: readonly { patient: { id: string; name: string; imaging: ImagingStudy[] }; room: string; entries: readonly HistoryEntry[] }[], src: ReportSources, acks: Record<string, Ack>): WardReportRow[] {
  return people
    .map((x) => {
      const reports = reportsOf(x.patient, x.entries, src);
      return { patientId: x.patient.id, name: x.patient.name, room: x.room, reports, unread: unreadReports(reports, acks).length };
    })
    .filter((r) => r.reports.length > 0)
    .sort((a, b) => b.unread - a.unread || a.room.localeCompare(b.room));
}
