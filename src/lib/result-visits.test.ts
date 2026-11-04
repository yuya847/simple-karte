import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { PANIC_LIMITS, labKey } from "./results";
import { previousResult, resultVisits } from "./result-visits";

import type { LabResult } from "./types";

const base = PATIENTS[0];
describe("検査1回ごとの一覧", () => {
  it("同時刻でもラベルが違う検査は分け、新しい順・未確認・異常とパニック値を残す", () => {
    const labs: LabResult[] = [{ day: 0, time: "10:00", id: "a", values: { K: 7.5 } }, { day: 0, time: "10:00", id: "b", values: { Na: 140 } }, { day: -1, time: "12:00", values: { K: 4 } }];
    const patient = { ...base, labs, cultures: [], imaging: [] };
    const key = labKey(patient.id, labs[0]);
    const visits = resultVisits(patient, PANIC_LIMITS, [], [key]);
    expect(visits).toHaveLength(3);
    expect(visits.at(-1)?.day).toBe(-1);
    expect(visits.find((v) => v.key === key)).toMatchObject({ unseen: true, kind: "血液", summary: "K 1項目・異常 1・パニック値" });
    expect(visits.filter((v) => v.unseen)).toHaveLength(1);
    expect(patient.labs).toEqual(labs);
  });
  it("他患者の追加結果を除き、重複キーは1回にし、記録にない時刻を補わない", () => {
    const item = { key: "physio", patientId: base.id, kind: "生理" as const, day: 1, time: "", title: "心電図", detail: "所見", panic: [] };
    const visits = resultVisits({ ...base, labs: [], cultures: [], imaging: [] }, [], [item, item, { ...item, key: "other", patientId: "other" }]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ kind: "生理", time: "", unseen: false });
  });
  it("尿・血液ガス・培養を区別し、訂正版を新しい確認対象として扱う", () => {
    const labs: LabResult[] = [
      { day: 0, time: "09:00", values: { UPro: 10 } },
      { day: 0, time: "10:00", values: { pH: 7.4 } },
      { day: 0, time: "11:00", values: { K: 4 }, corrected: { version: 2, reason: "再測定", by: "検査技師", at: { day: 0, time: "12:00" }, before: { K: 5 } } },
    ];
    const patient = { ...base, labs, imaging: [], cultures: [{ collectedOn: -1, specimen: "髄液", status: "最終報告" as const, reportedOn: 0, reportedTime: "13:00", organism: "発育なし" }] };
    const key = labKey(patient.id, labs[2]);
    const visits = resultVisits(patient, PANIC_LIMITS, [], [key]);
    expect(visits.map((v) => v.kind)).toEqual(["培養（髄液）", "血液", "血液ガス", "尿"]);
    expect(visits.find((v) => v.key === key)?.unseen).toBe(true);
    expect(resultVisits(patient, PANIC_LIMITS).every((v) => !v.unseen)).toBe(true);
  });
  it("前回値は同時刻を除き、項目がある直近の採取から取得する", () => {
    const current = { day: 0, time: "10:00", values: { K: 5 } };
    const labs: LabResult[] = [current, { day: 0, time: "10:00", values: { K: 7 } }, { day: -1, time: "09:00", values: { K: 4 } }, { day: 0, time: "09:00", values: { Na: 140 } }];
    expect(previousResult(labs, current, "K")).toBe(4);
    expect(previousResult(labs, current, "Hb")).toBeUndefined();
  });
});
