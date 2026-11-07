// 電子カルテ情報共有サービス（模擬）: the 診療情報提供書 (from a confirmed 紹介状) and 退院時サマリー as FHIR documents, and the
// 臨床情報 (傷病名・アレルギー・検査; 感染症 when there are its lab results) as the collections the service
// takes, following the public JP-CLINS 実装ガイド v1.13.0 (HS038・HS039) — profile names, code systems and
// required elements, as far as the app's data goes. Nothing is sent: the send and the receipt are SIMULATED
// (adapter.ts). The other hospital's 6情報 shown to the doctor are FICTIONAL.

import { addDays, isoDate, type CalendarDate } from "../dates";
import { HOSPITAL } from "../billing/facility";
import type { Insurance } from "../billing/insurance";
import { diagnosisLabel, isSuspected, type Diagnosis } from "../diagnoses";
import { labelOf, OUTCOMES, ROUTES, SECTIONS, type DischargeDraft } from "../discharge";
import { legacyId, letterKind, versionNo, type Letter, type LetterField, type LetterType } from "../letters";
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
// 2文書: 診療情報提供書 and 退院時サマリー
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
  /** 入院日 (day offset). */
  admittedOn: number;
  lines: RxLine[];
  allergies: AllergyChoice[];
}

/** Bundle.identifier: 医療機関コード^年^文書の番号 (the 退院時サマリー attached to a letter carries the letter's). */
const documentIdOf = (year: number, local: string) => `${INSTITUTION_10}^${year}^${local}`;

/** The stay the documents are about. */
interface Stay {
  admittedOn: number;
  /** Unset while the patient is still in (the Encounter is then in progress). */
  dischargeDay?: number;
  reason: string;
  route?: string;
  outcome?: string;
}

const stayOf = (c: ClinsContext, d: DischargeDraft, admittedOn: number): Stay => ({ admittedOn, dischargeDay: d.dischargeDay, reason: d.sections.reason || c.patient.admissionDiagnosis, route: d.route, outcome: d.outcome });

/** What both documents carry: the Patient, the author, the hospital, the stay, and the 病名・アレルギー・処方. */
function documentParts(c: ClinsContext, documentId: string, stay: Stay, lines: RxLine[], allergies: AllergyChoice[], author: string) {
  const at = jstDateTime(isoDate(c.today), c.time);
  const u = (k: string) => `urn:uuid:${uuidOf(`${documentId}|${k}`)}`;
  const day = (n: number) => isoDate(addDays(c.today, n));
  const ref = { patient: u("patient"), doctor: u("doctor"), org: u("org"), dest: u("dest"), enc: u("enc") };
  const conds = c.diagnoses.map((dx) => ({ url: u(`cond-${dx.id}`), res: conditionResource(c, dx, at) }));
  const sent = allergies.filter((a) => a.send && a.category);
  const algs = sent.map((a, i) => ({ url: u(`alg-${i}`), res: allergyResource(c, a, i, at) }));
  const meds = lines.map((l, i) => ({ url: u(`med-${i}`), res: medResource(c, l, i, at) }));
  const end = stay.dischargeDay;
  const encounter = {
    resourceType: "Encounter",
    meta: meta(`${ECS}JP_Encounter_eCS`, at),
    identifier: [idOf(c.today.y, `enc-${c.patient.id}`)],
    status: end === undefined ? "in-progress" : "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "入院" },
    subject: { reference: ref.patient },
    period: { start: day(stay.admittedOn), ...(end === undefined ? {} : { end: day(end) }) },
    ...(end === undefined ? {} : { length: { value: end - stay.admittedOn + 1, unit: "日", system: "http://unitsofmeasure.org", code: "d" } }),
    reasonCode: [{ text: stay.reason }],
    hospitalization: {
      ...(stay.route ? { admitSource: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/admit-Source", code: stay.route, display: labelOf(ROUTES, stay.route) }] } } : {}),
      ...(stay.outcome ? { dischargeDisposition: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/discharge-disposition", code: stay.outcome, display: labelOf(OUTCOMES, stay.outcome) }] } } : {}),
    },
  };
  const fix = (v: unknown) => JSON.parse(JSON.stringify(v).replaceAll("urn:uuid:patient", ref.patient));
  const common = [
    { fullUrl: ref.patient, resource: patientResource(c, at) },
    { fullUrl: ref.doctor, resource: practitioner(author, at) },
    { fullUrl: ref.org, resource: hospitalOrg(at) },
    { fullUrl: ref.enc, resource: encounter },
    ...conds.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
    ...algs.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
    ...meds.map((x) => ({ fullUrl: x.url, resource: fix(x.res) })),
  ];
  const composition = (profile: string, local: string, o: { year?: number; date?: string; version?: number } = {}) => ({
    resourceType: "Composition",
    meta: meta(profile, at),
    extension: [{ url: "http://hl7.org/fhir/StructureDefinition/composition-clinicaldocument-versionNumber", valueString: String(o.version ?? 1) }],
    identifier: idOf(o.year ?? c.today.y, local),
    status: "final",
    subject: { reference: ref.patient },
    encounter: { reference: ref.enc },
    date: o.date ?? at,
    custodian: { reference: ref.org },
  });
  const bundle = (profile: string, first: string, comp: Record<string, unknown>, extra: { fullUrl: string; resource: unknown }[] = []): Record<string, unknown> => ({
    resourceType: "Bundle",
    meta: { lastUpdated: at, profile: [`${CLINS_SD}${profile}${V}`] },
    identifier: { system: "http://jpfhir.jp/fhir/clins/bundle-identifier", value: documentId },
    type: "document",
    timestamp: at,
    entry: [{ fullUrl: u(first), resource: comp }, ...common, ...extra],
  });
  return { day, ref, conds, algs, allergyText: sent.map((a) => a.text), meds, composition, bundle };
}
type Parts = ReturnType<typeof documentParts>;

const empty = { emptyReason: { coding: [{ system: EMPTY_CS, code: "unavailable" }] } };
const dxLines = (c: ClinsContext) => c.diagnoses.map((dx) => `${diagnosisLabel(dx)}${dx.main ? "（主）" : ""}`);

function summaryFrom(c: ClinsContext, p: Parts, d: DischargeDraft, admittedOn: number) {
  const s = (k: (typeof SECTIONS)[number]["key"]) => d.sections[k] ?? "";
  const { day, ref } = p;
  const comp = {
    ...p.composition("http://jpfhir.jp/fhir/eDischargeSummary/StructureDefinition/JP_Composition_eDischargeSummary", `DS-${c.patient.id}`),
    type: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-typecodes", code: "18842-5", display: "退院時サマリー" }] },
    category: [{ coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-subtypecodes", code: "DISCHARGE", display: "退院時文書" }] }],
    author: [{ reference: ref.doctor }, { reference: ref.org }],
    title: "退院時サマリー",
    event: [{ period: { start: day(admittedOn), end: day(d.dischargeDay) } }],
    section: [
      {
        ...sec("300", "構造情報"),
        ...empty,
        section: [
          { ...sec("322", "入院時詳細"), entry: [{ reference: ref.enc }], text: narrative([`入院日 ${day(admittedOn)}`, `入院経路 ${labelOf(ROUTES, d.route)}`]) },
          { ...sec("312", "入院理由"), entry: [{ reference: ref.enc }], text: narrative([s("reason") || c.patient.admissionDiagnosis]) },
          { ...sec("324", "退院時詳細"), entry: [{ reference: ref.enc }], text: narrative([`退院日 ${day(d.dischargeDay)}`, `退院時転帰 ${labelOf(OUTCOMES, d.outcome)}`, `退院先 ${d.destination}`]) },
          { ...sec("342", "入院時診断"), text: narrative([c.patient.admissionDiagnosis]) },
          { ...sec("352", "主訴"), text: narrative([s("complaint")]) },
          { ...sec("360", "現病歴"), text: narrative([s("present")]) },
          { ...sec("333", "入院中経過"), text: narrative([s("course")]) },
          { ...sec("344", "退院時診断"), entry: p.conds.map((x) => ({ reference: x.url })), text: narrative(dxLines(c)) },
          ...(p.algs.length ? [{ ...sec("510", "アレルギー・不耐性反応"), entry: p.algs.map((x) => ({ reference: x.url })), text: narrative(p.allergyText) }] : []),
          { ...sec("444", "退院時投薬指示"), entry: p.meds.map((x) => ({ reference: x.url })), text: narrative(p.meds.length ? p.meds.map((m) => `${m.res.medicationCodeableConcept.text} ${m.res.dosageInstruction[0].text}`) : ["退院時処方なし"]) },
          { ...sec("424", "退院時方針指示"), text: narrative([s("status") && `退院時の状態：${s("status")}`, s("plan")]) },
        ],
      },
    ],
  };
  return p.bundle("JP_Bundle_eDischargeSummary", "ds", comp);
}

/** The 退院時サマリー on its own, under the patient's document id (a letter that attaches it gives it the letter's). */
export function summaryDocument(c: ClinsContext, x: DocsInput): Record<string, unknown> {
  const p = documentParts(c, documentIdOf(c.today.y, `DOC-${c.patient.id}`), stayOf(c, x.draft, x.admittedOn), x.lines, x.allergies, c.doctor);
  return summaryFrom(c, p, x.draft, x.admittedOn);
}

// ---------------------------------------------------------------------------
// 診療情報提供書 from one confirmed 紹介状 (letters.ts)
// ---------------------------------------------------------------------------

/** Kinds the service does not carry, and why. The others (紹介・返書・照会・歯科) are written to a 医療機関. */
export const CLINS_NOT_SENT: Partial<Record<LetterType, string>> = {
  介護施設: "老健・介護医療院あては送らない（送り先は医療機関）",
  保健福祉: "市町村・居宅あては送らない（送り先は医療機関）",
  セカンドオピニオン: "患者に渡す文書なので送らない",
};

/** The 退院時サマリー goes with the letter: the summary is confirmed, and the letter is a 紹介 with 注8's 添付. */
export const attachesSummary = (l: Pick<Letter, "type" | "flags">, d?: DischargeDraft) => d?.status === "確定" && l.type === "紹介" && !!l.flags.attach;

/** The letter's document id: the old 退院サマリ's letter keeps the patient's, a letter of the tool has its own. */
export function letterDocumentId(c: Pick<ClinsContext, "patient" | "today">, l: Letter): string {
  const year = addDays(c.today, (l.confirmedAt ?? l.createdAt).day).y;
  return documentIdOf(year, l.id === legacyId(c.patient.id) ? `DOC-${c.patient.id}` : `DOC-${l.id}`);
}

export interface LetterDocInput {
  letter: Letter;
  /** 入院日 (day offset). */
  admittedOn: number;
  lines: RxLine[];
  allergies: AllergyChoice[];
  /** The 退院サマリ (its 退院時サマリー is attached under attachesSummary). */
  discharge?: DischargeDraft;
}

export interface LetterDocs {
  documentId: string;
  /** Why the letter is not sent at all (a draft, or a kind the service does not carry). */
  notSent: string | null;
  /** Required elements the letter lacks: no document is made until they are filled. */
  missing: Unfilled[];
  referral: Record<string, unknown> | null;
  /** The 退院時サマリー attached with the same document id (null when not attached). */
  summary: Record<string, unknown> | null;
}

/** The letter's fields that go into 360 現病歴, each under its own heading (既往歴・家族歴 and 備考 included: see CLINS_UNFILLED). */
const PRESENT: LetterField[] = ["result", "history", "findings", "treatment", "remarks"];

/** HS038 診療情報提供書 from a confirmed 紹介状 of a kind written to a 医療機関 (the old 退院サマリ's letter too). */
export function referralBundleFromLetter(c: ClinsContext, x: LetterDocInput): LetterDocs {
  const l = x.letter;
  const documentId = letterDocumentId(c, l);
  const none = (notSent: string | null, missing: Unfilled[] = []): LetterDocs => ({ documentId, notSent, missing, referral: null, summary: null });
  if (l.status !== "確定" || !l.confirmedAt) return none("確定していない");
  const not = CLINS_NOT_SENT[l.type];
  if (not) return none(not);

  const kind = letterKind(l.type);
  const text = (k: LetterField) => (l.body[k] ?? "").trim();
  const dx = text("diagnosis") ? text("diagnosis").split("\n") : dxLines(c);
  const author = (l.revised?.by ?? l.confirmedBy ?? "").trim();
  const missing: Unfilled[] = [
    ...(l.to.trim() ? [] : [{ field: "紹介先情報（910）の医療機関名（必須）", why: `${kind.to}が空` }]),
    ...(l.purpose.trim() ? [] : [{ field: "紹介目的（950）（必須）", why: `${kind.purpose}が空` }]),
    ...(dx.length ? [] : [{ field: "傷病名・主訴（340）（必須）", why: "傷病名が空で、カルテにも病名がない" }]),
    ...(author ? [] : [{ field: "作成者（Composition.author の医師）（必須）", why: "確定した医師の記録がない" }]),
  ];
  if (missing.length) return none(null, missing);

  const attach = attachesSummary(l, x.discharge);
  const d = x.discharge?.status === "確定" ? x.discharge : undefined;
  const stay: Stay = d ? stayOf(c, d, x.admittedOn) : { admittedOn: x.admittedOn, dischargeDay: c.patient.dischargedAt?.day, reason: c.patient.admissionDiagnosis };
  const p = documentParts(c, documentId, stay, x.lines, x.allergies, author);
  const issued = addDays(c.today, l.confirmedAt.day);
  const last = l.revised?.at ?? l.confirmedAt;
  const label = (k: LetterField) => kind.fields.find(([f]) => f === k)?.[1] ?? "";
  const present = kind.fields.filter(([k]) => PRESENT.includes(k) && text(k)).map(([k]) => `${label(k)}：${text(k)}`);
  const discharge = l.from === "退院サマリ" || !!l.legacy || attach;
  const dest = {
    resourceType: "Organization",
    meta: meta(`${ECS}JP_Organization_eCS`, jstDateTime(isoDate(c.today), c.time)),
    identifier: [{ system: INST_NO, value: "0000000000" }],
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov" }] }],
    name: l.to.trim(),
  };
  const comp = {
    ...p.composition("http://jpfhir.jp/fhir/eReferral/StructureDefinition/JP_Composition_eReferral", `RD-${l.id === legacyId(c.patient.id) ? c.patient.id : l.id}`, { year: issued.y, date: jstDateTime(isoDate(addDays(c.today, last.day)), last.time), version: versionNo(l) }),
    type: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-typecodes", code: "57133-1", display: "診療情報提供書" }] },
    ...(discharge ? { category: [{ coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-subtypecodes", code: "DISCHARGE", display: "退院時文書" }] }] } : {}),
    author: [{ reference: p.ref.doctor }, { reference: p.ref.org }],
    title: kind.title,
    event: [{ code: [{ text: "診療情報提供書発行" }], period: { start: isoDate(issued) } }],
    section: [
      { ...sec("920", "紹介元情報"), entry: [{ reference: p.ref.org }, { reference: p.ref.doctor }] },
      { ...sec("910", "紹介先情報"), entry: [{ reference: p.ref.dest }], text: narrative([`${l.to.trim()} ${l.dept.trim()}${l.doctor.trim() ? ` ${l.doctor.trim()}先生` : ""}`]) },
      {
        ...sec("300", "構造情報"),
        ...empty,
        section: [
          { ...sec("950", "紹介目的"), text: narrative([l.purpose, l.type === "照会" && text("question") ? `${label("question")}：${text("question")}` : ""]), ...empty },
          { ...sec("340", "傷病名・主訴"), entry: p.conds.map((x) => ({ reference: x.url })), text: narrative(dx) },
          { ...sec("360", "現病歴"), text: narrative(present) },
          ...(p.algs.length ? [{ ...sec("510", "アレルギー・不耐性反応"), entry: p.algs.map((x) => ({ reference: x.url })) }] : []),
          ...(p.meds.length || text("medication") ? [{ ...sec("430", "投薬指示"), ...(p.meds.length ? { entry: p.meds.map((x) => ({ reference: x.url })) } : {}), text: narrative([text("medication")]) }] : []),
          { ...sec("420", "診療方針指示"), text: narrative([text("plan")]) },
        ],
      },
      ...(attach ? [{ ...sec("210", "添付情報"), text: narrative(["退院時サマリー（同じ文書IDで添付）"]) }] : []),
    ],
  };
  return { documentId, notSent: null, missing: [], referral: p.bundle("JP_Bundle_eReferral", "rd", comp, [{ fullUrl: p.ref.dest, resource: dest }]), summary: attach && d ? summaryFrom(c, p, d, x.admittedOn) : null };
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
  { field: "紹介状の既往歴・家族歴と備考のセクション", why: "セクションのコードを配布パッケージで確かめていないので、360 現病歴の文に欄の名前を付けて入れる。" },
  { field: "診療情報提供書の Composition.category（退院時以外の文書区分）", why: "退院時以外の区分のコードを確かめていないので、退院サマリから作った紹介状にだけ「退院時文書（DISCHARGE）」を入れる。" },
  { field: "紹介状から作る文書の 510 アレルギー・不耐性反応", why: "アレルギーの区分は医師が選んで臨床情報で送る。紹介状の文書には備考の文で入る。" },
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
