import { describe, expect, it } from "vitest";
import { DOCUMENT_CATALOG, DOCUMENT_CATEGORIES, filterDocuments, hasActiveCancer, hasPlannedSurgery, orderConsentCodes, suggestedDocuments, surgeryConsentCodes } from "./document-catalog";
import { CONSENT_TEMPLATES, consentFieldsMissing, findConsent } from "./consent";
import { PROCEDURE_CONSENTS } from "./consent-procedures";
import type { OrderEntry } from "./types";

const search = (q: string) => filterDocuments(DOCUMENT_CATALOG, q).map(i => i.id);
describe("書類を探す", () => {
  it("名前・よみ・略称と全角半角・カタカナで検索する", () => {
    expect(search("しんだんしょ")).toContain("診断書");
    expect(search("シンダンショ")).toContain("診断書");
    expect(search("紹介")).toContain("referral");
    expect(search("意見書")).toContain("主治医意見書");
    expect(search("主治医意見書")).toEqual(["主治医意見書"]);
    expect(search("死亡")).toEqual(expect.arrayContaining(["死亡診断書", "死体検案書"]));
    expect(search("ｅｇｄ")).toContain("CONSENT-EGD");
    expect(search("じんせいけん")).toContain("CONSENT-RENAL-BIOPSY");
    expect(search("存在しない書類")).toEqual([]);
  });
  it("全分類に実際に作成できる項目があり、検索と分類を組み合わせる", () => {
    for (const c of DOCUMENT_CATEGORIES) expect(filterDocuments(DOCUMENT_CATALOG, "", c).length, c).toBeGreaterThan(0);
    expect(filterDocuments(DOCUMENT_CATALOG, "診断書", "死亡").map(i => i.id)).toEqual(["死亡診断書"]);
    expect(new Set(DOCUMENT_CATALOG.map(i => i.id)).size).toBe(DOCUMENT_CATALOG.length);
  });
});
describe("患者ごとの作成候補", () => {
  it("入院当日から7日目まで、未来の入院日は除く", () => {
    for (const day of [0, -6]) expect(suggestedDocuments({ admittedOn: day }, [])).toEqual([{ id: "入院診療計画書", reason: "入院7日以内" }]);
    for (const day of [1, -7]) expect(suggestedDocuments({ admittedOn: day }, [])).toEqual([]);
  });
  it("終了した手術と別患者の手術は予定の候補から除く", () => {
    expect(hasPlannedSurgery([{ patientId: "a", day: 0, status: "退室" }, { patientId: "b", day: 1, status: "申込" }], "a")).toBe(false);
    expect(hasPlannedSurgery([{ patientId: "a", day: 1, status: "受付済" }], "a")).toBe(true);
  });
  it("有効な退院予定だけを拾い、手術・がんの候補も決定的に作る", () => {
    const entry = (status: string) => ({ status, order: { type: "procedure", leave: { kind: "退院" } } }) as OrderEntry;
    expect(suggestedDocuments({ admittedOn: -10 }, [entry("中止")])).toEqual([]);
    const ids = suggestedDocuments({ admittedOn: -10 }, [entry("有効")], true, true).map(s => s.id);
    expect(ids).toEqual(["退院証明書", "退院療養計画書", "CONSENT-SURGERY", "CONSENT-ANESTHESIA", "CONSENT-CHEMOTHERAPY", "CONSENT-RADIOTHERAPY"]);
    expect(hasActiveCancer([{ icd10: "C34.9", outcome: "継続" }])).toBe(true);
    expect(hasActiveCancer([{ icd10: "C34.9", outcome: "治癒" }, { icd10: "J18", outcome: "継続" }])).toBe(false);
  });
});
describe("オーダと同意書の下書き", () => {
  it.each([["PHY-EGD", "CONSENT-EGD"], ["PHY-CF", "CONSENT-COLONOSCOPY"], ["PHY-BF", "CONSENT-BRONCHOSCOPY"]])("%s", (test, code) => {
    expect(orderConsentCodes({ type: "physio", test })).toEqual([code]);
    expect(findConsent(code as Parameters<typeof findConsent>[0]).code).toBe(code);
  });
  it("透析・造影検査・手術に対応し、不要な検査には付けない", () => {
    expect(orderConsentCodes({ type: "procedure", code: "PROC-HD" })).toEqual(["CONSENT-DIALYSIS"]);
    expect(orderConsentCodes({ type: "imaging", modality: "CT", contrast: "単純" })).toEqual([]);
    expect(orderConsentCodes({ type: "physio", test: "PHY-ECG" })).toEqual([]);
    expect(orderConsentCodes({ type: "imaging", modality: "MRI", contrast: "造影" })).toEqual(["CONSENT-MRI-CONTRAST"]);
    expect(surgeryConsentCodes({ laparoscopic: true, procedure: "胆嚢摘出" })).toEqual(["CONSENT-SURGERY", "CONSENT-ANESTHESIA", "CONSENT-LAPAROSCOPY"]);
    expect(surgeryConsentCodes({ laparoscopic: false, procedure: "人工骨頭置換" })).toContain("CONSENT-HEMIARTHROPLASTY");
    expect(surgeryConsentCodes({ laparoscopic: false, procedure: "観血的整復固定" })).toContain("CONSENT-ORIF");
  });
  it("患者別の術式・レジメン等が空欄なら署名前に確認する", () => {
    const t = findConsent("CONSENT-SURGERY");
    expect(consentFieldsMissing(t, { details: { "術式・手技": "胆嚢摘出", "左右": "なし", "部位": "胆嚢" } })).toEqual(["個別の合併症と頻度"]);
    expect(consentFieldsMissing(findConsent("CONSENT-ANESTHESIA"), {})).toEqual([]);
    expect(consentFieldsMissing(findConsent("CONSENT-CHEMOTHERAPY"), {}).length).toBe(5);
  });
  it("追加34種類は既存と同じ構造を持ち、名称とコードが重複しない", () => {
    expect(PROCEDURE_CONSENTS).toHaveLength(34);
    expect(new Set(CONSENT_TEMPLATES.map(t => t.code)).size).toBe(CONSENT_TEMPLATES.length);
    for (const t of PROCEDURE_CONSENTS) {
      expect(t.sections.map(s => s.heading)).toEqual(["目的", "方法", "予想される効果", "主な合併症・不利益", "代替手段", "実施しなかった場合", "同意しない場合・同意の撤回"]);
      expect(t.fields?.length).toBeGreaterThan(0);
      expect(t.sections.every(s => s.lines.every(l => l.trim()))).toBe(true);
    }
  });
});
