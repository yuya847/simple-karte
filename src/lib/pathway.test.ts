import { describe, expect, it } from "vitest";
import { checkDraft, type CheckContext, type LabDraft, type ProcedureDraft } from "./drafts";
import { findDrug, findLab, findSet } from "./master";
import { findPhysio, findRegion } from "./exams";
import {
  EMPTY_PATHS,
  PATHWAYS,
  activePath,
  confirmedOn,
  dueOutcomes,
  evalDeny,
  evalLine,
  expandPath,
  findPath,
  itemKey,
  keysFrom,
  orderLabel,
  pathDayOf,
  pathTag,
  varianceCounts,
  type PathApplication,
  type PathBook,
} from "./pathway";
import type { OrderEntry } from "./types";

const aspn = findPath("PATH-ASPN")!;
let n = 0;
const newId = () => `d${++n}`;
const app: PathApplication = { id: "a1", patientId: "90010244", code: "PATH-ASPN", startDay: -1, by: "山本（専攻医）", at: { day: -1, time: "15:00" }, expanded: [] };

describe("クリティカルパスのマスタ", () => {
  it("has the three paths with one column per day up to the standard length", () => {
    expect(PATHWAYS.map((p) => p.name)).toEqual(["誤嚥性肺炎", "心不全（急性増悪）", "蜂窩織炎（下肢）"]);
    for (const p of PATHWAYS) {
      expect(p.days.map((d) => d.day)).toEqual(Array.from({ length: p.length }, (_, i) => i + 1));
      // Outcome keys are unique within a path; the last day has the discharge outcome.
      const keys = p.days.flatMap((d) => d.outcomes.map((o) => o.key));
      expect(new Set(keys).size).toBe(keys.length);
      expect(p.days.at(-1)!.outcomes.some((o) => o.text.startsWith("退院の基準"))).toBe(true);
    }
  });

  it("uses only items of the hospital's masters, and no drug", () => {
    for (const p of PATHWAYS)
      for (const d of p.days)
        for (const it of d.orders) {
          if (it.kind === "lab") for (const c of it.codes) expect(findLab(c) ?? findSet(c)).toBeTruthy();
          if (it.kind === "imaging") expect(findRegion(it.region)).toBeTruthy();
          if (it.kind === "physio") expect(findPhysio(it.test)).toBeTruthy();
          expect(JSON.stringify(it)).not.toMatch(/INJ-|ORAL-/);
        }
    expect(findDrug("INJ-CEZ1")).toBeTruthy();
  });

  it("names each order in words", () => {
    expect(aspn.days[0].orders.map(orderLabel)).toEqual(["血算・白血球分画・生化学セット・CRP", "血液培養（2セット）", "胸部X線"]);
    expect(orderLabel(aspn.days[1].orders[0])).toBe("リハビリ（呼吸器・PT・ST）");
    expect(orderLabel(aspn.days[5].orders[0])).toBe("栄養食事指導の依頼");
  });
});

describe("パスの適用とオーダの展開", () => {
  it("puts the chosen items in as drafts on their own day, tagged with the path and day", () => {
    const ds = expandPath(aspn, -1, [itemKey(1, 0), itemKey(2, 0), itemKey(7, 1), itemKey(6, 0)], newId);
    expect(ds.map((d) => d.kind)).toEqual(["lab", "procedure", "procedure", "imaging"]);
    const labD = ds[0] as LabDraft;
    expect(labD.collect).toEqual({ day: -1, when: "morning_routine", time: null, beforeDose: null });
    expect(labD.comment).toBe("パス：誤嚥性肺炎 1日目");
    const rehab = ds[1] as ProcedureDraft;
    expect(rehab.rehab).toEqual({ field: "呼吸器", therapists: ["PT", "ST"], goal: "離床と、嚥下の評価・訓練", onset: -1, cautions: "" });
    expect(rehab.start.day).toBe(0);
    expect((ds[2] as ProcedureDraft).guide?.kind).toBe("栄養食事指導");
    expect(ds[3]).toMatchObject({ kind: "imaging", region: "R-CHEST", when: { day: 5 } });
  });

  it("offers the items from today's path day on (earlier days are past)", () => {
    const keys = keysFrom(aspn, pathDayOf(app, 0));
    expect(keys).not.toContain(itemKey(1, 0));
    expect(keys).toContain(itemKey(2, 0));
    expect(keys).toContain(itemKey(8, 0));
  });

  it("leaves what is still missing to the usual checks (nothing is confirmed by the path)", () => {
    const ds = expandPath(aspn, 0, [itemKey(1, 0), itemKey(7, 1)], newId);
    const ctx = { activeOrders: [], labOrders: [], drafts: ds, nowTime: "10:00", fmtDay: String, describe: () => "", allergies: [], consents: [], patientFacts: null, txFacts: null } as unknown as CheckContext;
    // Today's 06:00 draw has passed; the X線 still needs its views, time and purpose.
    expect(checkDraft(ds[0], ctx).find((i) => i.level === "stop")?.message).toContain("もう過ぎています");
    expect(checkDraft(ds[1], ctx).filter((i) => i.level === "ask").map((i) => i.title)).toContain("撮影");
  });

  it("finds the confirmed orders of a day by the path's comment", () => {
    const e = (comment: string, status: OrderEntry["status"] = "有効"): OrderEntry => ({ kind: "order", id: comment, day: 0, time: "10:00", author: "x", status, order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時", comment } });
    const tag = pathTag(aspn, 3);
    expect(confirmedOn(aspn, [e(tag), e(`2セット　${tag}`), e(tag, "中止"), e(pathTag(aspn, 1))], 3).map((x) => x.id)).toEqual([tag, `2セット　${tag}`]);
  });
});

describe("アウトカムとバリアンス", () => {
  const book: PathBook = { ...EMPTY_PATHS, apps: [app] };

  it("counts the path day from 1日目", () => {
    expect(pathDayOf(app, -1)).toBe(1);
    expect(pathDayOf(app, 0)).toBe(2);
    expect(activePath(book, "90010244")).toBe(app);
    expect(activePath({ ...book, apps: [{ ...app, end: { kind: "離脱", by: "x", at: { day: 0, time: "10:00" }, reason: "" } }] }, "90010244")).toBeUndefined();
  });

  it("lists the outcomes due by today that no one has evaluated, by who evaluates them", () => {
    expect(dueOutcomes(book, app, 2).map((x) => x.outcome.key)).toEqual(["a1-1", "a1-2", "a2-1", "a2-2"]);
    expect(dueOutcomes(book, app, 2, "看護師").map((x) => x.outcome.key)).toEqual(["a1-1", "a2-2"]);
    const done: PathBook = { ...book, evals: [{ id: "e1", appId: "a1", day: 1, key: "a1-1", result: "達成", by: "看護師 佐藤", role: "看護師", at: { day: -1, time: "18:00" } }] };
    expect(dueOutcomes(done, app, 2, "看護師").map((x) => x.outcome.key)).toEqual(["a2-2"]);
  });

  it("lets only the named profession evaluate an outcome", () => {
    const nurse = aspn.days[0].outcomes[0];
    expect(evalDeny(nurse, "看護師")).toBeNull();
    expect(evalDeny(nurse, "医師")).toBe("このアウトカムは看護師が評価します。");
  });

  it("writes the evaluation and its variance into the chart, and counts variances by category", () => {
    const out = aspn.days[2].outcomes[0];
    expect(evalLine(aspn, 3, out, "未達成", { category: "患者の病状", detail: "38.2℃の発熱が続く" })).toBe("・パス（誤嚥性肺炎 3日目）アウトカム「37.5℃以上の発熱が24時間ない」：未達成（バリアンス：患者の病状「38.2℃の発熱が続く」）");
    const v = (category: "患者の病状" | "病院の仕組み") => ({ id: category, appId: "a1", day: 3, sign: "負" as const, category, detail: "", by: "x", at: { day: 0, time: "10:00" } });
    expect(varianceCounts([v("病院の仕組み"), v("患者の病状"), v("患者の病状")])).toEqual([
      { category: "患者の病状", n: 2 },
      { category: "病院の仕組み", n: 1 },
    ]);
  });
});
