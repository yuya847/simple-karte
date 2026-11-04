import { describe, expect, it } from "vitest";
import { accessChoices, accessCsv, accessRows, emptyAccessQuery, isBreakGlass, isChartOpen, isRestricted } from "./access-log";
import type { AuditEvent } from "./audit";
import { csvOf, toCsv } from "./extract";

const ev = (seq: number, e: Partial<AuditEvent>): AuditEvent => ({ seq, at: "09:00:00", date: "2026-11-04", role: "医師", actor: "山本（専攻医）", action: "カルテを開いた", ...e });

const log: AuditEvent[] = [
  ev(1, { patient: "佐倉 修" }),
  ev(2, { action: "確定（記事）", patient: "佐倉 修" }),
  ev(3, { role: "薬剤師", actor: "薬剤師 小林", action: "閲覧制限の患者を選んだ（理由の入力へ）", patient: "森 久美子", restricted: true }),
  ev(4, { role: "薬剤師", actor: "薬剤師 小林", action: "閲覧制限の患者を開いた（薬剤・検査・栄養・退院支援などの業務）", patient: "森 久美子", detail: "持参薬の鑑別", restricted: true }),
  ev(5, { actor: "研修医 田中", patient: "森 久美子", detail: "閲覧制限の患者（担当チームとして）", restricted: true, date: "2026-11-03" }),
  ev(6, { role: "看護師", actor: "看護師 佐藤", action: "受診の画面を開いた", patient: "救急 太郎" }),
];

describe("アクセスログ（カルテを開いた記録）", () => {
  it("keeps only chart opens, newest first", () => {
    expect(isChartOpen(log[1])).toBe(false);
    expect(accessRows(log, emptyAccessQuery()).map((e) => e.seq)).toEqual([6, 5, 4, 3, 1]);
  });

  it("narrows by patient, person, day and limited charts", () => {
    expect(accessRows(log, { ...emptyAccessQuery(), patient: "森 久美子" }).map((e) => e.seq)).toEqual([5, 4, 3]);
    expect(accessRows(log, { ...emptyAccessQuery(), actor: "薬剤師 小林" }).map((e) => e.seq)).toEqual([4, 3]);
    expect(accessRows(log, { ...emptyAccessQuery(), date: "2026-11-03" }).map((e) => e.seq)).toEqual([5]);
    expect(accessRows(log, { ...emptyAccessQuery(), onlyRestricted: true }).map((e) => e.seq)).toEqual([5, 4, 3]);
  });

  it("marks the limited ones, and the ones opened with a reason", () => {
    expect(log.filter(isRestricted).map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(log.filter(isBreakGlass).map((e) => e.seq)).toEqual([4]);
  });

  it("the choices come from the opens there are (days newest first)", () => {
    const c = accessChoices(log);
    expect(c.patients).toContain("森 久美子");
    expect(c.patients).not.toContain(undefined);
    expect(c.actors).toEqual(expect.arrayContaining(["山本（専攻医）", "薬剤師 小林", "研修医 田中", "看護師 佐藤"]));
    expect(c.dates).toEqual(["2026-11-04", "2026-11-03"]);
  });

  it("CSV: BOM, header, oldest first, the mark, and no cell read as a formula", () => {
    const csv = accessCsv([...accessRows(log, emptyAccessQuery()), ev(7, { patient: "=HYPERLINK(1)", detail: "-1+2" })]);
    expect(csv.startsWith('﻿"番号","日付","時刻","職種","誰が","何を","患者","内容","閲覧制限"\r\n')).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(7);
    expect(lines[1].startsWith('"1","2026-11-04","09:00:00","医師","山本（専攻医）","カルテを開いた"')).toBe(true);
    expect(lines.find((l) => l.startsWith('"4"'))).toContain('"理由を残して開いた"');
    expect(lines.find((l) => l.startsWith('"5"'))).toContain('"閲覧制限の患者"');
    expect(lines[6]).toContain(`"'=HYPERLINK(1)"`);
    expect(lines[6]).toContain(`"'-1+2"`);
  });

  it("the shared CSV helper gives the same as before for the data extract", () => {
    expect(csvOf(["a", "b"], [[1, 'x "y"']])).toBe('﻿"a","b"\r\n"1","x ""y"""\r\n');
    expect(toCsv([]).startsWith('﻿"ID","氏名"')).toBe(true);
  });
});
