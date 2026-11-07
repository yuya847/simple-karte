import { expect, it } from "vitest";
import { SCENARIOS } from ".";
import { scenarioPhysioValues } from "./physiology";
import { echoCalculated, ventilationCandidate } from "../physio-calculations";
import { physioRows, previousPhysio } from "../physio-desk";

it("100人全員に検査があり、呼吸機能・心エコー・心電図の各段階と前回比較を用意する", () => {
  const rows = physioRows(SCENARIOS.patients.map((p) => ({ patient: p, room: p.room, entries: p.history.filter((e) => e.kind === "order") })), SCENARIOS.physioDesk);
  expect(new Set(SCENARIOS.patients.slice(0, 100).filter((p) => p.history.some((e) => e.kind === "order" && e.order.type === "physio")).map((p) => p.id)).size).toBe(100);
  for (const test of ["PHY-UCG", "PHY-SPIRO", "PHY-ECG"]) for (const status of ["予約", "実施済み", "下書き（技師）", "報告済み"]) {
    expect(rows.filter((r) => r.test === test && r.status === status).length, `${test} ${status}`).toBeGreaterThan(1);
  }
  for (const r of rows.filter((r) => r.test === "PHY-UCG")) expect(previousPhysio(SCENARIOS.physioDesk, r)?.report).toBeDefined();
});
it("病歴に応じたCOPD・喘息・間質性肺炎・心不全・梗塞後・弁膜症の値になる", () => {
  const patient = { ...SCENARIOS.patients[1], age: 60, sex: "男" as const, heightCm: 170, weightKg: 65 };
  expect(ventilationCandidate(scenarioPhysioValues("PHY-SPIRO", "慢性閉塞性肺疾患", patient).values, patient)).toBe("閉塞性");
  expect(ventilationCandidate(scenarioPhysioValues("PHY-SPIRO", "間質性肺炎", patient).values, patient)).toBe("拘束性");
  const asthma = scenarioPhysioValues("PHY-SPIRO", "気管支喘息", patient).values;
  expect(asthma.FEV1Post - asthma.FEV1).toBeGreaterThan(.2);
  expect(echoCalculated(scenarioPhysioValues("PHY-UCG", "心不全", patient).values, patient).LVEF).toBeLessThan(45);
  expect(scenarioPhysioValues("PHY-UCG", "陳旧性心筋梗塞", patient).selections.motion?.[7]).toBe("無収縮");
  expect(scenarioPhysioValues("PHY-UCG", "大動脈弁狭窄症", patient).values.AVA).toBe(.8);
});
