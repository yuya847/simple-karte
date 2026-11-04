import { describe, expect, it } from "vitest";
import {
  EMPTY_ENDO,
  biopsyCase,
  demoEndoOrders,
  demoEndoPatients,
  doneProblems,
  endoReportProblems,
  endoResultItems,
  endoRows,
  initialEndo,
  machineLeft,
  newWork,
  nextReprocessStep,
  scopeKindOf,
  scopeState,
  statusOf,
  usableScopes,
  washerBlock,
  watchGaps,
  type EndoDesk,
  type Reprocess,
} from "./endoscopy";
import { requestProblems } from "./pathology";
import type { OrderEntry, Patient } from "./types";

const NOW = 13 * 60; // 13:00
const pt = (id: string, department: string, history: Patient["history"] = []) => ({ id, department, history });
const ids = demoEndoPatients([pt("b", "消化器内科"), pt("a", "消化器内科"), pt("c", "循環器内科"), pt("d", "消化器内科"), pt("e", "消化器内科"), pt("f", "消化器内科")]);

describe("内視鏡の一覧", () => {
  it("chooses up to four patients of 消化器内科, the same ones every time", () => {
    expect(ids).toEqual(["a", "b", "d", "e"]);
    const ordered: OrderEntry = { kind: "order", id: "o", day: -1, time: "10:00", author: "x", status: "有効", order: { type: "physio", test: "PHY-EGD", purpose: "", when: { day: 1, time: "09:30", priority: "予約" }, place: "検査室" } };
    expect(demoEndoPatients([pt("a", "消化器内科", [ordered])])).toEqual([]);
  });
  it("lists only endoscopies (not the other physiological tests), the exam in progress first", () => {
    const orders = demoEndoOrders(ids, NOW);
    const desk = initialEndo(ids, NOW);
    const people = ids.map((id) => ({ patient: { id, name: id }, room: "501A", entries: orders[id] }));
    people[0].entries = [...people[0].entries, { ...orders[ids[0]][0], id: "ecg", order: { type: "physio", test: "PHY-ECG", purpose: "", when: { day: 0, priority: "至急" }, place: "ベッドサイド" } } as OrderEntry];
    const rows = endoRows(people, desk);
    expect(rows.map((r) => r.orderId)).not.toContain("ecg");
    expect(rows.map((r) => r.status)).toEqual(["受付済み", "予約", "実施済み", "報告済み"]);
    expect(statusOf(undefined)).toBe("予約");
  });
});

describe("スコープの洗浄・消毒", () => {
  const used = (scope: string, patch: Partial<Reprocess> = {}): EndoDesk => ({ ...EMPTY_ENDO, works: { o1: { ...newWork("o1", "p", "PHY-EGD"), done: { day: 0, start: "09:00", end: "09:15", scope, doctor: "d", assist: "n", biopsy: 0, procedures: "", complication: "" } } }, reprocess: [{ id: "r", scope, orderId: "o1", patientId: "p", used: { day: 0, time: "09:15" }, ...patch }] });

  it("a scope is usable only after bedside cleaning, leak test, manual cleaning, the washer and storage", () => {
    expect(scopeState(EMPTY_ENDO, "GIF-01")).toBe("使用可");
    expect(scopeState(used("GIF-01"), "GIF-01")).toBe("洗浄待ち");
    const at = { day: 0, time: "09:20", by: "n" };
    expect(scopeState(used("GIF-01", { bedside: at }), "GIF-01")).toBe("漏水テスト待ち");
    expect(scopeState(used("GIF-01", { bedside: at, leak: { ...at, ok: false } }), "GIF-01")).toBe("使用停止（漏水）");
    const washing = used("GIF-01", { bedside: at, leak: { ...at, ok: true }, manual: at, machine: { washer: "洗浄消毒装置 1", agent: "過酢酸", start: { day: 0, time: "09:40" }, by: "n" } });
    expect(scopeState(washing, "GIF-01")).toBe("装置で消毒中");
    expect(machineLeft(washing.reprocess[0], 9 * 60 + 42)).toBe(3);
    expect(nextReprocessStep(washing.reprocess[0])).toBe("装置の終了");
    const done = used("GIF-01", { ...washing.reprocess[0], machine: { ...washing.reprocess[0].machine!, end: { day: 0, time: "09:50" }, ok: true }, stored: at });
    expect(scopeState(done, "GIF-01")).toBe("使用可");
    expect(usableScopes(used("GIF-01"), "上部").map((s) => s.id)).toEqual(["GIF-02", "GIF-03"]);
  });
  it("the washer waits for today's check of the disinfectant", () => {
    expect(washerBlock(EMPTY_ENDO, "洗浄消毒装置 1")).toMatch(/濃度確認がまだ/);
    expect(washerBlock({ ...EMPTY_ENDO, checks: [{ washer: "洗浄消毒装置 1", day: 0, time: "08:00", by: "n", ok: false }] }, "洗浄消毒装置 1")).toMatch(/下回った/);
    expect(washerBlock({ ...EMPTY_ENDO, checks: [{ washer: "洗浄消毒装置 1", day: 0, time: "08:00", by: "n", ok: true }] }, "洗浄消毒装置 1")).toBeNull();
  });
  it("the 実施記録 cannot use a scope that has not been reprocessed", () => {
    expect(doneProblems({ start: "10:00", end: "10:20", scope: "GIF-02", doctor: "d" }, ["GIF-01"])).toEqual(["GIF-02 は洗浄・消毒が済んでいないため使えません"]);
    expect(doneProblems({ start: "10:20", end: "10:00", scope: "", doctor: "" }, [])).toHaveLength(3);
    expect(scopeKindOf("PHY-CF")).toBe("大腸");
    expect(scopeKindOf("PHY-BF")).toBe("気管支");
  });
});

describe("鎮静と報告", () => {
  it("flags gaps longer than 5 minutes in the watch during a sedated exam", () => {
    const w = { ...newWork("o", "p", "PHY-EGD"), sedation: { drugs: [], o2: "", doctor: "d", nurse: "n" }, watch: [{ time: "10:00", consciousness: "清明" as const, by: "n" }, { time: "10:05", consciousness: "清明" as const, by: "n" }], done: { day: 0, start: "10:00", end: "10:20", scope: "GIF-01", doctor: "d", assist: "n", biopsy: 0, procedures: "", complication: "" } };
    expect(watchGaps(w)).toEqual([{ from: "10:05", to: "10:20", minutes: 15 }]);
    expect(watchGaps({ ...w, sedation: undefined })).toEqual([]);
  });
  it("makes reports into results the ordering doctor reads, and a correction into a new one", () => {
    const desk = initialEndo(ids, NOW);
    const items = endoResultItems(desk);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("内視鏡");
    expect(items[0].key).toBe("endo|o-endo-demo1|v1");
    expect(endoReportProblems({ findings: "", diagnosis: "", reason: "" }, true)).toHaveLength(3);
  });
  it("makes a complete 病理 request (組織診・内視鏡下生検) from the biopsy", () => {
    const desk = initialEndo(ids, NOW);
    const c = biopsyCase(desk.works["o-endo-demo2"], { day: 0, time: "12:00" }, "医師", { site: "胃 前庭部", containers: 2, clinical: "心窩部痛", question: "腫瘍の有無" });
    expect(c.method).toBe("内視鏡下生検");
    expect(c.kind).toBe("組織診");
    expect(requestProblems(c)).toEqual([]);
  });
  it("the demo starts with one report, one exam waiting for its report (with 2 biopsies) and one taken in", () => {
    const desk = initialEndo(ids, NOW);
    expect(statusOf(desk.works["o-endo-demo1"])).toBe("報告済み");
    expect(desk.works["o-endo-demo2"].done?.biopsy).toBe(2);
    expect(statusOf(desk.works["o-endo-demo3"])).toBe("受付済み");
    expect(scopeState(desk, "GIF-01")).toBe("使用可");
    expect(scopeState(desk, "GIF-02")).toBe("漏水テスト待ち");
  });
});
