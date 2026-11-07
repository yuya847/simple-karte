import { describe, expect, it } from "vitest";
import { INSURANCE } from "../billing/insurance";
import { checkInsurance, DEMO_FORMS, hasErrors } from "../billing/registration";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { emptySections, type DischargeDraft } from "../discharge";
import { diseaseKeysOf } from "../masters/byomei";
import { PATIENTS } from "../patients";
import type { OrderEntry } from "../types";
import { nationalServices } from "./adapter";
import { confirmLetter, legacyLetter, newLetter, type Letter, type LetterType } from "../letters";
import { CLINS_NOT_SENT, clinsBundle, conditionResource, labResources, memberId, referralBundleFromLetter, splitAllergy, summaryDocument, type ClinsContext } from "./clins";
import { buildErxBundle, INSTITUTION_10, mockSign } from "./erx";
import { fictionalQualification, formFromQualification, kindOfNumber } from "./onshi";
import { linesFromHomeRx } from "./rx-lines";

const today = { y: 2026, m: 11, d: 4 };
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const mori = PATIENTS.find((p) => p.id === "90010260")!;
const person = (p: typeof kitamura) => ({ id: p.id, name: p.name, kana: p.kana, sex: p.sex as "男" | "女", age: p.age });
const allConsent = { drugs: true, checkups: true, limit: true };
type Res = { resourceType: string; meta: { profile: string[] } } & Record<string, unknown>;
const entries = (b: Record<string, unknown>) => (b.entry as { fullUrl: string; resource: Res }[]).map((e) => e.resource);

describe("オンライン資格確認（模擬）", () => {
  it("answers the demo patients with what their cards say, and copying gives a form that registers", () => {
    for (const p of PATIENTS) {
      const r = fictionalQualification({ person: person(p), consent: allConsent, how: "マイナ保険証" }, today, "10:00");
      expect(r.status).toBe("有効");
      expect(r.info!.insurerNumber).toBe(INSURANCE[p.id].insurerNumber);
      const { form } = formFromQualification(r.info!, today);
      const checks = checkInsurance(form, { age: p.age, on: today });
      expect(hasErrors(checks), `${p.id} ${JSON.stringify(checks.filter((c) => c.level === "error"))}`).toBe(false);
      expect(form.rate).toBe(DEMO_FORMS[p.id].rate);
      expect(form.incomeClass).toBe(DEMO_FORMS[p.id].incomeClass);
    }
  });

  it("gives 薬剤情報 and 特定健診情報 only with the マイナ保険証 and consent", () => {
    const yes = fictionalQualification({ person: person(kitamura), consent: allConsent, how: "マイナ保険証" }, today, "10:00");
    expect(yes.drugs!.map((d) => d.drug)).toContain("スピロノラクトン錠２５ｍｇ「トーワ」");
    expect(yes.drugs![0].institution).toBe("みなと循環器クリニック");
    expect(yes.checkups).toHaveLength(2);
    expect(yes.checkups![0].kind).toBe("後期高齢者健診");
    const no = fictionalQualification({ person: person(kitamura), consent: { drugs: false, checkups: false, limit: false }, how: "マイナ保険証" }, today, "10:00");
    expect(no.drugs).toBeUndefined();
    expect(no.checkups).toBeUndefined();
    expect(no.notGiven.join()).toContain("同意がない");
  });

  it("with the 資格確認書, needs the numbers to match and the consent for the 限度額", () => {
    const f = DEMO_FORMS["90010260"];
    const card = { insurerNumber: f.insurerNumber, symbol: f.symbol, number: f.number, branch: f.branch, birthDate: f.birthDate };
    const ok = fictionalQualification({ person: person(mori), consent: { drugs: true, checkups: true, limit: false }, how: "資格確認書", card }, today, "10:00");
    expect(ok.status).toBe("有効");
    expect(ok.info!.limit).toBeUndefined();
    expect(ok.drugs).toBeUndefined();
    const withLimit = fictionalQualification({ person: person(mori), consent: { drugs: false, checkups: false, limit: true }, how: "資格確認書", card }, today, "10:00");
    expect(withLimit.info!.limit!.classCode).toBe("A03");
    const typo = fictionalQualification({ person: person(mori), consent: allConsent, how: "資格確認書", card: { ...card, number: "65" } }, today, "10:00");
    expect(typo.status).toBe("該当資格なし");
  });

  it("tells the kind of insurer from the number", () => {
    expect(kindOfNumber("140996")).toBe("国保");
    expect(kindOfNumber("39140990")).toBe("後期高齢者");
    expect(kindOfNumber("01140990")).toBe("協会けんぽ");
    expect(kindOfNumber("1234")).toBeNull();
  });
});

describe("電子処方箋（模擬）: HS036 Bundle", () => {
  const lines = linesFromHomeRx(kitamura.history.filter((e): e is OrderEntry => e.kind === "order"));
  const build = buildErxBundle({ patient: { id: kitamura.id, name: kitamura.name, kana: kitamura.kana, sex: kitamura.sex as "男", birthDate: INSURANCE[kitamura.id].birthDate }, department: "総合診療科", doctor: "山本（専攻医）", insurance: INSURANCE[kitamura.id], insuranceAssumed: false, lines, today, time: "10:30", serial: 1, kind: "院内" });

  it("follows the profile names, Composition first, references by urn:uuid", () => {
    const b = build.bundle as Record<string, unknown> & { meta: { profile: string[] } };
    expect(b.type).toBe("document");
    expect(b.meta.profile[0]).toBe("http://jpfhir.jp/fhir/ePrescription/StructureDefinition/JP_Bundle_ePrescriptionData");
    const rs = entries(b);
    expect(rs[0].resourceType).toBe("Composition");
    expect(rs.map((r) => r.meta.profile[0].split("/").pop())).toEqual([
      "JP_Composition_ePrescriptionData",
      "JP_Patient_ePrescriptionData",
      "JP_Encounter_ePrescriptionData",
      "JP_Coverage_ePrescriptionData_insurance",
      "JP_Organization_ePrescriptionData_coveragePayer",
      "JP_Organization_ePrescriptionData_issuer",
      "JP_Organization_ePrescriptionData_departmentOfIssuer",
      "JP_PractitionerRole_ePrescriptionData_author",
      "JP_Practitioner_ePrescriptionData_author",
      ...lines.map(() => "JP_MedicationRequest_ePrescriptionData"),
    ]);
    expect(JSON.stringify(b)).not.toMatch(/"reference":"(Patient|Organization)\//);
    expect(build.prescriptionNo).toBe(`${INSTITUTION_10}-2026-00000001`);
    expect(build.problems).toEqual([]);
  });

  it("writes each drug with its codes, Rp numbers, 1回量・1日量 and the amount to dispense", () => {
    const meds = entries(build.bundle).filter((r) => r.resourceType === "MedicationRequest") as unknown as {
      identifier: { system: string; value: string }[];
      medicationCodeableConcept: { coding: { system: string; code: string }[] };
      dosageInstruction: { doseAndRate: { doseQuantity: { value: number; code: string }; rateRatio: { numerator: { value: number } } }[] }[];
      dispenseRequest: { quantity: { value: number }; expectedSupplyDuration: { value: number } };
    }[];
    const mgo = meds[3];
    expect(mgo.identifier.map((i) => i.value)).toEqual(["2", "1"]);
    expect(mgo.medicationCodeableConcept.coding.map((c) => `${c.system}|${c.code}`)).toEqual(["urn:oid:1.2.392.100495.20.1.71|620005434", "urn:oid:1.2.392.100495.20.1.72|2344009F2015", "urn:oid:1.2.392.100495.20.1.81|2344009F2ZZZ"]);
    expect(mgo.dosageInstruction[0].doseAndRate[0].doseQuantity).toMatchObject({ value: 1, code: "TAB" });
    expect(mgo.dosageInstruction[0].doseAndRate[0].rateRatio.numerator.value).toBe(2);
    expect(mgo.dispenseRequest.quantity.value).toBe(28);
    expect(mgo.dispenseRequest.expectedSupplyDuration.value).toBe(14);
    expect(meds[2].identifier.map((i) => i.value)).toEqual(["1", "3"]);
  });

  it("signs with a hash (模擬) in Bundle.signature, and registers with a 6-digit 引換番号 only for 院外", async () => {
    const signed = await mockSign(build, "2026-11-04T10:31:00.000+09:00");
    expect(signed.signature.data).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect((signed.bundle.signature as { type: { code: string }[] }).type[0].code).toBe("1.2.840.10065.1.12.1.1");
    const out = await nationalServices.registerPrescription({ patientKey: kitamura.id, bundle: signed.bundle, signature: signed.signature, kind: "院外", today, time: "10:31" });
    expect(out.exchangeNo).toMatch(/^\d{6}$/);
    const inner = await nationalServices.registerPrescription({ patientKey: kitamura.id, bundle: build.bundle, signature: null, kind: "院内", today, time: "10:31" });
    expect(inner.exchangeNo).toBeUndefined();
  });
});

describe("電子カルテ情報共有サービス（模擬）: JP-CLINS", () => {
  const diagnoses = INITIAL_DIAGNOSES[kitamura.id];
  const ctx: ClinsContext = { patient: kitamura, birthDate: INSURANCE[kitamura.id].birthDate, insurance: INSURANCE[kitamura.id], insuranceAssumed: false, diagnoses, diseaseKeys: diseaseKeysOf(diagnoses.map((d) => d.code)), doctor: "山本（専攻医）", today, time: "11:00" };

  it("looks up the 病名管理番号 in the official 傷病名マスター and codes the Condition with it", () => {
    expect(ctx.diseaseKeys["4289018"].keyNumber).toMatch(/^\d{8}$/);
    const c = conditionResource(ctx, diagnoses[0], "2026-11-04T11:00:00+09:00") as unknown as { code: { coding: { system: string; code: string }[] }; extension: { url: string }[]; clinicalStatus: { coding: { code: string }[] } };
    expect(c.code.coding[0]).toMatchObject({ system: "http://medis.or.jp/CodeSystem/master-disease-keyNumber", code: ctx.diseaseKeys["4289018"].keyNumber });
    expect(c.code.coding.some((x) => x.system.endsWith("masterB-disease") && x.code === "4289018")).toBe(true);
    expect(c.extension.map((e) => e.url.split("/").pop())).toEqual(["JP_eCS_InstitutionNumber", "JP_eCS_Department", "JP_eCS_DiagnosisType"]);
    expect(c.clinicalStatus.coding[0].code).toBe("active");
  });

  it("puts one kind per collection, the Patient first with the 被保険者個人識別子", () => {
    const b = clinsBundle(ctx, "Observation", labResources(ctx, "2026-11-04T11:00:00+09:00")) as unknown as { type: string; meta: { tag: { code: string }[] }; entry: { fullUrl: string; resource: Res }[] };
    expect(b.type).toBe("collection");
    expect(b.meta.tag[0].code).toBe("Observation");
    expect(b.entry[0].resource.resourceType).toBe("Patient");
    expect(JSON.stringify(b.entry[0].resource)).toContain(memberId(INSURANCE[kitamura.id]));
    expect(b.entry.slice(1).every((e) => e.resource.resourceType === "Observation")).toBe(true);
    expect(JSON.stringify(b)).not.toContain("urn:uuid:patient");
    expect(JSON.stringify(b).includes(`"reference":"${b.entry[0].fullUrl}"`)).toBe(true);
  });

  it("makes the 退院時サマリー, and the 診療情報提供書 of the letter the old 退院サマリ issued, with the same document id", () => {
    const draft: DischargeDraft = { patientId: kitamura.id, dischargeDay: 1, destination: "自宅", outcome: "1", route: "1", sections: { ...emptySections(), complaint: "息切れ", course: "利尿薬で改善" }, status: "確定", confirmedBy: "山本（専攻医）", letter: { to: "みなと循環器クリニック", dept: "循環器内科", doctor: "", purpose: "退院後の経過観察", issuedAt: { day: 0, time: "11:00" } } };
    const lines = linesFromHomeRx(kitamura.history.filter((e): e is OrderEntry => e.kind === "order"));
    const summary = summaryDocument(ctx, { draft, admittedOn: kitamura.admittedOn, lines, allergies: [{ text: "NSAIDs（喘息発作）", from: "アレルギー", send: true, category: "medication" }] });
    const docs = { summary, referral: referralBundleFromLetter(ctx, { letter: legacyLetter(draft)!, admittedOn: kitamura.admittedOn, lines, allergies: [], discharge: draft }).referral };
    const s = docs.summary as { identifier: { value: string }; entry: { resource: Res }[] };
    expect(s.entry[0].resource.meta.profile[0]).toBe("http://jpfhir.jp/fhir/eDischargeSummary/StructureDefinition/JP_Composition_eDischargeSummary|1.13.0");
    const codes = JSON.stringify(s.entry[0].resource).match(/"code":"(\d{3})"/g)!.map((x) => x.slice(8, 11));
    for (const c of ["300", "322", "312", "324", "342", "352", "360", "333", "344", "444", "424"]) expect(codes).toContain(c);
    const r = docs.referral as { identifier: { value: string }; entry: { resource: Res }[] };
    expect(r.identifier.value).toBe(s.identifier.value);
    expect(r.identifier.value).toBe(`${INSTITUTION_10}^2026^DOC-${kitamura.id}`);
    const rc = JSON.stringify(r.entry[0].resource);
    for (const c of ["920", "910", "300", "950", "340", "360"]) expect(rc).toContain(`"code":"${c}"`);
    expect(JSON.stringify(docs)).not.toContain("<table");
    expect(splitAllergy("NSAIDs（喘息発作）")).toEqual({ substance: "NSAIDs", reaction: "喘息発作" });
  });

  it("shows another hospital's 6情報 only with consent (模擬)", async () => {
    const no = await nationalServices.otherHospitalInfo({ patientKey: kitamura.id, consent: false, today, time: "11:00" });
    expect(no.items).toEqual([]);
    const yes = await nationalServices.otherHospitalInfo({ patientKey: kitamura.id, consent: true, today, time: "11:00" });
    expect(yes.items.map((i) => i.kind)).toContain("薬剤アレルギー等");
  });
});

describe("電子カルテ情報共有サービス（模擬）: 紹介状から診療情報提供書（HS038）", () => {
  const diagnoses = INITIAL_DIAGNOSES[kitamura.id];
  const ctx: ClinsContext = { patient: kitamura, birthDate: INSURANCE[kitamura.id].birthDate, insurance: INSURANCE[kitamura.id], insuranceAssumed: false, diagnoses, diseaseKeys: diseaseKeysOf(diagnoses.map((d) => d.code)), doctor: "看護師 太郎", today, time: "11:00" };
  const chart = { patient: kitamura, entries: kitamura.history, diagnoses, today };
  const at = { day: 0, time: "10:00" };
  const lines = linesFromHomeRx(kitamura.history.filter((e): e is OrderEntry => e.kind === "order"));
  const letter = (type: LetterType, patch: Partial<Letter> = {}): Letter => confirmLetter({ ...newLetter(`L-${type}`, chart, type, "山本（専攻医）", at), to: "架空みどり病院", dept: "循環器内科", purpose: "経過観察のお願い", ...patch }, undefined, "山本（専攻医）", at);
  const build = (l: Letter, discharge?: DischargeDraft) => referralBundleFromLetter(ctx, { letter: l, admittedOn: kitamura.admittedOn, lines, allergies: [], discharge });
  const comp = (b: Record<string, unknown> | null) => (b!.entry as { resource: Res }[])[0].resource;
  const summaryDraft = (status: DischargeDraft["status"]): DischargeDraft => ({ patientId: kitamura.id, dischargeDay: 1, destination: "自宅", outcome: "1", route: "1", sections: { ...emptySections(), course: "利尿薬で改善" }, status, letter: { to: "", dept: "", doctor: "", purpose: "" } });

  it("sends the kinds written to a 医療機関 (紹介・返書・照会・歯科), not 老健・介護医療院, 市町村・居宅 nor セカンドオピニオン, and never a draft", () => {
    for (const t of ["紹介", "返書", "照会", "歯科"] as LetterType[]) {
      const d = build(letter(t));
      expect(d.notSent, t).toBeNull();
      expect(d.referral, t).not.toBeNull();
    }
    for (const t of ["介護施設", "保健福祉", "セカンドオピニオン"] as LetterType[]) {
      const d = build(letter(t));
      expect(d.referral, t).toBeNull();
      expect(d.notSent, t).toBe(CLINS_NOT_SENT[t]);
    }
    expect(build(letter("セカンドオピニオン")).notSent).toContain("患者に渡す");
    expect(build({ ...newLetter("d", chart, "紹介", "山本（専攻医）", at), to: "架空みどり病院", purpose: "x" }).notSent).toBe("確定していない");
  });

  it("names what is missing (Unfilled) instead of making the document: 宛先, 紹介目的, 傷病名, the doctor who confirmed", () => {
    const d = build(letter("紹介", { to: " ", purpose: "" }));
    expect(d.referral).toBeNull();
    expect(d.missing.map((m) => m.field)).toEqual(["紹介先情報（910）の医療機関名（必須）", "紹介目的（950）（必須）"]);
    expect(d.missing[0].why).toBe("紹介先の医療機関が空");
    const bare = referralBundleFromLetter({ ...ctx, diagnoses: [] }, { letter: { ...letter("紹介", { body: {} }), confirmedBy: "" }, admittedOn: kitamura.admittedOn, lines, allergies: [] });
    expect(bare.missing.map((m) => m.field)).toEqual(["傷病名・主訴（340）（必須）", "作成者（Composition.author の医師）（必須）"]);
  });

  it("puts the letter's fields in the sections, the confirming doctor as the author, and the version", () => {
    const l = letter("照会", { body: { diagnosis: "慢性心不全", question: "以前の心エコーの結果", findings: "BNP 286", remarks: "特になし" } });
    const c = comp(build(l).referral);
    const text = JSON.stringify(c);
    expect(c.meta.profile[0]).toBe("http://jpfhir.jp/fhir/eReferral/StructureDefinition/JP_Composition_eReferral|1.13.0");
    expect(c.title).toBe("診療情報提供のお願い");
    expect(text).toContain("<p>お尋ねしたいこと：以前の心エコーの結果</p>");
    expect(text).toContain("<p>症状経過・検査結果：BNP 286</p><p>備考：特になし</p>");
    expect(text).toContain("<p>慢性心不全</p>");
    expect(text).not.toContain('"code":"210"');
    const doctor = (build(l).referral!.entry as { resource: Res }[]).find((e) => e.resource.resourceType === "Practitioner")!.resource;
    expect(JSON.stringify(doctor)).toContain("山本");
    expect(JSON.stringify(doctor)).not.toContain("看護師");
    const fixed = confirmLetter({ ...l, purpose: "心エコーの結果のお願い" }, l, "山本（専攻医）", { day: 0, time: "12:00" }, "目的を直した");
    const c2 = comp(build(fixed).referral) as Res & { extension: { valueString: string }[]; date: string };
    expect(c2.extension[0].valueString).toBe("2");
    expect(c2.date).toBe("2026-11-04T12:00:00+09:00");
    expect(build(fixed).documentId).toBe(build(l).documentId);
    expect(build(l).documentId).toBe(`${INSTITUTION_10}^2026^DOC-L-照会`);
  });

  it("attaches the 退院時サマリー with the same document id only to a 紹介 with 注8's 添付, once the summary is confirmed", () => {
    const attach = letter("紹介", { flags: { consent: true, attach: true } });
    const d = build(attach, summaryDraft("確定"));
    expect(d.summary).not.toBeNull();
    expect((d.summary as { identifier: { value: string } }).identifier.value).toBe(d.documentId);
    expect((d.referral as { identifier: { value: string } }).identifier.value).toBe(d.documentId);
    expect(JSON.stringify(comp(d.referral))).toContain('"code":"210"');
    expect(comp(d.summary).meta.profile[0]).toContain("JP_Composition_eDischargeSummary");
    expect(build(attach, summaryDraft("作成中")).summary).toBeNull();
    expect(build(letter("紹介", { flags: { consent: true } }), summaryDraft("確定")).summary).toBeNull();
    expect(build(letter("返書", { flags: { attach: true } }), summaryDraft("確定")).summary).toBeNull();
  });
});

