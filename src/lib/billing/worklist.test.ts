import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES, UNCODED, type Diagnosis } from "../diagnoses";
import { PATIENTS } from "../patients";
import { ASSUMED_INSURANCE_ISSUE, INSURANCE } from "./insurance";
import { DEFAULT_OPTIONS, type ClaimIssue } from "./model";
import { claimChecks, type PatientMonthInput } from "./month";
import { patientMonthPayload } from "./payload";
import { DEMO_FORMS } from "./registration";
import { ijiCounts, ijiRows, INITIAL_DESK, reviewIssues, withInsurance, withSettlement } from "./worklist";

// A patient admitted from the ED in this session (fictional): no insurance yet, the admission diagnosis typed by hand.
const NEW = "90020001";
const newDx: Diagnosis = { id: "x", code: UNCODED, name: "発熱精査", prefixes: [], suffixes: [], main: true, start: 0, outcome: "継続" };
const patients = [...PATIENTS.map((p) => ({ id: p.id })), { id: NEW }];
const diagnoses = { ...INITIAL_DIAGNOSES, [NEW]: [newDx] };

describe("医事課の仕事", () => {
  it("a newly admitted patient shows up as 保険の未登録, with the 未コード化 diagnosis; the demo patients are registered", () => {
    const rows = ijiRows(patients, INITIAL_DESK, diagnoses, null);
    expect(rows[0].patientId).toBe(NEW);
    expect(rows[0].todo).toEqual(["保険の未登録", "病名の未コード化"]);
    expect(rows[0].uncoded.map((d) => d.name)).toEqual(["発熱精査"]);
    for (const id of Object.keys(INSURANCE)) expect(rows.find((r) => r.patientId === id)!.todo).toEqual([]);
  });
  it("registering the insurance takes the item away", () => {
    const desk = withInsurance(INITIAL_DESK, NEW, { form: DEMO_FORMS["90010260"], insurance: INSURANCE["90010260"], action: "登録", by: "医事課 渡辺", at: { day: 0, time: "10:00" } });
    const row = ijiRows(patients, desk, diagnoses, null).find((r) => r.patientId === NEW)!;
    expect(row.todo).toEqual(["病名の未コード化"]);
    expect(row.insurance?.by).toBe("医事課 渡辺");
  });
  it("a discharged patient waits for the bill until it is recorded", () => {
    const out = patients.map((p) => (p.id === "90010198" ? { ...p, dischargedAt: { day: 0, time: "10:30" } } : p));
    const row = (desk = INITIAL_DESK) => ijiRows(out, desk, diagnoses, null).find((r) => r.patientId === "90010198")!;
    expect(row().todo).toEqual(["会計がまだ"]);
    expect(row().discharge).toEqual({ day: 0, time: "10:30" });
    const settled = withSettlement(INITIAL_DESK, "90010198", { month: "2026-11", yen: 57600, by: "医事課 渡辺", at: { day: 0, time: "11:00" } });
    expect(row(settled).todo).toEqual([]);
    expect(row(settled).settled?.yen).toBe(57600);
  });
  it("算定の要確認 comes from the claim (once computed), counted per kind", () => {
    const checks: Record<string, ClaimIssue[]> = { "90010231": [{ level: "review", text: "造影剤を足してください。" }] };
    const rows = ijiRows(patients, INITIAL_DESK, diagnoses, checks);
    expect(rows.find((r) => r.patientId === "90010231")!.todo).toEqual(["算定の要確認"]);
    expect(rows.find((r) => r.patientId === "90010244")!.review).toBeNull();
    expect(ijiCounts(rows)).toEqual({ 保険の未登録: 1, 会計がまだ: 0, 算定の要確認: 1, 病名の未コード化: 1 });
  });
  it("only 確かめる and 人が選ぶ count, and the insurance note is left to its own item", () => {
    const issues: ClaimIssue[] = [
      { level: "info", text: "決まり" },
      { level: "excluded", text: "外した" },
      { level: "review", text: ASSUMED_INSURANCE_ISSUE },
      { level: "review", text: "確かめる" },
      { level: "choose", text: "選ぶ" },
    ];
    expect(reviewIssues(issues).map((i) => i.text)).toEqual(["確かめる", "選ぶ"]);
  });
});

describe("算定の確かめ（サーバーで同じ算定を通す）", () => {
  it("runs each patient's month and keeps only what a person must look at", () => {
    const inputs = [
      ...PATIENTS.map((p) => patientMonthPayload(p, p.history, INITIAL_DIAGNOSES[p.id] ?? [], DEFAULT_OPTIONS)),
      patientMonthPayload({ ...PATIENTS[0], id: NEW, history: [] }, [], [newDx], DEFAULT_OPTIONS),
    ] as unknown as PatientMonthInput[];
    const out = claimChecks(inputs, "2026-11-03", "12:00", "2026-11");
    expect(out.map((o) => o.id)).toEqual([...PATIENTS.map((p) => p.id), NEW]);
    for (const o of out) {
      expect(o.days).toBeGreaterThan(0);
      expect(o.issues.every((i) => i.level === "review" || i.level === "choose")).toBe(true);
      expect(o.issues.some((i) => i.text === ASSUMED_INSURANCE_ISSUE)).toBe(false);
    }
  });
});
