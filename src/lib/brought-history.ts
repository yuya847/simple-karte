// 持参薬 in the record (経過): one 【持参薬】 card for each 持参薬鑑別, at the time the pharmacist confirmed it
// against the drugs brought in, with one line per drug (name, strength, 1回量, usage, days left, how it
// matches the hospital's drugs, and the doctor's choice). The doctor's choices make a new version of the
// same card; the earlier versions are kept. A nurse or doctor may take the notebook in first (a draft for
// the pharmacist); a draft is not in the record. All of it is code: Claude only copied the notebook.

import { findOralDrug } from "./master";
import { daysOfCount, type BroughtReport, type BroughtRow } from "./pharmacy";
import type { DayOffset } from "./types";

/** How a drug of the notebook matches the hospital's (by code: the same product, the same ingredient and strength under another product, or none). */
export type MatchKind = "同じ" | "同じ成分の別の製品" | "院内にない";

const bare = (s: string) => s.normalize("NFKC").replace(/「.*?」/g, "").replace(/\s/g, "").toLowerCase();
const maker = (s: string) => /「(.*?)」/.exec(s.normalize("NFKC"))?.[1] ?? "";

export function matchKind(row: Pick<BroughtRow, "said" | "strength" | "match">): MatchKind {
  if (!row.match) return "院内にない";
  const d = findOralDrug(row.match);
  if (!d) return "同じ成分の別の製品";
  // The notebook names the hospital's own item (its name, and the same maker's 「…」 if any) → 同じ; a brand, another form or maker → 別の製品.
  const written = `${row.said}${row.strength}`;
  return (bare(written).includes(bare(d.name)) || bare(row.said).includes(bare(d.name))) && maker(written) === maker(d.name) ? "同じ" : "同じ成分の別の製品";
}

export type DecisionShort = "継続" | "切替" | "中止" | "まだ";
const SHORT: Record<NonNullable<BroughtRow["decision"]>, DecisionShort> = { 持参薬で継続: "継続", 院内の薬に切替: "切替", 中止: "中止" };
export const decisionShort = (d: BroughtRow["decision"]): DecisionShort => (d ? SHORT[d] : "まだ");

/** One drug of the card. */
export interface BroughtLine {
  name: string;
  strength: string;
  /** 1回量 ("1錠", or "？" when the notebook does not say). */
  dose: string;
  usage: string;
  /** 残り: the days the counted drug lasts (code), or "—" when it was not counted. */
  left: string;
  match: MatchKind;
  /** The hospital's item (code) it matched, if any. */
  hospital: string | null;
  decision: DecisionShort;
}

/** The usage as written (the typed notebook), or made from the timings and the days written. */
export function usageText(r: Pick<BroughtRow, "usage" | "timings" | "prn" | "daysLeft">): string {
  const base = r.usage ?? (r.timings.length ? `1日${r.timings.length}回 ${r.timings.join("・")}` : `頓用${r.prn ? ` ${r.prn}` : ""}`);
  return r.daysLeft && !base.includes(`${r.daysLeft}日分`) ? `${base}　${r.daysLeft}日分` : base;
}

export function broughtLines(rows: readonly BroughtRow[]): BroughtLine[] {
  return rows.map((r) => {
    const days = daysOfCount(r);
    return {
      name: r.said,
      strength: r.strength,
      dose: r.amount === null ? "？" : `${r.amount}${r.unit}`,
      usage: usageText(r),
      left: days ? `${days.days}日分` : "—",
      match: matchKind(r),
      hospital: r.match,
      decision: decisionShort(r.decision),
    };
  });
}

export interface BroughtVersion {
  at: { day: DayOffset; time: string };
  by: string;
  role: string;
  /** 鑑別: the pharmacist confirmed the drugs. 医師の判断: the doctor chose for each. */
  kind: "鑑別" | "医師の判断";
  rows: BroughtRow[];
}

/** The versions of a report; one kept before versions were recorded has its 鑑別 as the only one. */
export function versionsOf(r: BroughtReport): BroughtVersion[] {
  return r.versions?.length ? r.versions : [{ at: { day: r.day ?? 0, time: r.at }, by: r.by, role: "薬剤師", kind: "鑑別", rows: r.rows }];
}

/** A new version (the earlier ones stay); the report's rows become the new version's. */
export function withVersion(r: BroughtReport, v: BroughtVersion): BroughtReport {
  return { ...r, rows: v.rows, versions: [...versionsOf(r), v] };
}

interface Who {
  id: string;
  name: string;
  role: string;
  at: { day: DayOffset; time: string };
}

/** What the screen hands over: the rows, and where they came from. */
export interface BroughtInput {
  patientId: string;
  rows: BroughtRow[];
  comment?: string;
  /** The photos of the notebook kept in the patient's 文書 (スキャン取込, type お薬手帳). */
  scanIds?: string[];
  /** The draft (taken in by a nurse or doctor) this 鑑別 finishes. */
  draftId?: string;
}

const union = (a: readonly string[] = [], b: readonly string[] = []) => [...new Set([...a, ...b])];

/**
 * A nurse or doctor took the notebook in (photos read into rows): a draft for the pharmacist, not in the record.
 * The same draft is updated while it is still a draft.
 */
export function draftBrought(reports: readonly BroughtReport[], input: BroughtInput, who: Who): BroughtReport[] {
  const old = reports.find((r) => r.id === input.draftId && r.status === "鑑別中");
  const draft: BroughtReport = {
    id: old?.id ?? who.id,
    patientId: input.patientId,
    rows: input.rows.map((r) => ({ ...r, checked: false })),
    by: who.name,
    at: who.at.time,
    day: who.at.day,
    status: "鑑別中",
    scanIds: union(old?.scanIds, input.scanIds),
    takenBy: { name: who.name, role: who.role, at: who.at },
  };
  return old ? reports.map((r) => (r.id === old.id ? draft : r)) : [...reports, draft];
}

/** The pharmacist confirmed every row against the drugs brought in (確定): the report goes to the doctor and into the record. */
export function confirmBrought(reports: readonly BroughtReport[], input: BroughtInput, who: Who): BroughtReport[] {
  const draft = reports.find((r) => r.id === input.draftId && r.status === "鑑別中" && r.patientId === input.patientId);
  const report: BroughtReport = {
    id: draft?.id ?? who.id,
    patientId: input.patientId,
    rows: input.rows,
    by: who.name,
    at: who.at.time,
    day: who.at.day,
    status: "医師へ報告",
    ...(input.comment ? { comment: input.comment } : {}),
    scanIds: union(draft?.scanIds, input.scanIds),
    ...(draft?.takenBy ? { takenBy: draft.takenBy } : {}),
    versions: [{ at: who.at, by: who.name, role: who.role, kind: "鑑別", rows: input.rows }],
  };
  return draft ? reports.map((r) => (r.id === draft.id ? report : r)) : [...reports, report];
}

/** The doctor's choices for each drug: a new version of the same report (the 鑑別 stays as it was). */
export function decideBrought(r: BroughtReport, rows: BroughtRow[], status: BroughtReport["status"], who: Omit<Who, "id">): BroughtReport {
  return withVersion({ ...r, status }, { at: who.at, by: who.name, role: who.role, kind: "医師の判断", rows });
}

/** A 【持参薬】 card of the record. */
export interface BroughtCard {
  id: string;
  /** When the 鑑別 was confirmed (where the card stands in the record). */
  day: DayOffset;
  time: string;
  versions: BroughtVersion[];
  latest: BroughtVersion;
  lines: BroughtLine[];
  comment?: string;
  /** Photos of the notebook still kept in the 文書. */
  scanIds: string[];
  takenBy?: BroughtReport["takenBy"];
}

/** The cards of a patient: every confirmed 鑑別 (drafts are not records yet), in time order. */
export function broughtCards(reports: readonly BroughtReport[], patientId: string, kept?: ReadonlySet<string>): BroughtCard[] {
  return reports
    .filter((r) => r.patientId === patientId && r.status !== "鑑別中")
    .map((r) => {
      const versions = versionsOf(r);
      const first = versions[0];
      const latest = versions[versions.length - 1];
      return {
        id: r.id,
        day: first.at.day,
        time: first.at.time,
        versions,
        latest,
        lines: broughtLines(latest.rows),
        ...(r.comment ? { comment: r.comment } : {}),
        scanIds: (r.scanIds ?? []).filter((id) => !kept || kept.has(id)),
        ...(r.takenBy ? { takenBy: r.takenBy } : {}),
      };
    })
    .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

/** The words a search of the record looks in. */
export const broughtSearchText = (c: BroughtCard) => ["持参薬", c.latest.by, c.comment ?? "", ...c.lines.flatMap((l) => [l.name, l.strength, l.usage, l.match, l.decision])].join(" ");
