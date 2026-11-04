import { describe, expect, it } from "vitest";
import { composeStandingText, splitStandingText, STANDING_CHOICES, worksheetPrnLines } from "./standing-form";
import { HOSPITAL_LINE_TEMPLATES, linesFromFields, lineChanges, stopLine, type StandingLine } from "./standing-lines";
import { changeKey, type WorkPatient } from "./worksheet";
import { emptyStanding } from "./standing";
import type { Patient } from "./types";

const person: WorkPatient = { patient: { id: "p", name: "架空 花子" } as Patient, room: "501", entries: [] };
const line: StandingLine = { id: "new", cat: "頓用", text: "不眠時は医師へ連絡", start: { day: 0, time: "10:00" }, by: "架空 医師", at: { day: 0, time: "09:00" } };
const key = changeKey(line.id, "新規");
describe("指示簿の入力と看護師への接続", () => {
  it("選択肢とコメントを組み、修正時に元の欄に戻す", () => {
    const text = composeStandingText(" 一部介助 ", " 移乗時は見守り\n夜間は全介助 ");
    expect(text).toBe("一部介助\n移乗時は見守り\n夜間は全介助");
    expect(splitStandingText("ADL", text)).toEqual({ choice: "一部介助", comment: "移乗時は見守り\n夜間は全介助" });
    expect(splitStandingText("観察", text)).toEqual({ choice: "", comment: text });
    expect(composeStandingText("", " \n ")).toBe("");
    expect(STANDING_CHOICES.安静).toContain("院内フリー");
  });
  it("開始前と未受けの頓用を出さず、指示受け後に自由文のまま出す", () => {
    expect(worksheetPrnLines([line], person, 599, { [key]: "受けた" }, new Set([key]))).toEqual([]);
    expect(worksheetPrnLines([line], person, 600, {}, new Set([key]))).toEqual([]);
    expect(worksheetPrnLines([line], person, 600, { [key]: "受けた" }, new Set([key]))[0].text).toBe(line.text);
    expect(worksheetPrnLines([line], person, 600, {}, new Set())).toHaveLength(1);
  });
  it("終了時刻と中止を反映し、変更は指示受けに残す", () => {
    expect(worksheetPrnLines([{ ...line, end: { day: 0, time: "10:01" } }], person, 602, {}, new Set())).toEqual([]);
    const stopped = stopLine([line], line.id, { day: 0, time: "10:01", by: "架空 医師", reason: "変更" });
    expect(worksheetPrnLines(stopped, person, 602, {}, new Set())).toEqual([]);
    const changes = lineChanges([person], { p: stopped }, new Set(), 0, 602, String);
    expect(changes.map((c) => c.key)).toEqual([key, changeKey(line.id, "中止")]);
  });
  it("条件付き指示も一覧に残り、版を変えたときだけ前の行を閉じる", () => {
    const first = { ...emptyStanding("架空 医師", { day: -1, time: "09:00" }), conds: [{ id: "c", source: "lab" as const, item: "K", op: "<" as const, value: 4, action: "医師へ連絡", callDoctor: true }] };
    const next = { ...first, at: { day: 0, time: "09:00" }, conds: [] };
    expect(linesFromFields([first, next])).toEqual([expect.objectContaining({ cat: "呼出基準", end: next.at, fromFields: true })]);
    expect(first.conds).toHaveLength(1);
  });
  it("解熱の例は添付文書の回数を採り、未指定の睡眠薬を作らない", () => {
    expect(HOSPITAL_LINE_TEMPLATES.find((t) => t.id === "h-prn-fever")?.text).toContain("1日2回まで");
    expect(HOSPITAL_LINE_TEMPLATES.find((t) => t.id === "h-prn-sleep")?.text).toContain("医師に連絡");
  });
});
