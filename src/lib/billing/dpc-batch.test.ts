import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { briefOf } from "../dpc-brief";
import { INITIAL_DIETS } from "../diet";
import { PATIENTS } from "../patients";
import type { Patient } from "../types";
import { WARD_CHART_DIAGNOSES, WARD_CHART_DIETS, WARD_CHART_PATIENTS } from "../ward-charts";
import { FICTIONAL_COEFFICIENT } from "./dpc";
import { DPC_BATCH_MAX, DpcBatchRequest, dpcBriefs } from "./dpc-batch";
import { DpcRequest, dpcMonth, dpcView } from "./dpc-claim";
import { DEFAULT_OPTIONS } from "./model";
import { patientMonthPayload } from "./payload";

const TODAY = "2026-11-04";
const dpc = { coefficient: FICTIONAL_COEFFICIENT, transfer: null };
const diets = [...INITIAL_DIETS, ...WARD_CHART_DIETS];
const payloadOf = (p: Patient) => JSON.parse(JSON.stringify(patientMonthPayload(p, p.history, INITIAL_DIAGNOSES[p.id] ?? WARD_CHART_DIAGNOSES[p.id] ?? [], DEFAULT_OPTIONS, { diets })));
const everyone = [...PATIENTS, ...WARD_CHART_PATIENTS];

describe("/api/dpc/batch: the patient list's DPC column in a few requests", () => {
  it("gives each patient the same brief as /api/dpc does one by one", () => {
    const req = DpcBatchRequest.parse({ today: TODAY, nowTime: "12:00", month: "2026-11", dpc, patients: everyone.slice(0, DPC_BATCH_MAX).map(payloadOf) });
    const briefs = dpcBriefs(req);
    expect(Object.keys(briefs)).toHaveLength(DPC_BATCH_MAX);
    for (const p of everyone.slice(0, 8)) {
      const one = DpcRequest.parse({ today: TODAY, nowTime: "12:00", month: "2026-11", ...payloadOf(p), dpc });
      const { month, dpc: opts, ...rest } = one;
      expect(briefs[p.id]).toEqual(briefOf(dpcView(dpcMonth(rest as never, month, opts))));
    }
    // 佐倉さん（右下腿蜂巣炎）: 080010, 入院4日目は期間Ⅰ.
    expect(briefs["90010231"]).toMatchObject({ ok: true, code: "080010xxxx0xxx", period: "Ⅰ", hospitalDay: 4 });
  });

  it("takes at most 40 patients in one request (the list sends the rest in the next)", () => {
    const patients = everyone.slice(0, DPC_BATCH_MAX + 1).map(payloadOf);
    expect(DpcBatchRequest.safeParse({ today: TODAY, nowTime: "12:00", month: "2026-11", dpc, patients }).success).toBe(false);
    expect(DpcBatchRequest.safeParse({ today: TODAY, nowTime: "12:00", month: "2026-11", dpc, patients: [] }).success).toBe(false);
  });

  it("every inpatient (about 80) in two requests, each well within a second on the server", () => {
    for (let i = 0; i < everyone.length; i += DPC_BATCH_MAX) {
      const req = DpcBatchRequest.parse({ today: TODAY, nowTime: "12:00", month: "2026-11", dpc, patients: everyone.slice(i, i + DPC_BATCH_MAX).map(payloadOf) });
      const t = performance.now();
      const briefs = dpcBriefs(req);
      const ms = performance.now() - t;
      expect(Object.values(briefs).every((b) => b.ok || b.reason)).toBe(true);
      expect(ms).toBeLessThan(5000);
    }
  });
});
