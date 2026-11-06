// 電子カルテ情報共有サービス（模擬）: the 診療情報提供書 and 退院時サマリー as FHIR documents, and the
// 臨床情報 (傷病名・アレルギー・検査; 感染症 when there are its lab results) as the collections the service
// takes, following the public JP-CLINS 実装ガイド v1.13.0 (HS038・HS039) — profile names, code systems and
// required elements, as far as the app's data goes. Nothing is sent: the send and the receipt are SIMULATED
// (adapter.ts). The other hospital's 6情報 shown to the doctor are FICTIONAL.

import { addDays, isoDate, type CalendarDate } from "../dates";
import { HOSPITAL } from "../billing/facility";
import type { Insurance } from "../billing/insurance";
import { diagnosisLabel, isSuspected, type Diagnosis } from "../diagnoses";
import { labelOf, OUTCOMES, ROUTES, SECTIONS, type DischargeDraft } from "../discharge";
import { ANALYTES } from "../master";
import type { Patient } from "../types";
import { PRESCRIPTION_DRUG_CODES } from "./drug-codes";
import { HOSPITAL_ADDRESS, INSTITUTION_10 } from "./erx";
import { jstDateTime, uuidOf } from "./fictional";
import type { RxLine } from "./rx-lines";
import type { SpecRef, Unfilled } from "./spec";

export const CLINS_VERSION = "1.13.0";

export const CLINS_SPECS: SpecRef[] = [
  { name: "電子カルテ情報共有サービス2文書5情報+患者サマリー FHIR実装ガイド JP-CLINS（日本医療情報学会）", version: `v${CLINS_VERSION}（2026-08-31）`, url: "https://jpfhir.jp/fhir/clins/igv1/", note: "プロファイル名・コード体系・必須の要素（配布パッケージの StructureDefinition から）" },
  { name: "厚生労働省標準規格 HS038「診療情報提供書 HL7FHIR 記述仕様」", version: "第1.13版（2026-08-31）", url: "https://std.jpfhir.jp/stddoc/eReferralFHIR_v1x.pdf" },
  { name: "厚生労働省標準規格 HS039「退院時サマリー HL7 FHIR 記述仕様」", version: "第1.13版（2026-08-31）", url: "https://std.jpfhir.jp/stddoc/eDischargeSummaryFHIR_v1x.pdf" },
  { name: "厚生労働省標準規格 HS037「健康診断結果報告書 HL7FHIR 記述仕様」", version: "第1.7版（2026年2月）", url: "https://std.jpfhir.jp/stddoc/eCheckupFHIR_v1x.pdf", note: "この試作には健診の記録がないので作らない" },
  { name: "厚生労働省「電子カルテ情報共有サービス システムベンダ向け技術解説書」", version: "v2.1.0（令和8年6月）", url: "https://www.mhlw.go.jp/content/10800000/001716885.pdf", note: "登録の流れ（文書情報登録・カルテ臨床情報登録）、退院時サマリーは診療情報提供書の添付、文書の中の情報と処方は臨床情報として取り出さないこと、保存期間" },
  { name: "厚生労働省「電子カルテ情報共有サービス」", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/johoka/denkarukyouyuu.html" },
  { name: "厚生労働省標準規格の一覧（令和7年1月29日の通知）", url: "https://www.mhlw.go.jp/content/10800000/001389373.pdf" },
];

const V = `|${CLINS_VERSION}`;
const ECS = "http://jpfhir.jp/fhir/eCS/StructureDefinition/";
const CLINS_SD = "http://jpfhir.jp/fhir/clins/StructureDefinition/";
const SECTION_CS = "http://jpfhir.jp/fhir/clins/CodeSystem/document-section";
const RES_ID = "http://jpfhir.jp/fhir/core/IdSystem/resourceInstance-identifier";
const INST_NO = "http://jpfhir.jp/fhir/core/IdSystem/insurance-medical-institution-no";
const NAME_REP = "http://hl7.org/fhir/StructureDefinition/iso21090-EN-representation";
const EMPTY_CS = "http://terminology.hl7.org/CodeSystem/list-empty-reason";

/** 病名管理番号 and 病名交換用コード from the official 傷病名マスター (asked for on the server: /api/byomei?keys=). */
export type DiseaseKeys = Record<string, { keyNumber: string; exCode: string }>;

export interface ClinsContext {
  patient: Patient;
  birthDate: string;
  insurance: Insurance;
  insuranceAssumed: boolean;
  diagnoses: Diagnosis[];
  diseaseKeys: DiseaseKeys;
  doctor: string;
  today: CalendarDate;
  time: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Narrative with only the tags the service allows (div, p, br). */
const narrative = (lines: string[]) => ({ status: "additional", div: `<div xmlns="http://www.w3.org/1999/xhtml">${lines.filter((l) => l.trim()).map((l) => `<p>${esc(l).replace(/\n/g, "<br/>")}</p>`).join("") || "<p>記載なし</p>"}</div>` });
const meta = (profile: string, at: string) => ({ lastUpdated: at, profile: [`${profile}${V}`] });
const sec = (code: string, title: string) => ({ title, code: { coding: [{ system: SECTION_CS, code, display: `${title}セクション` }] } });
const nameOf = (name: string, rep: "IDE" | "SYL") => {
  // JP_Patient_eCS: no full-width spaces in names.
  const parts = name.trim().split(/[\s　]+/);
  return { extension: [{ url: NAME_REP, valueCode: rep }], use: "official", text: parts.join(" "), family: parts[0], ...(parts.length > 1 ? { given: [parts.slice(1).join(" ")] } : {}) };
};
const instExt = { url: "http://jpfhir.jp/fhir/clins/Extension/StructureDefinition/JP_eCS_InstitutionNumber", valueIdentifier: { system: INST_NO, value: INSTITUTION_10 } };
const deptExt = (dept: string) => ({ url: "http://jpfhir.jp/fhir/eCS/Extension/StructureDefinition/JP_eCS_Department", valueCodeableConcept: { text: dept } });
const idOf = (year: number, local: string) => ({ system: RES_ID, value: `${INSTITUTION_10}^${year}^${local.slice(0, 36)}` });

/** 被保険者個人識別子 "保険者番号8桁:記号:番号:枝番" (国保の6桁 is left-padded to 8). */
export const memberId = (ins: Insurance) => `${ins.insurerNumber.padStart(8, "0")}:${ins.symbol ?? ""}:${ins.number}:${ins.branch ?? ""}`;

function patientResource(c: ClinsContext, at: string) {
  return {
    resourceType: "Patient",
    meta: meta(`${ECS}JP_Patient_eCS`, at),
    identifier: [
      { system: `urn:oid:1.2.392.100495.20.3.51.1${INSTITUTION_10}`, value: c.patient.id },
      { system: "http://jpfhir.jp/fhir/clins/Idsystem/JP_Insurance_memberID", value: memberId(c.insurance) },
    ],
    name: [nameOf(c.patient.name, "IDE"), nameOf(c.patient.kana, "SYL")],
    gender: c.patient.sex === "男" ? "male" : "female",
    birthDate: c.birthDate,
  };
}

const hospitalOrg = (at: string) => ({
  resourceType: "Organization",
  meta: meta(`${ECS}JP_Organization_eCS`, at),
  identifier: [{ system: INST_NO, value: INSTITUTION_10 }],
  type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov" }] }],
  name: HOSPITAL.name,
  telecom: [{ system: "phone", value: HOSPITAL.tel }],
  address: [{ text: HOSPITAL_ADDRESS }],
});

const practitioner = (doctor: string, at: string) => ({
  resourceType: "Practitioner",
  meta: meta(`${ECS}JP_Practitioner_eCS`, at),
  identifier: [{ system: `urn:oid:1.2.392.100495.20.3.41.1${INSTITUTION_10}`, value: `D-${uuidOf(doctor).slice(0, 6)}` }],
  name: [{ extension: [{ url: NAME_REP, valueCode: "IDE" }], text: doctor.replace(/[（(].*$/, "") }],
});

// ---------------------------------------------------------------------------
// 臨床情報: 傷病名 (Condition)
// ---------------------------------------------------------------------------

/** clinicalStatus from the app's 転帰 (死亡・中止 → unknown: この試作の取り決め). */
const clinical = (d: Diagnosis) => (d.outcome === "継続" ? "active" : d.outcome === "治癒" ? "resolved" : "unknown");

export function conditionResource(c: ClinsContext, d: Diagnosis, at: string, encounterClass: "IMP" | "AMB" = "IMP") {
  const keys = c.diseaseKeys[d.code];
  const day = (n: number) => isoDate(addDays(c.today, n));
  const status = clinical(d);
  return {
    resourceType: "Condition",
    meta: meta(`${ECS}JP_Condition_eCS`, at),
    contained: [{ resourceType: "Encounter", id: "enc", meta: { profile: [`${ECS}JP_Encounter_eCS${V}`] }, identifier: [idOf(c.today.y, `enc-${c.patient.id}`)], status: "finished", class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: encounterClass, display: encounterClass === "IMP" ? "入院" : "外来" } }],
    extension: [instExt, deptExt(c.patient.department), ...(d.main ? [{ url: "http://jpfhir.jp/fhir/eCS/Extension/StructureDefinition/JP_eCS_DiagnosisType", valueCodeableConcept: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/ex-diagnosistype", code: "principal" }] } }] : [])],
    identifier: [idOf(c.today.y, `cond-${d.id}`)],
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: status }] },
    verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: isSuspected(d) ? "unconfirmed" : "confirmed" }] },
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "encounter-diagnosis" }] }],
    code: {
      coding: [
        { system: "http://medis.or.jp/CodeSystem/master-disease-keyNumber", code: keys?.keyNumber ?? "99999999", display: d.name },
        ...(keys?.exCode ? [{ system: "http://medis.or.jp/CodeSystem/master-disease-exCode", code: keys.exCode, display: d.name }] : []),
        ...(d.code !== "0000999" ? [{ system: "http://jpfhir.jp/fhir/core/mhlw/CodeSystem/masterB-disease", code: d.code, display: d.name }] : []),
        ...(d.icd10 ? [{ system: "http://jpfhir.jp/fhir/core/mhlw/CodeSystem/ICD10-2013-full", code: d.icd10 }] : []),
      ],
      text: diagnosisLabel(d),
    },
    subject: { reference: "urn:uuid:patient" },
    encounter: { reference: "#enc" },
    onsetDateTime: day(d.start),
    ...(status === "resolved" ? { abatementDateTime: day(d.outcomeDay ?? 0) } : {}),
  };
}

// ---------------------------------------------------------------------------
// 臨床情報: アレルギー (AllergyIntolerance)
// ---------------------------------------------------------------------------

/** What the doctor chose for one allergy or 禁忌 of the profile (nothing is chosen in advance). */
export interface AllergyChoice {
  text: string;
  from: "アレルギー" | "禁忌";
  send: boolean;
  /** 薬剤アレルギー等 (medication) or その他アレルギー等 (food / environment). */
  category: "medication" | "food" | "environment" | "";
}

const ALLERGY_DUMMY: Record<Exclude<AllergyChoice["category"], "">, { system: string; code: string; display: string }> = {
  medication: { system: "http://jpfhir.jp/fhir/core/CodeSystem/YCM/JP_JfagyMedicationAllergen_CS", code: "D9M000000000", display: "医薬品（コード化できない）" },
  food: { system: "http://jpfhir.jp/fhir/core/CodeSystem/JP_JfagyFoodAllergen_CS", code: "D9F000000000", display: "食物（コード化できない）" },
  environment: { system: "http://jpfhir.jp/fhir/core/CodeSystem/JP_JfagyNonFoodNonMedicationAllergen_CS", code: "D9N000000000", display: "医薬品・食物以外（コード化できない）" },
};

/** "ヨード造影剤（蕁麻疹）" → substance and reaction. */
export const splitAllergy = (t: string) => {
  const m = t.match(/^(.*?)[（(](.+)[）)]$/);
  return m ? { substance: m[1].trim(), reaction: m[2].trim() } : { substance: t.trim(), reaction: "" };
};

export function allergyResource(c: ClinsContext, a: AllergyChoice, i: number, at: string) {
  const { substance, reaction } = splitAllergy(a.text);
  const code = ALLERGY_DUMMY[a.category || "environment"];
  return {
    resourceType: "AllergyIntolerance",
    meta: meta(`${ECS}JP_AllergyIntolerance_eCS`, at),
    extension: [instExt],
    identifier: [idOf(c.today.y, `alg-${c.patient.id}-${i}`)],
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] },
    verificationStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "confirmed" }] },
    category: [a.category || "environment"],
    code: { coding: [code], text: substance },
    patient: { reference: "urn:uuid:patient" },
    ...(reaction ? { reaction: [{ manifestation: [{ text: reaction }] }] } : {}),
  };
}

// ---------------------------------------------------------------------------
// 臨床情報: 検査 (Observation)
// ---------------------------------------------------------------------------

export function labResources(c: ClinsContext, at: string) {
  const out: Record<string, unknown>[] = [];
  const contained = [
    { resourceType: "Encounter", id: "enc", meta: { profile: [`${ECS}JP_Encounter_eCS${V}`] }, identifier: [idOf(c.today.y, `enc-${c.patient.id}`)], status: "finished", class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "入院" } },
    { resourceType: "Practitioner", id: "dr", meta: { profile: [`${ECS}JP_Practitioner_eCS${V}`] }, name: [{ text: c.doctor.replace(/[（(].*$/, "") }] },
  ];
  for (const lab of c.patient.labs) {
    for (const [code, value] of Object.entries(lab.values)) {
      const a = ANALYTES.find((x) => x.code === code);
      if (!a) continue;
      const range = (c.patient.sex === "男" ? a.m : a.f) ?? { low: a.low, high: a.high };
      const flag = range.high !== undefined && value > range.high ? "H" : range.low !== undefined && value < range.low ? "L" : "N";
      out.push({
        resourceType: "Observation",
        meta: meta(`${ECS}JP_Observation_LabResult_eCS`, at),
        contained,
        extension: [instExt, deptExt(c.patient.department)],
        identifier: [idOf(c.today.y, `lab-${c.patient.id}-${lab.day}-${lab.time}-${code}`)],
        status: "final",
        category: [{ coding: [{ system: "http://jpfhir.jp/fhir/core/CodeSystem/JP_SimpleObservationCategory_CS", code: "laboratory" }] }],
        code: {
          coding: [
            { system: "http://jpfhir.jp/fhir/clins/CodeSystem/JP_CLINS_ObsLabResult_Uncoded_CS", code: "99999999999999999", display: "未標準化コード項目(JLAC)" },
            { system: "http://jpfhir.jp/fhir/clins/CodeSystem/JP_CLINS_ObsLabResult_LocalCode_CS", code: `${code}_B`, display: a.name },
          ],
          text: a.name,
        },
        subject: { reference: "urn:uuid:patient" },
        encounter: { reference: "#enc" },
        effectiveDateTime: jstDateTime(isoDate(addDays(c.today, lab.day)), lab.time),
        performer: [{ reference: "#dr" }],
        valueQuantity: { value, unit: a.unit },
        interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: flag }] }],
        ...(range.low !== undefined || range.high !== undefined ? { referenceRange: [{ ...(range.low !== undefined ? { low: { value: range.low, unit: a.unit } } : {}), ...(range.high !== undefined ? { high: { value: range.high, unit: a.unit } } : {}) }] } : {}),
      });
    }
  }
  return out;
}

/** One collection per kind of resource (JP_Bundle_CLINS: meta.tag names the kind; the Patient comes first). */
export function clinsBundle(c: ClinsContext, kind: "Condition" | "AllergyIntolerance" | "Observation", resources: Record<string, unknown>[]) {
  const at = jstDateTime(isoDate(c.today), c.time);
  const id = `${INSTITUTION_10}^${c.today.y}^${kind.slice(0, 4).toUpperCase()}-${c.patient.id}`;
  const fix = (r: Record<string, unknown>, i: number) => ({ fullUrl: `urn:uuid:${uuidOf(`${id}|${i}`)}`, resource: r });
  const patientUrl = `urn:uuid:${uuidOf(`${id}|patient`)}`;
  const entries = resources.map(fix);
  // Point the references at the Patient entry's fullUrl.
  const text = JSON.stringify(entries).replaceAll("urn:uuid:patient", patientUrl);
  return {
    resourceType: "Bundle",
    meta: { lastUpdated: at, profile: [`${CLINS_SD}JP_Bundle_CLINS${V}`], tag: [{ system: "http://jpfhir.jp/fhir/clins/CodeSystem/BundleResourceType_CS", code: kind }] },
    identifier: { system: "http://jpfhir.jp/fhir/clins/bundle-identifier", value: id },
    type: "collection",
    timestamp: at,
    entry: [{ fullUrl: patientUrl, resource: patientResource(c, at) }, ...JSON.parse(text)],
  };
}

// ---------------------------------------------------------------------------
// 2文書: 診療情報提供書（退院時の紹介状）and 退院時サマリー
// ---------------------------------------------------------------------------

const medResource = (c: ClinsContext, l: RxLine, i: number, at: string) => {
  const codes = PRESCRIPTION_DRUG_CODES[l.drug];
  return {
    resourceType: "MedicationRequest",
    meta: meta(`${ECS}JP_MedicationRequest_eCS`, at),
    extension: [instExt],
    identifier: [
      { system: "http://jpfhir.jp/fhir/core/mhlw/IdSystem/Medication-RPGroupNumber", value: String(l.rp) },
      { system: "http://jpfhir.jp/fhir/core/mhlw/IdSystem/MedicationAdministrationIndex", value: String(i + 1) },
      idOf(c.today.y, `med-${c.patient.id}-${i}`),
    ],
    status: "completed",
    intent: "order",
    medicationCodeableConcept: {
      coding: codes?.generic ? [{ system: "http://jpfhir.jp/fhir/core/mhlw/CodeSystem/MedicationGeneralOrderCode", code: codes.generic.code, display: codes.generic.name }] : [{ system: "http://jpfhir.jp/fhir/eCS/CodeSystem/MedicationCodeNocoded_CS", code: "NOCODED" }],
      text: codes?.name ?? l.drug,
    },
    subject: { reference: "urn:uuid:patient" },
    authoredOn: at,
    dosageInstruction: [
      {
        text: l.administration ? `${l.administration.usage} 総量${l.perDose ?? "？"}${l.unit}` : `1回${l.perDose ?? "？"}${l.unit} ${l.timings.length ? `1日${l.timings.length}回 ${l.timings.join("・")}` : `頓用 ${l.prn ?? ""}`} ${l.days ?? "？"}${l.timings.length ? "日分" : "回分"}`,
        timing: { code: { coding: [{ system: "http://jpfhir.jp/fhir/clins/CodeSystem/JP_CLINS_MedicationUsage_Uncoded_CS", code: "0X0XXXXXXXXX0000" }] } },
        doseAndRate: [{ doseQuantity: { value: l.perDose ?? 0, unit: l.unit } }],
      },
    ],
    ...(l.days ? { dispenseRequest: { ...(l.timings.length ? { expectedSupplyDuration: { value: l.days, unit: "日", system: "http://unitsofmeasure.org", code: "d" } } : {}) } } : {}),
  };
};

export interface DocsInput {
  draft: DischargeDraft;
  /** 入院日・退院日 (day offsets). */
  admittedOn: number;
  lines: RxLine[];
  allergies: AllergyChoice[];
}

export interface ClinsDocs {
  referral: Record<string, unknown> | null;
  summary: Record<string, unknown>;
  /** The same Bundle.identifier for both (the summary is attached to the letter). */
  documentId: string;
}

/** The 退院時サマリー (always) and the 診療情報提供書 when the letter has been issued. */
export function buildDocuments(c: ClinsContext, x: DocsInput): ClinsDocs {
  const at = jstDateTime(isoDate(c.today), c.time);
  const documentId = `${INSTITUTION_10}^${c.today.y}^DOC-${c.patient.id}`;
  const u = (k: string) => `urn:uuid:${uuidOf(`${documentId}|${k}`)}`;
  const day = (n: number) => isoDate(addDays(c.today, n));
  const d = x.draft;
  const s = (k: (typeof SECTIONS)[number]["key"]) => d.sections[k] ?? "";
  const ref = { patient: u("patient"), doctor: u("doctor"), org: u("org"), dest: u("dest"), enc: u("enc") };
  const conds = c.diagnoses.map((dx) => ({ url: u(`cond-${dx.id}`), res: conditionResource(c, dx, at) }));
  const allergies = x.allergies.filter((a) => a.send && a.category).map((a, i) => ({ url: u(`alg-${i}`), res: allergyResource(c, a, i, at) }));
  const meds = x.lines.map((l, i) => ({ url: u(`med-${i}`), res: medResource(c, l, i, at) }));
  const encounter = {
    resourceType: "Encounter",
    meta: meta(`${ECS}JP_Encounter_eCS`, at),
    identifier: [idOf(c.today.y, `enc-${c.patient.id}`)],
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "入院" },
    subject: { reference: ref.patient },
    period: { start: day(x.admittedOn), end: day(d.dischargeDay) },
    length: { value: d.dischargeDay - x.admittedOn + 1, unit: "日", system: "http://unitsofmeasure.org", code: "d" },
    reasonCode: [{ text: s("reason") || c.patient.admissionDiagnosis }],
    hospitalization: {
      ...(d.route ? { admitSource: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/admit-Source", code: d.route, display: labelOf(ROUTES, d.route) }] } } : {}),
      ...(d.outcome ? { dischargeDisposition: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/discharge-disposition", code: d.outcome, display: labelOf(OUTCOMES, d.outcome) }] } } : {}),
    },
  };
  const fix = (v: unknown) => JSON.parse(JSON.stringify(v).replaceAll("urn:uuid:patient", ref.patient));
  const common = [
    { fullUrl: ref.patient, resource: patientResource(c, at) },
    { fullUrl: ref.doctor, resource: practitioner(c.doctor, at) },
    { fullUrl: ref.org, resource: hospitalOrg(at) },
    { fullUrl: ref.enc, resource: encounter },
    ...conds.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
    ...allergies.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
    ...meds.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
  ];
  const compBase = (profile: string, local: string) => ({
    resourceType: "Composition",
    meta: meta(profile, at),
    extension: [{ url: "http://hl7.org/fhir/StructureDefinition/composition-clinicaldocument-versionNumber", valueString: "1" }],
    identifier: idOf(c.today.y, local),
    status: "final",
    subject: { reference: ref.patient },
    encounter: { reference: ref.enc },
    date: at,
    custodian: { reference: ref.org },
  });
  const empty = { emptyReason: { coding: [{ system: EMPTY_CS, code: "unavailable" }] } };
  const dxText = c.diagnoses.map((dx) => `${diagnosisLabel(dx)}${dx.main ? "（主）" : ""}`);

  const summaryComp = {
    ...compBase("http://jpfhir.jp/fhir/eDischargeSummary/StructureDefinition/JP_Composition_eDischargeSummary", `DS-${c.patient.id}`),
    type: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-typecodes", code: "18842-5", display: "退院時サマリー" }] },
    category: [{ coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-subtypecodes", code: "DISCHARGE", display: "退院時文書" }] }],
    author: [{ reference: ref.doctor }, { reference: ref.org }],
    title: "退院時サマリー",
    event: [{ period: { start: day(x.admittedOn), end: day(d.dischargeDay) } }],
    section: [
      {
        ...sec("300", "構造情報"),
        ...empty,
        section: [
          { ...sec("322", "入院時詳細"), entry: [{ reference: ref.enc }], text: narrative([`入院日 ${day(x.admittedOn)}`, `入院経路 ${labelOf(ROUTES, d.route)}`]) },
          { ...sec("312", "入院理由"), entry: [{ reference: ref.enc }], text: narrative([s("reason") || c.patient.admissionDiagnosis]) },
          { ...sec("324", "退院時詳細"), entry: [{ reference: ref.enc }], text: narrative([`退院日 ${day(d.dischargeDay)}`, `退院時転帰 ${labelOf(OUTCOMES, d.outcome)}`, `退院先 ${d.destination}`]) },
          { ...sec("342", "入院時診断"), text: narrative([c.patient.admissionDiagnosis]) },
          { ...sec("352", "主訴"), text: narrative([s("complaint")]) },
          { ...sec("360", "現病歴"), text: narrative([s("present")]) },
          { ...sec("333", "入院中経過"), text: narrative([s("course")]) },
          { ...sec("344", "退院時診断"), entry: conds.map((x) => ({ reference: x.url })), text: narrative(dxText) },
          ...(allergies.length ? [{ ...sec("510", "アレルギー・不耐性反応"), entry: allergies.map((x) => ({ reference: x.url })), text: narrative(x.allergies.filter((a) => a.send && a.category).map((a) => a.text)) }] : []),
          { ...sec("444", "退院時投薬指示"), entry: meds.map((x) => ({ reference: x.url })), text: narrative(meds.length ? meds.map((m) => `${m.res.medicationCodeableConcept.text} ${m.res.dosageInstruction[0].text}`) : ["退院時処方なし"]) },
          { ...sec("424", "退院時方針指示"), text: narrative([s("status") && `退院時の状態：${s("status")}`, s("plan")]) },
        ],
      },
    ],
  };
  const summary = {
    resourceType: "Bundle",
    meta: { lastUpdated: at, profile: [`${CLINS_SD}JP_Bundle_eDischargeSummary${V}`] },
    identifier: { system: "http://jpfhir.jp/fhir/clins/bundle-identifier", value: documentId },
    type: "document",
    timestamp: at,
    entry: [{ fullUrl: u("ds"), resource: summaryComp }, ...common],
  };

  let referral: Record<string, unknown> | null = null;
  if (d.letter.issuedAt) {
    const dest = {
      resourceType: "Organization",
      meta: meta(`${ECS}JP_Organization_eCS`, at),
      identifier: [{ system: INST_NO, value: "0000000000" }],
      type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov" }] }],
      name: d.letter.to,
    };
    const refComp = {
      ...compBase("http://jpfhir.jp/fhir/eReferral/StructureDefinition/JP_Composition_eReferral", `RD-${c.patient.id}`),
      type: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-typecodes", code: "57133-1", display: "診療情報提供書" }] },
      category: [{ coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-subtypecodes", code: "DISCHARGE", display: "退院時文書" }] }],
      author: [{ reference: ref.doctor }, { reference: ref.org }],
      title: "診療情報提供書",
      event: [{ code: [{ text: "診療情報提供書発行" }], period: { start: day(d.letter.issuedAt.day) } }],
      section: [
        { ...sec("920", "紹介元情報"), entry: [{ reference: ref.org }, { reference: ref.doctor }] },
        { ...sec("910", "紹介先情報"), entry: [{ reference: ref.dest }], text: narrative([`${d.letter.to} ${d.letter.dept}${d.letter.doctor ? ` ${d.letter.doctor}先生` : ""}`]) },
        {
          ...sec("300", "構造情報"),
          ...empty,
          section: [
            { ...sec("950", "紹介目的"), text: narrative([d.letter.purpose]), ...empty },
            { ...sec("340", "傷病名・主訴"), entry: conds.map((x) => ({ reference: x.url })), text: narrative([...dxText, s("complaint") && `主訴：${s("complaint")}`]) },
            { ...sec("360", "現病歴"), text: narrative([s("present"), s("course") && `入院後の経過：${s("course")}`]) },
            ...(allergies.length ? [{ ...sec("510", "アレルギー・不耐性反応"), entry: allergies.map((x) => ({ reference: x.url })) }] : []),
            ...(meds.length ? [{ ...sec("430", "投薬指示"), entry: meds.map((x) => ({ reference: x.url })) }] : []),
            { ...sec("420", "診療方針指示"), text: narrative([s("plan")]) },
          ],
        },
        { ...sec("210", "添付情報"), text: narrative(["退院時サマリー（同じ文書IDで添付）"]) },
      ],
    };
    referral = {
      resourceType: "Bundle",
      meta: { lastUpdated: at, profile: [`${CLINS_SD}JP_Bundle_eReferral${V}`] },
      identifier: { system: "http://jpfhir.jp/fhir/clins/bundle-identifier", value: documentId },
      type: "document",
      timestamp: at,
      entry: [{ fullUrl: u("rd"), resource: refComp }, ...common, { fullUrl: ref.dest, resource: dest }],
    };
  }
  return { referral, summary, documentId };
}

/** What the app cannot fill, for every patient. */
export const CLINS_UNFILLED: Unfilled[] = [
  { field: "Patient.address（必須）", why: "患者の住所の記録がない。入れないので、本物のサービスでは検証を通らない。" },
  { field: "JP_eCS_Department の coding（診療科コード）", why: "SS-MIX2 の診療科コード表を確かめていないので、text だけ入れる。" },
  { field: "Observation の JLAC10・JLAC11（指定検査43項目・感染症5項目）", why: "指定項目のコード表（CoreLabo_CS・InfectionLabo_CS）の中身を確かめていないので、「未標準化コード項目」と施設固有コード（項目_材料）で送る。" },
  { field: "感染症（梅毒・HBs・HCV・HIV の検査）", why: "この試作にその検査結果がない。プロファイルの感染症（MRSA など）は臨床情報の感染症（指定5項目の検査結果）にあたらないので送らない。" },
  { field: "AllergyIntolerance の JFAGY コード", why: "アレルギーは自由記載なので、区分ごとのダミーコード（D9M・D9F・D9N）と物質名・症状の文で送る。区分と送るかは医師が選ぶ。" },
  { field: "Condition の修飾語コード（修飾語管理番号）", why: "修飾語マスターの管理番号の列を確かめていないので、修飾語は病名の文（code.text）にだけ入れる。" },
  { field: "MedicationRequest の YJ コード・用法コード", why: "YJ コードを持たないので一般名処方マスタのコード（ないものは NOCODED）、用法はダミーの 0X0XXXXXXXXX0000。" },
  { field: "診療情報提供書の PDF（230 PDF セクション）", why: "文書全体の PDF は必須だが、この試作は PDF を作らない。" },
  { field: "紹介先 Organization.identifier（医療機関コード）", why: "サービスの医療機関等マスタと一致しないので 0000000000 を入れます。" },
  { field: "333 入院中経過の DocumentReference", why: "経過は文だけ（section.text）。DocumentReference は作らない。" },
  { field: "健康診断結果報告書（HS037）", why: "この試作に健診の記録がないので作らない。" },
  { field: "処方を臨床情報として単独で送ること", why: "技術解説書 v2.1.0 で処方は臨床情報から外れた（電子処方箋管理サービスと重なるため）。文書の中にだけ入れる。" },
];

// ---------------------------------------------------------------------------
// The other hospital's 6情報 (FICTIONAL), as the doctor sees them with the patient's consent
// ---------------------------------------------------------------------------

export interface OtherHospitalInfo {
  consented: boolean;
  items: { kind: "傷病名" | "薬剤アレルギー等" | "その他アレルギー等" | "感染症" | "検査"; text: string; from: string; date: string }[];
}

export interface ClinsReceipt {
  kind: "診療情報提供書" | "退院時サマリー" | "6情報";
  /** The service's 受付番号 (FICTIONAL). */
  receiptNo: string;
  receivedAt: string;
  /** What the service checked (FICTIONAL: the mock only counts). */
  result: string;
  mock: true;
}
