import { describe, expect, it } from "vitest";
import { generateScenarios } from "./index";
import { collectStudies } from "../pacs/studies";
import { risRows, risStatus } from "../ris";
import { mergeWorkspace } from "../merge-workspace";

describe("試験患者の画像検査", () => {
  const data = generateScenarios();
  it("検査オーダと RIS 記録が結び付き、今日・明日と各段階を試せる", () => {
    const rows = risRows(data.patients.map((patient) => ({ patient, room: patient.room, entries: patient.history.filter((e) => e.kind === "order") })), data.ris);
    expect(new Set(rows.map((r) => r.order.modality))).toEqual(new Set(["X線", "ポータブルX線", "CT", "MRI"]));
    for (const status of ["依頼", "受付済み", "撮影済み", "読影済み"]) expect(rows.filter((r) => r.status === status).length, status).toBeGreaterThan(1);
    expect(rows.some((r) => r.order.when.day === 1)).toBe(true);
    for (const w of Object.values(data.ris)) expect(rows.some((r) => r.orderId === w.orderId && r.patientId === w.patientId) || w.slot!.day < -1).toBe(true);
    const ct = rows.filter((r) => r.order.modality === "CT");
    expect(ct.some((r) => !r.work?.arrived && r.order.consent?.state === "未取得")).toBe(true);
    for (const r of ct) expect(data.patients.find((p) => p.id === r.patientId)!.labs.some((l) => l.values.Cre !== undefined)).toBe(true);
  });
  it("肺炎の経過には胸部画像、脳梗塞には頭部 MRI がある", () => {
    for (const p of data.patients.filter((p) => p.age >= 18 && !p.dischargedAt && p.admittedOn < -2 && /肺炎|脳梗塞/.test(p.admissionDiagnosis))) {
      const studies = collectStudies(p, p.history, 0, data.ris);
      if (/肺炎/.test(p.admissionDiagnosis)) expect(studies.some((s) => s.regionCode === "R-CHEST" && !s.pending)).toBe(true);
      if (/脳梗塞/.test(p.admissionDiagnosis)) expect(studies.some((s) => s.regionCode === "R-HEAD" && s.modality === "MRI")).toBe(true);
    }
  });
  it("RIS は workspace の項目単位の統合に乗り、自分の撮影開始を古い保存で戻さない", () => {
    const w = Object.values(data.ris).find((w) => risStatus(w) === "受付済み")!;
    const base = { ris: { [w.orderId]: w } };
    const started = { day: 0, time: "21:20", by: "技師", via: "手入力" };
    const mine = { ris: { [w.orderId]: { ...w, started } } };
    const theirs = { ris: { [w.orderId]: { ...w, assignedBy: "別の技師" } } };
    const merged = mergeWorkspace(mine, theirs, base).data as typeof mine;
    expect(merged.ris[w.orderId].started).toEqual(started);
    expect(merged.ris[w.orderId].assignedBy).toBe("別の技師");
  });
});
