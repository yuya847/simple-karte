import { describe, expect, it } from "vitest";
import { barMark, changeLine, currentLines, lineChanges, linesFromFields, pastLines, stopLine, type StandingLine } from "./standing-lines";
import { lineEffective } from "./standing-calendar";
import { emptyStanding, standingEffective } from "./standing";
import { effectiveFields, endStandingField } from "./standing-field-end";
import { fieldChangeText, lineChangeText } from "./standing-history";
import { syncStandingCosign, markStandingTake } from "./standing-cosign";
import { standingTakeLines } from "./admission-orders";
import { takeRows } from "./order-take";
import type { WorkPatient } from "./worksheet";

const line: StandingLine = { id: "a", cat: "安静", text: "ベッド上", start: { day: -2 }, at: { day: -2, time: "09:00" }, by: "研修医 田中" };
const at = { day: 0, time: "13:20" };
const person = { patient: { id: "p", name: "架空 花子" }, room: "501", entries: [] } as unknown as WorkPatient;

describe("指示の変更と終了", () => {
  it("元の行を時刻で閉じ、同じカテゴリの新しい行と結ぶ（入力を変えない）", () => {
    const input = [structuredClone(line)];
    const result = changeLine(input, "a", { text: " 車いす ", start: at }, line.by, at, " 離床のため ");
    expect(input).toEqual([line]);
    const [old, next] = result.lines;
    expect(old.end).toEqual(at);
    expect(old.changed).toEqual({ ...at, by: line.by, toId: result.newId, reason: "離床のため" });
    expect(old.stop).toBeUndefined();
    expect(next).toMatchObject({ id: result.newId, cat: "安静", text: "車いす", changedFrom: "a", start: at });
    expect(currentLines(result.lines)).toEqual([next]);
    expect(pastLines(result.lines)).toEqual([old]);
    expect(lineEffective(old, 0, "13:19")).toBe(true);
    expect(lineEffective(old, 0, "13:20")).toBe(false);
    expect(lineEffective(next, 0, "13:20")).toBe(true);
    expect(barMark(old, 0, 3)).toBe("changed");
    expect(barMark(old, 1, 3)).toBeNull();
    expect(lineChangeText(input, { ...next, changeReason: "離床のため" })).toContain("ベッド上 → 車いす（理由：離床のため）");
  });
  it("中止済み・変更済み・項目由来・期間外・空文の変更を拒む", () => {
    for (const old of [{ ...line, stop: { ...at, by: line.by } }, { ...line, changed: { ...at, by: line.by, toId: "b" } }, { ...line, fromFields: true as const }, { ...line, end: { day: -1 } }]) {
      const input = [old];
      expect(changeLine(input, "a", { text: "車いす", start: at }, line.by, at)).toEqual({ lines: input, newId: "" });
    }
    expect(changeLine([line], "a", { text: " ", start: at }, line.by, at).newId).toBe("");
  });
  it("矢印・開始・途中・予定終了・中止・終了を区別する", () => {
    expect(barMark(line, -2, 3)).toBe("start");
    expect(barMark(line, 0, 3)).toBe("mid");
    expect(barMark(line, 3, 3)).toBe("arrow");
    expect(barMark({ ...line, end: { day: 2 } }, 2, 3)).toBe("end");
    expect(barMark({ ...line, end: { day: 8 } }, 3, 3)).toBe("arrow");
    const stopped = stopLine([line], "a", { ...at, by: line.by, reason: "完了", kind: "終了" });
    expect(barMark(stopped[0], 0, 3)).toBe("end");
    expect(stopped[0].stop).toMatchObject({ kind: "終了", reason: "完了" });
    expect(barMark(stopLine([line], "a", { ...at, by: line.by })[0], 0, 3)).toBe("stop");
  });
  it("指示受けと研修医の確認に変更・終了を載せる", () => {
    const changed = changeLine([line], "a", { text: "車いす", start: at }, line.by, at, "離床");
    const notices = lineChanges([person], { p: changed.lines }, new Set(["a"]), 0, 801, String);
    expect(notices).toHaveLength(1);
    expect(notices[0].text.main).toContain("【変】指示を変更");
    expect(notices[0].text.detail).toContain("理由：離床");
    const cosigns = syncStandingCosign([], {}, { p: changed.lines });
    expect(cosigns.some((c) => c.text.includes("【変】"))).toBe(true);
    const rows = markStandingTake(takeRows(notices, [person], { y: 2026, m: 11, d: 5 }), cosigns);
    expect(rows[0].flags.resident).toContain("確認待ち");
    const ended = stopLine([line], "a", { ...at, by: line.by, kind: "終了" });
    expect(lineChanges([person], { p: ended }, new Set(["a"]), 0, 801, String)[0].text.main).toContain("終了");
    expect(syncStandingCosign([], {}, { p: ended }).at(-1)?.text).toContain("終了");
  });
  it("項目の版の変更も前後を結び、理由を載せる", () => {
    const first = { ...emptyStanding(line.by, line.at), rest: "ベッド上" as const };
    const next = { ...first, rest: "車いす" as const, at, reason: "離床" };
    const rows = linesFromFields([first, next]);
    expect(rows[0].changed?.toId).toBe(rows[1].id);
    expect(rows[1].changedFrom).toBe(rows[0].id);
    expect(rows[1].changeReason).toBe("離床");
    expect(fieldChangeText([first], next)).toContain("ベッド上 → 安静度：車いす（理由：離床）");
    const queue = standingTakeLines({ p: [first, next] }, {});
    const notices = lineChanges([person], queue, new Set(), 0, 801, String);
    expect(notices[0].text.main).toContain("ベッド上 → 安静度：車いす");
    expect(takeRows(notices, [person], { y: 2026, m: 11, d: 5 })[0].kind).toBe("変更");
  });
  it("項目ごとの予定終了は他の項目を終了せず、その時刻まで有効", () => {
    const first = { ...emptyStanding(line.by, line.at), rest: "ベッド上" as const, bath: "清拭" as const };
    const original = linesFromFields([first])[0];
    const next = endStandingField(first, original, 1, "完了", line.by, "13:20");
    expect(first.fieldEnds).toBeUndefined();
    expect(effectiveFields(next, 1, "13:19").rest).toBe("ベッド上");
    expect(effectiveFields(next, 1, "13:20").rest).toBeNull();
    expect(standingEffective(next, 1)?.bath).toBe("清拭");
    const rows = linesFromFields([first, { ...next, at }]);
    expect(rows.filter((l) => l.cat === "安静")).toHaveLength(1);
    expect(rows[0].stop).toMatchObject({ day: 1, kind: "終了", reason: "完了" });
    expect(barMark(rows[0], 2, 3)).toBeNull();
    expect(fieldChangeText([first], next)).toContain("終了：安静度：ベッド上");
    const queue = standingTakeLines({ p: [first, { ...next, at }] }, {});
    const notices = lineChanges([person], queue, new Set(), 0, 1440 + 801, String);
    expect(notices.some((n) => n.text.main.includes("終了：安静度：ベッド上"))).toBe(true);
    const marked = markStandingTake(takeRows(notices, [person], { y: 2026, m: 11, d: 5 }), syncStandingCosign([], { p: [first, { ...next, at }] }, {}));
    expect(marked.find((r) => r.main.includes("終了："))?.flags.resident).toContain("確認待ち");
  });
});

it("かたまりの変更・終了でも本文と改行と指示受けの変更印を保つ", () => {
  const original = { ...line, cat: "頓用" as const, text: "嘔気時、嘔吐時指示\n経口可能時：医師に連絡\n経口不可能時：医師に連絡" };
  const text = original.text.replace("経口可能時：医師に連絡", "経口可能時：処方を確認");
  const changed = changeLine([original], original.id, { text, start: at }, line.by, at);
  expect(changed.lines[1].text).toBe(text);
  expect(changed.lines[1].cat).toBe("頓用");
  expect(lineChanges([person], { p: changed.lines }, new Set([original.id]), 0, 801, String)[0].text.main).toContain(`→ ${text}`);
  const ended = stopLine(changed.lines, changed.newId, { day: 1, time: "10:00", by: line.by, kind: "終了" });
  expect(ended[1].text).toBe(text);
  expect(barMark(ended[1], 1, 3)).toBe("end");
});
