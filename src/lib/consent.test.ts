import { describe, expect, it } from "vitest";
import { calculateClaim } from "./billing/engine";
import { DEFAULT_OPTIONS } from "./billing/model";
import { CONSENT_TEMPLATES, consentFor } from "./consent";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext } from "./drafts";
import type { OrderEntry, ProcedureOrder } from "./types";

const ctx = (extra: Partial<CheckContext> = {}): CheckContext => ({ activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: (d) => `D${d}`, describe: (o) => o.id, ...extra });

describe("同意書が要るオーダー", () => {
  it("造影CT・中心静脈カテーテル（単純CT・MRI造影はこの試作の雛形なし）", () => {
    expect(consentFor({ type: "imaging", modality: "CT", contrast: "造影" })).toBe("CONSENT-CT-CONTRAST");
    expect(consentFor({ type: "imaging", modality: "CT", contrast: "放射線科一任" })).toBe("CONSENT-CT-CONTRAST");
    expect(consentFor({ type: "imaging", modality: "CT", contrast: "単純" })).toBeNull();
    expect(consentFor({ type: "procedure", code: "PROC-CVC" })).toBe("CONSENT-CVC");
  });
  it("中心静脈カテーテル: 部位と同意書を聞く", () => {
    const d = { ...newProcedureDraft("PROC-CVC", "c"), site: "右内頸静脈" };
    const consent = checkDraft(d, ctx()).find((i) => i.key === "consent")!;
    expect(consent.level).toBe("ask");
    const ready = consent.choices![0].apply!(d);
    expect(isReady(checkDraft(ready, ctx()))).toBe(true);
    expect(toOrder(ready, ctx()).consents).toEqual(["CONSENT-CVC"]);
  });
  it("every template has the parts a form needs", () => {
    for (const t of CONSENT_TEMPLATES) {
      expect(t.sections.some((s) => s.heading.includes("同意しない場合")), t.code).toBe(true);
      for (const s of t.sections) for (const f of s.facts ?? []) expect(f.source.length, `${t.code} ${f.text}`).toBeGreaterThan(0);
    }
  });
});

describe("中心静脈カテーテルの算定", () => {
  const entry = (site: string): OrderEntry => ({ kind: "order", id: site, day: -1, time: "09:00", author: "x", status: "有効", order: { type: "procedure", code: "PROC-CVC", site, schedule: { kind: "continuous" }, start: { day: -1, time: "10:00" } } as ProcedureOrder });
  const claim = (e: OrderEntry) => calculateClaim({ today: "2026-11-02", nowTime: "18:00", month: "2026-11", patient: { id: "t", name: "x", sex: "男", age: 70, admittedOn: -3 }, entries: [e], daily: [], cultures: [], diagnoses: [], options: DEFAULT_OPTIONS });
  it("内頸: G005-2 1,400点 ＋ カテーテル（マルチルーメン 7,210円 → 721点）", () => {
    const a = claim(entry("右内頸静脈")).acts.find((x) => x.parts.some((p) => p.lines.some((l) => l.code === "130004670")))!;
    expect(a.shikibetsu).toBe("33");
    expect(a.parts.map((p) => p.points)).toEqual([1400, 721]);
  });
  it("PICC: G005-3 700点 ＋ 末梢留置型（1,700円 → 170点）", () => {
    const a = claim(entry("右上腕（PICC）")).acts.find((x) => x.parts.some((p) => p.lines.some((l) => l.code === "130011610")))!;
    expect(a.parts.map((p) => p.points)).toEqual([700, 170]);
  });
});
