import { describe, expect, it } from "vitest";
import { matchesTemplate, templateOfNote, templateOptions, templateStamp } from "./record-filter";
import type { HistoryEntry, NoteEntry } from "./types";
const templates = [{ id: "rec-ic", name: "ICの記録" }, { id: "own", name: "自分用" }];
const note = (text: string, extra: Partial<NoteEntry> = {}): NoteEntry => ({ kind: "note", day: 0, time: "10:00", author: "医師", role: "医師", text, ...extra });
describe("テンプレートの印と古い記事", () => {
  it("保存された印を優先し、削除・改名後も保存された名前を返す", () => {
    expect(templateOfNote(note("【ICの記録】", { templateId: "deleted", templateName: "保存した名前" }), templates)).toEqual({ id: "deleted", name: "保存した名前" });
    expect(templateOfNote(note("修正済み", { templateId: "rec-ic" }), templates)).toEqual(templates[0]);
  });
  it("古い記事は先頭の見出しだけを照合し、本文中の引用や似た名前は拾わない", () => {
    expect(templateOfNote(note("【ICの記録】\n説明"), templates)).toEqual(templates[0]);
    expect(templateOfNote(note("引用\n【ICの記録】"), templates)).toBeNull();
    expect(templateOfNote(note("【ICの記録】の引用"), templates)).toBeNull();
    expect(templateOfNote(note("【自分用】\n本文"), templates)).toEqual(templates[1]);
    expect(templateStamp(note("【自分用】\n本文"), templates)).toEqual({ templateId: "own", templateName: "自分用" });
  });
  it("0件を出さず新旧を合算し、複数選択はOR、ほかの条件との組合せはANDにできる", () => {
    const a = note("【ICの記録】");
    const b = note("修正後", { templateId: "rec-ic", templateName: "ICの記録" });
    expect(templateOptions([a, b, note("普通")], templates)).toEqual([{ ...templates[0], count: 2 }]);
    expect(matchesTemplate(a, templates, [], false)).toBe(true);
    expect(matchesTemplate(note("普通"), templates, [], true)).toBe(false);
    expect(matchesTemplate(a, templates, ["own"], false)).toBe(false);
    expect(matchesTemplate(a, templates, ["own", "rec-ic"], false)).toBe(true);
    expect([a, { ...b, role: "看護師" as const }].filter((e) => e.role === "医師" && matchesTemplate(e, templates, ["rec-ic"], false))).toEqual([a]);
  });
});

import { matchesRecordFacets, recordFacetOptions } from "./record";
import { STAFF } from "./roles";
const nurse: HistoryEntry = { kind: "note", day: 0, time: "09:00", author: STAFF.看護師.name, role: "看護師", text: "観察" };
const order: HistoryEntry = { kind: "order", id: "o", day: 0, time: "10:00", author: STAFF.医師.name, status: "中止", order: { type: "lab", codes: [], collect: { day: 0, time: "11:00" }, priority: "定時" } };
describe("記載の科・職種フィルター", () => {
  it("未選択は全件、項目内はOR、項目間はAND（中止判定は既存のまま）", () => {
    expect(matchesRecordFacets(nurse, "総合診療科", [], [])).toBe(true);
    expect(matchesRecordFacets(nurse, "総合診療科", ["総合診療科", "循環器内科"], ["医師", "看護師"])).toBe(true);
    expect(matchesRecordFacets(nurse, "総合診療科", ["循環器内科"], ["看護師"])).toBe(false);
    expect(matchesRecordFacets(nurse, "総合診療科", [], ["薬剤師"])).toBe(false);
    expect(matchesRecordFacets(order, "循環器内科", ["循環器内科"], ["医師"])).toBe(true);
  });
  it("受診の科も含め、存在する候補のみ重複なく返す", () => {
    expect(recordFacetOptions([{ entry: nurse, department: "総合診療科" }, { entry: nurse, department: "総合診療科" }, { entry: order, department: "循環器内科" }])).toEqual({ departments: ["循環器内科", "総合診療科"], roles: ["医師", "看護師"] });
    expect(recordFacetOptions([])).toEqual({ departments: [], roles: [] });
  });
});

it("記事に挿入したテンプレートは前に記載があっても印を残し、本文を消したら残さない", () => {
  const stamp = { templateId: "own", templateName: "自分用" };
  expect(templateStamp(note("前の記載\n【自分用】\n説明"), templates, stamp)).toEqual(stamp);
  expect(templateStamp(note("すべて書き直した"), templates, stamp)).toEqual({});
});
