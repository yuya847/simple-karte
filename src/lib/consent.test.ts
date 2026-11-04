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
  it("the transfusion form follows 輸血療法実践ガイド Ⅰ-1-3)a and lists the notice that abolished the old guidelines", () => {
    const t = CONSENT_TEMPLATES.find((x) => x.code === "CONSENT-TRANSFUSION")!;
    expect(t.sources.map((s) => s.url)).toEqual([
      "https://yuketsu.jstmct.or.jp/wp-content/uploads/2026/02/c94fb40adf823eac4fe9feb13f6d6c60.pdf",
      "https://www.mhlw.go.jp/content/11120000/001680857.pdf",
    ]);
    const facts = t.sections.flatMap((s) => s.facts ?? []);
    expect(facts.every((f) => f.source.includes("輸血療法実践ガイド") && /Ⅰ|Ⅱ|Ⅲ/.test(f.source))).toBe(true);
    // The guide's item that the old form did not have: irradiation against 輸血後 GVHD.
    expect(facts.map((f) => f.text)).toContain("説明する項目：リスク軽減策（輸血後 GVHD 予防のため FFP を除く全ての製剤に放射線照射）");
    expect(JSON.stringify(t.sections)).not.toMatch(/輸血療法の実施に関する指針|血液製剤の使用指針|70mL\/kg/);
  });
  it("numbers come with a source (造影CT・中心静脈カテーテル・輸血)", () => {
    for (const code of ["CONSENT-CT-CONTRAST", "CONSENT-CVC", "CONSENT-TRANSFUSION"]) {
      const t = CONSENT_TEMPLATES.find((x) => x.code === code)!;
      const facts = t.sections.flatMap((s) => s.facts ?? []);
      expect(facts.length, code).toBeGreaterThan(2);
      // every source named in a fact is listed in the form's sources
      for (const f of facts) expect(t.sources.some((s) => f.source.startsWith(s.label)), `${code}: ${f.source}`).toBe(true);
      // numbers only inside facts, not in the explanation lines
      for (const s of t.sections) for (const l of s.lines) expect(/\d+(\.\d+)?\s*%/.test(l), `${code}: ${l}`).toBe(false);
    }
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

describe("タブレットの署名", () => {
  it("needs the patient (or the proxy) and the doctor", async () => {
    const { signaturesMissing } = await import("./consent");
    const sig = (role: "本人" | "代諾者" | "説明した医師" | "同席者") => ({ role, name: "x", dataUrl: "data:image/png;base64,", at: { day: 0, time: "10:00" } });
    expect(signaturesMissing([], false)).toEqual(["本人", "説明した医師"]);
    expect(signaturesMissing([sig("本人")], false)).toEqual(["説明した医師"]);
    expect(signaturesMissing([sig("本人"), sig("説明した医師")], true)).toEqual(["代諾者"]);
    expect(signaturesMissing([sig("代諾者"), sig("説明した医師")], true)).toEqual([]);
  });
});
