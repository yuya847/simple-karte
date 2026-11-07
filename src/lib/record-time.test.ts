import { expect, it } from "vitest";
import { recordedHourly, recordedVitals } from "./record-time";
import { SCENARIOS } from "./scenarios";
import { withIcuUrine } from "./icu/io-lines";
import { sofaFacts } from "./icu/sofa";

it.each([0, 9 * 60, 14 * 60, 23 * 60])("固定時刻 %s までの記録のみ残す", now => {
  for (const p of SCENARIOS.patients) {
    const vitals = recordedVitals(p.vitals, now);
    expect(vitals.every(v => v.day * 1440 + Number(v.time.slice(0, 2)) * 60 + Number(v.time.slice(3)) <= now)).toBe(true);
  }
  const hourly = recordedHourly(SCENARIOS.icu.hourly, now);
  expect(hourly.every(r => r.at.day * 1440 + Number(r.at.time.slice(0, 2)) * 60 + Number(r.at.time.slice(3)) <= now)).toBe(true);
});
it("ICU・HCU・救急の12人は23時まであり、14時時点では14時まで読める", () => {
  for (const p of SCENARIOS.patients.slice(100)) {
    expect(p.vitals.filter(v => v.day === 0).at(-1)?.time, p.id).toBe("23:00");
    expect(recordedVitals(p.vitals, 840).at(-1)?.time, p.id).toBe("14:00");
    const rows = recordedHourly(SCENARIOS.icu.hourly, 840).filter(r => r.patientId === p.id && r.at.day === 0);
    expect(rows.at(-1)?.at.time, p.id).toBe("14:00");
    const sum = rows.reduce((n, r) => n + (r.urineMl ?? 0), 0);
    expect(withIcuUrine(p.daily, SCENARIOS.icu, p.id, 840).find(d => d.day === 0)?.urineMl).toBe(sum);
    expect(sofaFacts(p, SCENARIOS.icu, 0, 840).urineMl).toBe(sum);
  }
});
it("一般病棟の18時のバイタルを14時には返さない", () => {
  expect(recordedVitals([{ day: -1, time: "18:00" }, { day: 0, time: "14:00" }, { day: 0, time: "18:00" }], 840)).toEqual([{ day: -1, time: "18:00" }, { day: 0, time: "14:00" }]);
});

it("表示用に時間記録を絞って編集しても、保存元の未来の記録は失わない", async () => {
  const { visibleIcuRecords, retainFutureHourly } = await import("./record-time");
  const saved = { hourly: [{ id: "past", at: { day: 0, time: "13:00" }, urineMl: 10 }, { id: "future", at: { day: 0, time: "15:00" }, urineMl: 20 }] };
  const view = visibleIcuRecords(saved, 840);
  expect(view.hourly.map(r => r.id)).toEqual(["past"]);
  const edited = { hourly: view.hourly.map(r => ({ ...r, urineMl: 30 })) };
  const result = retainFutureHourly(saved, edited, 840);
  expect(result.hourly.map(r => r.urineMl)).toEqual([30, 20]);
  expect(saved.hourly[0].urineMl).toBe(10);
});
