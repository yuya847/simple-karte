import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./scenarios";
import { EMPTY_DESK, correctReport, cancelReception, confirmReport, drawRows, receive, scanSpecimen, specimenId, type LabDesk } from "./lab-desk";
import { visitPeople } from "./lab-visits";
import { physioRows } from "./physio-desk";
import { bloodCulturePanic } from "./results";
import type { WorkPatient } from "./worksheet";

const people: WorkPatient[] = SCENARIOS.patients.map((p) => ({
  patient: { ...p, labs: [] }, room: p.room,
  entries: [{ kind: "order", id: `${p.id}-opd-lab`, day: 0, time: "05:00", author: p.attending, status: "有効", order: { type: "lab", codes: ["LAB-NA"], collect: { day: 0, time: "06:00" }, priority: "定時" } }],
}));
const rowsOf = (desk: LabDesk) => drawRows(people, {}, desk, 480, 600);

describe("検体の識別と旧workspace", () => {
  it("112人の同じ末尾のオーダーでも検体番号は数字20桁で重複しない", () => {
    const rows = rowsOf(EMPTY_DESK);
    expect(rows).toHaveLength(112);
    expect(new Set(rows.map((r) => r.code)).size).toBe(112);
    expect(rows.every((r) => /^\d{20}$/.test(r.code))).toBe(true);
    expect(new Set(rows.map(specimenId)).size).toBe(112);
    expect(rowsOf(EMPTY_DESK).map((r) => r.code)).toEqual(rows.map((r) => r.code));
  });
  it("読む・確定で対象の検体1件だけが動く", () => {
    const rows = rowsOf(EMPTY_DESK);
    const selected = scanSpecimen(rows[19].code, rows, people, 600)!;
    expect(selected.row?.patientId).toBe(rows[19].patientId);
    const received = receive(EMPTY_DESK, selected.row!, "検査技師", 600);
    expect(receive(received, selected.row!, "別の検査技師", 601)).toBe(received);
    expect(rowsOf(received).filter((r) => r.status === "受付済み").map(specimenId)).toEqual([specimenId(rows[19])]);
    const reported = confirmReport(received, rows[19], { Na: 140 }, "検査技師", 610);
    expect(rowsOf(reported).filter((r) => r.status === "報告済み").map(specimenId)).toEqual([specimenId(rows[19])]);
    expect(Object.keys(reported.reports)).toEqual([specimenId(rows[19])]);
  });
  it("旧ラベルをキーにした保存データも所有者だけに復元する", () => {
    const rows = rowsOf(EMPTY_DESK);
    const saved = receive(EMPTY_DESK, rows[19], "以前の検査技師", 600);
    const legacy = { ...saved, received: { "OPDLAB-360": { ...Object.values(saved.received)[0], code: "OPDLAB-360" } } };
    expect(rowsOf(legacy).filter((r) => r.status === "受付済み").map(specimenId)).toEqual([specimenId(rows[19])]);
    const reported = confirmReport(legacy, rows[19], { Na: 140 }, "検査技師", 610);
    expect(rowsOf(reported).filter((r) => r.status === "報告済み")).toHaveLength(1);
    expect(confirmReport(legacy, rows[9], { Na: 140 }, "検査技師", 610)).toBe(legacy);
  });
  it("同じ旧ラベルの保存結果でも訂正・受付取消は検体IDで対象だけを変える", () => {
    const [a, b] = rowsOf(EMPTY_DESK);
    const report = (row: typeof a) => ({ code: "OPDLAB-360", patientId: row.patientId, orderId: row.orderId, at: row.at, by: "前の技師", reported: { day: 0, time: "09:00" }, values: { Na: 140 } });
    const received = receive(receive(EMPTY_DESK, a, "技師", 600), b, "技師", 600);
    const saved = { ...received, reports: { oldA: report(a), oldB: report(b) } };
    const corrected = correctReport(saved, specimenId(b), { Na: 141 }, "入力の誤り", "技師", 610);
    expect(corrected.reports.oldA.values.Na).toBe(140);
    expect(corrected.reports[specimenId(b)].values.Na).toBe(141);
    const undone = cancelReception(corrected, specimenId(b), b.patientId, "技師", "10:15");
    expect(Object.values(undone.reports).map((r) => r.patientId)).toEqual([a.patientId]);
  });
  it("番号が重複していた場合は読み取りを止める", () => {
    const rows = rowsOf(EMPTY_DESK).slice(0, 2);
    rows[1] = { ...rows[1], code: rows[0].code };
    expect(scanSpecimen(rows[0].code, rows, people, 600)).toMatchObject({ ok: false, tone: "stop" });
  });
  it("実際の112人シナリオと受診者の検体でも重複しない", () => {
    const ward: WorkPatient[] = SCENARIOS.cases.filter((c) => c.stage === "入院").map((c) => ({ patient: c.patient, room: c.patient.room, entries: c.patient.history.filter((e) => e.kind === "order") }));
    const visits = visitPeople(SCENARIOS.er.filter((v) => v.status !== "入院済"), SCENARIOS.opd, SCENARIOS.visitOrders, EMPTY_DESK);
    const rows = drawRows([...ward, ...visits], {}, EMPTY_DESK, 480, 600);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });
});

it("112人の生理検査は主病名に合う検査で、受付・実施・報告の各段階がある", () => {
  const rows = physioRows(SCENARIOS.patients.map((p) => ({ patient: p, room: p.room, entries: p.history.filter((e) => e.kind === "order") })), SCENARIOS.physioDesk);
  expect(rows.length).toBeGreaterThan(100);
  for (const status of ["予約", "実施済み", "下書き（技師）", "報告済み"]) expect(rows.filter((r) => r.status === status).length).toBeGreaterThan(3);
  for (const r of rows) {
    const p = SCENARIOS.patients.find((p) => p.id === r.patientId)!;
    if (r.test === "PHY-SPIRO") expect(r.purpose).toContain(p.admissionDiagnosis);
    if (/腎盂腎炎/.test(p.admissionDiagnosis)) expect(["PHY-ABDUS", "PHY-ECG"]).toContain(r.test);
  }
});

it("発育なしは血液培養陽性にせず、陽性にはセット数を含める", () => {
  expect(bloodCulturePanic({ specimen: "血液", collectedOn: -2, reportedOn: -1, status: "中間報告", organism: "発育なし（24時間）" })).toEqual([]);
  expect(bloodCulturePanic({ specimen: "血液", collectedOn: -2, reportedOn: 0, status: "中間報告", stage: "塗抹", gram: "グラム陽性球菌", sets: "2セット中2セット陽性" })[0].name).toContain("2セット中2セット");
});

it("患者名・主病名・受診者の情報は同じ患者から作り、労災を無関係に割り当てない", () => {
  expect(new Set(SCENARIOS.patients.map((p) => p.name)).size).toBe(112);
  for (const c of SCENARIOS.cases) {
    expect(c.diagnoses.find((d) => d.main)?.name).toBe(c.patient.admissionDiagnosis);
    expect(SCENARIOS.insurance[c.patient.id]?.some((r) => r.form.coverage === "労災")).not.toBe(true);
  }
  for (const v of SCENARIOS.opd) {
    const patient = SCENARIOS.patients.find((p) => p.id === v.id)!;
    expect(v.name).toBe(patient.name);
    expect(v.problems).toContain(patient.admissionDiagnosis);
  }
});

it("同一検体の古い中間報告を最終報告と重複表示せず、採血オーダーは採取より前", () => {
  for (const p of SCENARIOS.patients) {
    expect(new Set(p.cultures.map((c) => `${c.collectedOn}|${c.specimen}`)).size).toBe(p.cultures.length);
    for (const e of p.history) if (e.kind === "order" && e.order.type === "lab") {
      expect(e.day * 1440 + Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3))).toBeLessThan(e.order.collect.day * 1440 + Number(e.order.collect.time.slice(0, 2)) * 60 + Number(e.order.collect.time.slice(3)));
    }
    expect(p.labs.every((l) => l.values.WBC === undefined || l.values.WBC % 10 === 0)).toBe(true);
  }
});
