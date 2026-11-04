import { describe, expect, it } from "vitest";
import { demoPhysioOrders, derivedValues, initialPhysioDesk, physioResultItems, physioRows, reportProblems, statusOf, valuesLine } from "./physio-desk";
import type { OrderEntry } from "./types";

const phy = (id: string, test: string, day = 0, time: string | undefined = "14:00", status: OrderEntry["status"] = "有効"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: "09:00",
  author: "医師",
  status,
  order: { type: "physio", test, purpose: "目的", when: { day, time, priority: time ? "予約" : "至急" }, place: "検査室", transport: "車椅子" },
});

const people = (entries: OrderEntry[]) => [{ patient: { id: "p1", name: "架空 花子" }, room: "511A", entries }];

describe("生理検査：一覧", () => {
  it("lists physiological tests of yesterday to tomorrow, not endoscopy or stopped ones", () => {
    const rows = physioRows(people([phy("a", "PHY-ECG", 0, undefined), phy("b", "PHY-UCG"), phy("c", "PHY-EGD"), phy("d", "PHY-SPIRO", 0, "10:00", "中止"), phy("e", "PHY-ABI", 3)]), {});
    expect(rows.map((r) => r.orderId)).toEqual(["a", "b"]);
    expect(rows[1]).toMatchObject({ testName: "心エコー（経胸壁）", status: "予約", at: 14 * 60 });
  });
  it("keeps an older test until it is reported", () => {
    expect(physioRows(people([phy("a", "PHY-ECG", -3)]), {}).map((r) => r.orderId)).toEqual(["a"]);
    const desk = { a: { orderId: "a", patientId: "p1", test: "PHY-ECG", report: { day: -3, time: "15:00", values: {}, findings: "x", conclusion: "y", by: "技師" } } };
    expect(physioRows(people([phy("a", "PHY-ECG", -3)]), desk)).toEqual([]);
  });
  it("tells the state from the record", () => {
    expect(statusOf(undefined)).toBe("予約");
    expect(statusOf({ orderId: "a", patientId: "p1", test: "PHY-ECG", arrived: { day: 0, time: "10:00", by: "技師" } })).toBe("受付済み");
    expect(statusOf({ orderId: "a", patientId: "p1", test: "PHY-ECG", done: { day: 0, time: "10:10", by: "技師" } })).toBe("実施済み");
    expect(statusOf({ orderId: "a", patientId: "p1", test: "PHY-ECG", notDone: { day: 0, time: "10:10", by: "技師", reason: "体調不良" } })).toBe("実施できなかった");
  });
});

describe("生理検査：報告", () => {
  it("works out 1秒率 and ABI with the sum written out", () => {
    expect(derivedValues("PHY-SPIRO", { FVC: 3.2, FEV1: 2.1 })).toEqual([{ label: "1秒率（FEV1/FVC）", value: 65.6, unit: "%", formula: "2.1L ÷ 3.2L × 100 = 65.6%" }]);
    const abi = derivedValues("PHY-ABI", { bR: 140, bL: 132, aR: 126, aL: 98 });
    expect(abi.map((d) => d.value)).toEqual([0.9, 0.7]);
    expect(abi[0].formula).toContain("上腕の高いほう 140mmHg");
    expect(derivedValues("PHY-ECG", { HR: 80 })).toEqual([]);
  });
  it("catches a slip of the finger, and needs findings, a summary and, for a correction, a reason", () => {
    expect(reportProblems("PHY-UCG", { values: { LVEF: 550 }, findings: "a", conclusion: "b" }, false)[0]).toContain("範囲");
    expect(reportProblems("PHY-UCG", { values: { LVEF: 55 }, findings: "", conclusion: "" }, false)).toEqual(["所見を書いてください。", "まとめを書いてください。"]);
    expect(reportProblems("PHY-UCG", { values: { LVEF: 55 }, findings: "a", conclusion: "b" }, true)).toEqual(["訂正の理由を書いてください。"]);
  });
  it("writes the values in one line and makes each version a result", () => {
    expect(valuesLine("PHY-SPIRO", { FVC: 3.2, FEV1: 2.1 })).toBe("努力肺活量 3.2L　1秒量 2.1L　1秒率（FEV1/FVC） 65.6%");
    const desk = initialPhysioDesk(10 * 60);
    const items = physioResultItems(desk);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "phy|o-phy-demo1|v1", kind: "生理", patientId: "90010198", title: "心電図（12誘導）" });
  });
  it("demo orders are physiological tests of the fictional ward patients", () => {
    const d = demoPhysioOrders(10 * 60);
    expect(Object.keys(d)).toEqual(["90010198", "90010260"]);
    expect(Object.values(d).flat().every((e) => e.order.type === "physio")).toBe(true);
  });
});
