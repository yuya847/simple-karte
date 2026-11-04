import { describe, expect, it } from "vitest";
import type { Draft } from "./drafts";
import { DRUGS, LAB_TESTS } from "./master";
import {
  addMasterChanges,
  changesFor,
  editProblem,
  fieldsOf,
  foldChanges,
  masterIssues,
  masterLog,
  masterOverrides,
  masterRows,
  nameIn,
  NO_OVERRIDES,
  pickable,
  resetChange,
  restoreMasterLog,
  type MasterChange,
} from "./master-local";

let n = 0;
const newId = () => `c${++n}`;
const meta = { reason: "院内の採用を見直した", by: "薬剤師 小林", role: "薬剤師", at: { day: 0, time: "10:00" } };
const [first, second, third] = DRUGS;

describe("マスタ管理：履歴を初めの値に重ねる", () => {
  it("lists every item of the master files with its default order", () => {
    expect(masterRows("注射薬")).toHaveLength(DRUGS.length);
    expect(masterRows("検体検査")[0]).toMatchObject({ code: LAB_TESTS[0].code, base: 1 });
    expect(fieldsOf(NO_OVERRIDES, "注射薬", first.code)).toEqual({ adopted: true, localName: "", order: 10, stopped: false });
    expect(fieldsOf(NO_OVERRIDES, "注射薬", second.code).order).toBe(20);
  });

  it("makes one line per field that changes, and none when nothing changes", () => {
    const cs = changesFor(NO_OVERRIDES, "注射薬", first.code, { localName: " 生食500 ", order: 10, stopped: true }, meta, newId);
    expect(cs.map((c) => [c.field, c.before, c.after])).toEqual([
      ["localName", "（標準の名前）", "生食500"],
      ["stopped", "使用中", "中止"],
    ]);
    const ov = foldChanges(cs);
    expect(fieldsOf(ov, "注射薬", first.code)).toEqual({ adopted: true, localName: "生食500", order: 10, stopped: true });
    expect(changesFor(ov, "注射薬", first.code, { localName: "生食500" }, meta, newId)).toEqual([]);
  });

  it("drops an item from the map when it is back to the defaults, and resets one item, one master or all", () => {
    const a = changesFor(NO_OVERRIDES, "注射薬", first.code, { stopped: true }, meta, newId);
    const b = changesFor(foldChanges(a), "注射薬", first.code, { stopped: false }, meta, newId);
    expect(foldChanges([...a, ...b]).size).toBe(0);
    const log: MasterChange[] = [
      ...changesFor(NO_OVERRIDES, "注射薬", first.code, { adopted: false }, meta, newId),
      ...changesFor(NO_OVERRIDES, "注射薬", second.code, { order: 50 }, meta, newId),
      ...changesFor(NO_OVERRIDES, "検体検査", LAB_TESTS[0].code, { localName: "血算" }, meta, newId),
    ];
    expect(foldChanges(log).size).toBe(3);
    expect(foldChanges([...log, resetChange("注射薬", first.code, meta, newId)]).size).toBe(2);
    expect(foldChanges([...log, resetChange("注射薬", "*", meta, newId)]).size).toBe(1);
    expect(foldChanges([...log, resetChange("*", "*", meta, newId)]).size).toBe(0);
  });

  it("checks an edit: 院内名 up to 40 characters, 表示順 1〜9999, a reason", () => {
    expect(editProblem({ localName: "あ".repeat(41) }, "理由")).toMatch(/40文字/);
    expect(editProblem({ order: 0 }, "理由")).toMatch(/1〜9999/);
    expect(editProblem({ order: 2.5 }, "理由")).toMatch(/1〜9999/);
    expect(editProblem({ stopped: true }, " ")).toMatch(/理由/);
    expect(editProblem({ stopped: true, order: 3 }, "在庫切れ")).toBeNull();
  });
});

describe("マスタ管理：画面とオーダに入る", () => {
  const log = [
    ...changesFor(NO_OVERRIDES, "注射薬", second.code, { stopped: true }, { ...meta, reason: "供給停止" }, newId),
    ...changesFor(NO_OVERRIDES, "注射薬", third.code, { order: 1, localName: "院内の名前" }, meta, newId),
  ];
  const ov = foldChanges(log);

  it("hides 中止 and 非採用 from the pickers and sorts by 表示順 (an item put at 1 comes before the defaults 10, 20…)", () => {
    const shown = pickable("注射薬", DRUGS, ov);
    expect(shown.map((d) => d.code).slice(0, 2)).toEqual([third.code, first.code]);
    expect(shown.some((d) => d.code === second.code)).toBe(false);
    expect(pickable("注射薬", DRUGS, NO_OVERRIDES)).toEqual(DRUGS);
    // Ties keep the master's order.
    const tie = foldChanges(changesFor(NO_OVERRIDES, "注射薬", third.code, { order: 10 }, meta, newId));
    expect(pickable("注射薬", DRUGS, tie).map((d) => d.code).slice(0, 2)).toEqual([first.code, third.code]);
    expect(nameIn(ov, "注射薬", third.code, third.name)).toBe("院内の名前");
    expect(nameIn(ov, "注射薬", first.code, first.name)).toBe(first.name);
  });

  it("stops a draft that uses a 中止 item, saying who stopped it and why", () => {
    const d = { id: "d1", origin: "manual", sourceText: "", comment: null, kind: "injection", items: [{ drugCode: second.code, said: "", amount: 1, unit: "本" }] } as unknown as Draft;
    const issues = masterIssues(d, ov, log);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("stop");
    expect(issues[0].message).toContain("中止");
    expect(issues[0].message).toContain("薬剤師 小林 10:00：供給停止");
    expect(issues[0].choices?.[0].remove).toBe(true);
    const ok = { ...d, items: [{ drugCode: third.code, said: "", amount: 1, unit: "本" }] } as unknown as Draft;
    expect(masterIssues(ok, ov, log)).toEqual([]);
    expect(masterIssues(d, NO_OVERRIDES)).toEqual([]);
  });

  it("keeps the history of the page: added lines and the lines read back from the day's records", () => {
    restoreMasterLog([log[0], { id: "壊れた", kind: "なにか" }]);
    expect(masterLog()).toHaveLength(1);
    addMasterChanges([log[1]]);
    expect(masterLog()).toHaveLength(2);
    expect(fieldsOf(masterOverrides(), "注射薬", second.code).stopped).toBe(true);
  });
});
