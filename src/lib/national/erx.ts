import { patternText } from "../day-pattern";
// 電子処方箋（模擬）: the prescription written as HL7 FHIR following the public 厚生労働省標準規格 HS036
// 「処方情報 HL7 FHIR 記述仕様」 (ERX_SPECS) — its profile names, code systems and required elements, as far
// as the app's data goes. HS036 says it is not the 電子処方箋 file itself: the real 電子処方箋管理サービス
// takes an XML with the prescription as CSV (記録条件仕様, published only to vendors), so this Bundle shows
// what the prescription holds, and the 登録 is SIMULATED (adapter.ts). Everything is FICTIONAL.

import { isoDate, type CalendarDate } from "../dates";
import { HOSPITAL } from "../billing/facility";
import type { Insurance } from "../billing/insurance";
import { findOralDrug } from "../master";
import { timingName } from "../rx";
import { PRESCRIPTION_DRUG_CODES } from "./drug-codes";
import { jstDateTime, uuidOf } from "./fictional";
import type { RxLine } from "./rx-lines";
import type { SpecRef, Unfilled } from "./spec";

export const ERX_SPECS: SpecRef[] = [
  { name: "厚生労働省標準規格 HS036「処方情報 HL7 FHIR 記述仕様」第1版（日本医療情報学会 JAMI 標準 JAMISDP02）", version: "Ver.1.0.2（2022-02-24）・FHIR R4 4.0.1", url: "https://std.jpfhir.jp/stddoc/ePrescriptionDataFHIR_v1x.pdf", note: "プロファイル名・コード体系・必須の要素。仕様書自身が「電子処方箋の FHIR 仕様ではない」と書いている" },
  { name: "同 実装ガイド JAMI ePrescriptionData ImplementationGuide", version: "1.0.0（ci-build, 2022-06-29）", url: "https://jpfhir.jp/fhir/ePrescriptionData/igv1/" },
  { name: "厚生労働省 通知（医政発0324第13号・政統発0324第3号、令和4年3月24日）HS036 を標準規格に", url: "http://helics.umin.ac.jp/files/MhlwTsuuchi/MhlwTuuchi_20220324.pdf" },
  { name: "厚生労働省「電子処方箋管理サービス 医療機関・薬局システムベンダ向け技術解説書」", version: "2.05版（令和8年9月）", url: "https://www.mhlw.go.jp/content/001046588.pdf", note: "本物の登録は XML（電子処方箋 CDA 記述仕様を参考）の中に CSV（記録条件仕様）を入れて送る。引換番号は運用開始時6桁・システムは16桁まで扱う。院内処方の情報も登録できる" },
  { name: "厚生労働省「電子処方箋の運用ガイドライン」（令和6年12月18日改正）", url: "https://www.mhlw.go.jp/content/11120000/001185244.pdf", note: "電子署名とタイムスタンプ。院内処方の情報には署名が要らない" },
  { name: "厚生労働省「電子処方箋 概要案内（病院・診療所）」", version: "令和8年10月 1.7版", url: "https://www.mhlw.go.jp/content/11120000/001015134.pdf", note: "署名は HPKI カード（ローカル署名）か HPKI セカンド電子証明書（リモート署名）" },
];

const SD = "http://jpfhir.jp/fhir/ePrescription/StructureDefinition/";
const EXT = "http://jpfhir.jp/fhir/core/Extension/StructureDefinition/";
const NAME_REP = "http://hl7.org/fhir/StructureDefinition/iso21090-EN-representation";

export const OID = {
  patientId: "urn:oid:1.2.392.100495.20.3.51.1",
  prescriberId: "urn:oid:1.2.392.100495.20.3.41.1",
  insurer: "urn:oid:1.2.392.100495.20.3.61",
  prefecture: "urn:oid:1.2.392.100495.20.3.21",
  scoreTable: "urn:oid:1.2.392.100495.20.3.22",
  institutionNo: "urn:oid:1.2.392.100495.20.3.23",
  insuranceType: "urn:oid:1.2.392.100495.20.2.61",
  relationship: "urn:oid:1.2.392.100495.20.2.62",
  rp: "urn:oid:1.2.392.100495.20.3.81",
  rpOrder: "urn:oid:1.2.392.100495.20.3.82",
  receiptDrug: "urn:oid:1.2.392.100495.20.1.71",
  yakkaDrug: "urn:oid:1.2.392.100495.20.1.72",
  genericDrug: "urn:oid:1.2.392.100495.20.1.81",
  basicUsage: "urn:oid:1.2.392.200250.2.2.20.30",
  strength: "urn:oid:1.2.392.100495.20.2.22",
  drugUnit: "urn:oid:1.2.392.100495.20.2.101",
  substitution: "urn:oid:1.2.392.100495.20.2.41",
} as const;

/** 医療機関コード 10桁: 都道府県番号2・点数表番号1（医科）・医療機関コード7. */
export const INSTITUTION_10 = `${HOSPITAL.prefecture}1${HOSPITAL.code}`;
/** The fictional hospital's address (HOSPITAL has none; the issuer needs one). */
export const HOSPITAL_ADDRESS = "神奈川県架空市中央1-1";

/** 医薬品単位略号 for the units of the master. */
const UNIT_CODE: Record<string, string> = { 錠: "TAB", カプセル: "CAP", 包: "PCK" };

export interface ErxPatient {
  id: string;
  name: string;
  kana: string;
  sex: "男" | "女";
  birthDate: string;
}

export interface ErxInput {
  patient: ErxPatient;
  department: string;
  doctor: string;
  insurance: Insurance;
  /** The insurance is the age-based assumption (保険が未登録). */
  insuranceAssumed: boolean;
  lines: RxLine[];
  today: CalendarDate;
  time: string;
  /** 年内の連番 (処方箋番号の後ろ8桁). */
  serial: number;
  /** 院外処方箋, or 院内処方 (退院時処方を薬剤部が調剤し、患者が持ち帰る). */
  kind: "院外" | "院内";
}

export interface ErxSignature {
  /** Always true here: a hash, not a signature. */
  mock: true;
  when: string;
  who: string;
  /** SHA-256 of the Bundle without the signature, base64. */
  data: string;
}

export interface ErxReceipt {
  /** 処方箋ID: the service gives it (FICTIONAL). */
  prescriptionId: string;
  /** 引換番号 (院外処方箋 only; 6 digits at the start of the service). */
  exchangeNo?: string;
  registeredAt: string;
  kind: "院外" | "院内";
  mock: true;
}

/** One line for the printed / screen text of a drug. */
const lineText = (l: RxLine) => {
  const m = findOralDrug(l.drug);
  if (l.administration) return `${l.administration.kind}　${l.administration.usage}　総量${l.perDose ?? "？"}${l.unit}`;
  const how = l.timings.length ? `1日${l.timings.length}回 ${timingName(l.timings)}` : `頓用 ${l.prn ?? ""}${l.maxPerDay ? `（1日${l.maxPerDay}回まで）` : ""}`;
  return `内服・経口・${l.dayPattern ? patternText(l.dayPattern) + "　" : ""}${how}　1回${l.perDose ?? "？"}${m?.unit ?? l.unit}　${l.days ? `${l.days}${l.timings.length ? l.dayPattern ? "投与日分" : "日分" : "回分"}` : "日数？"}`;
};

const nameParts = (name: string) => {
  const [family, ...rest] = name.trim().split(/[\s　]+/);
  return { family, given: rest.length ? [rest.join("　")] : undefined, text: [family, ...rest].join("　") };
};
const humanName = (name: string, rep: "IDE" | "SYL") => {
  const n = nameParts(name);
  return { extension: [{ url: NAME_REP, valueCode: rep }], use: "official", text: n.text, family: n.family, ...(n.given ? { given: n.given } : {}) };
};

/** The doctor's family name ("山本（専攻医）" → "山本"). */
const doctorFamily = (doctor: string) => doctor.replace(/[（(].*$/, "").replace(/^(研修医|指導医|医師)\s*/, "").trim();

const coverageType = (ins: Insurance) => (ins.kind === "後期高齢者" ? { code: "7", display: "後期高齢者" } : ins.kind === "国保" ? { code: "2", display: "国保" } : { code: "1", display: "医保" });

/** What cannot be filled from this app's data, whatever the prescription. */
export const ERX_UNFILLED: Unfilled[] = [
  { field: "MedicationRequest.medicationCodeableConcept（HOT9・YJ コード）", why: "この試作のマスターは HOT・YJ コードを持たないので、レセプト電算コード・薬価基準収載医薬品コード・一般名処方マスタのコード（医薬品マスターから）を入れる。" },
  { field: "dosageInstruction.timing.code（JAMI 標準用法コード16桁）", why: "用法にコードを付けていない（用法マスタの値を確かめていない）。text と日数だけ入れる。" },
  { field: "Practitioner.qualification（医籍登録番号）", why: "医籍登録番号は入れません。" },
  { field: "Practitioner.name のカナ・名", why: "この試作の医師は姓（と立場）だけ。" },
  { field: "Patient.address", why: "患者の住所の記録がない（麻薬処方箋のときだけ必須）。" },
  { field: "Composition.event.period.end（使用期間）", why: "指定がないので省く（法定の期限）。" },
  { field: "MedicationRequest.substitution（後発品変更不可）", why: "この試作には変更不可の指示がないので、すべて「0 変更可」（変更可でも入れる決まり）。" },
  { field: "Communication（処方箋備考・残薬確認指示）", why: "この試作の処方に備考と残薬確認の指示の欄がない。" },
  { field: "Coverage・公費（publicPayment）", why: "公費の併用はこの試作で扱わない。" },
  { field: "本物の送信形式（XML＋CSV・記録条件仕様）", why: "記録条件仕様はベンダー向けの医療機関等ONSだけで公開されており、見ていない。" },
];

export interface ErxBuild {
  bundle: Record<string, unknown>;
  /** Fields left out for this prescription (in addition to ERX_UNFILLED). */
  unfilled: Unfilled[];
  /** What stops the registration (a line without 1回量 or 日数). */
  problems: string[];
  /** The fullUrl of the Practitioner (the signer). */
  practitionerRef: string;
  prescriptionNo: string;
}

/** The prescription as an HS036 Bundle (type document, Composition first, references by urn:uuid). */
export function buildErxBundle(x: ErxInput): ErxBuild {
  const issued = isoDate(x.today);
  const at = jstDateTime(issued, x.time);
  const prescriptionNo = `${INSTITUTION_10}-${x.today.y}-${String(x.serial).padStart(8, "0")}`;
  const u = (k: string) => `urn:uuid:${uuidOf(`${prescriptionNo}|${k}`)}`;
  const ref = { composition: u("composition"), patient: u("patient"), encounter: u("encounter"), coverage: u("coverage"), insurer: u("insurer"), org: u("org"), dept: u("dept"), role: u("role"), doctor: u("doctor") };
  const profile = (name: string) => ({ profile: [`${SD}${name}`] });
  const unfilled: Unfilled[] = [];
  const problems: string[] = [];
  if (x.insuranceAssumed) unfilled.push({ field: "Coverage・保険（被保険者証の記号・番号）", why: "保険が登録されていないので、年齢からの仮の保険を入れた（医事課の「保険の登録」かオンライン資格確認の結果が要る）。" });
  if (x.kind === "院内") unfilled.push({ field: "Encounter.class", why: "HS036 は外来（AMB）の処方だけを定め、入院の院内処方は別に作るとしている。ここでは入院（IMP）を入れて同じ形で示す（この試作の取り決め）。" });

  const patient = {
    resourceType: "Patient",
    meta: profile("JP_Patient_ePrescriptionData"),
    identifier: [{ system: `${OID.patientId}${INSTITUTION_10}`, value: x.patient.id }],
    name: [humanName(x.patient.name, "IDE"), humanName(x.patient.kana, "SYL")],
    gender: x.patient.sex === "男" ? "male" : "female",
    birthDate: x.patient.birthDate,
  };
  const encounter = {
    resourceType: "Encounter",
    meta: profile("JP_Encounter_ePrescriptionData"),
    status: "finished",
    class: x.kind === "院内" ? { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP", display: "入院" } : { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "外来" },
  };
  const ins = x.insurance;
  const coverage = {
    resourceType: "Coverage",
    meta: profile("JP_Coverage_ePrescriptionData_insurance"),
    extension: [
      ...(ins.symbol ? [{ url: `${EXT}JP_Coverage_InsuredPersonSymbol`, valueString: ins.symbol }] : []),
      { url: `${EXT}JP_Coverage_InsuredPersonNumber`, valueString: ins.number },
      ...(ins.branch ? [{ url: `${EXT}JP_Coverage_InsuredPersonSubNumber`, valueString: ins.branch }] : []),
    ],
    status: "active",
    type: { coding: [{ system: OID.insuranceType, ...coverageType(ins) }] },
    beneficiary: { reference: ref.patient },
    ...(ins.branch ? { dependent: ins.branch } : {}),
    relationship: { coding: [{ system: OID.relationship, ...(ins.relation === "家族" ? { code: "2", display: "被扶養者" } : { code: "1", display: "被保険者" }) }] },
    payor: [{ reference: ref.insurer }],
    costToBeneficiary: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/coverage-copay-type", code: "copaypct" }] }, valueQuantity: { value: ins.rate, unit: "%", system: "http://unitsofmeasure.org", code: "%" } }],
  };
  const insurer = {
    resourceType: "Organization",
    meta: profile("JP_Organization_ePrescriptionData_coveragePayer"),
    identifier: [{ system: OID.insurer, value: ins.insurerNumber }],
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "ins" }] }],
    name: `${ins.kind}`,
  };
  const org = {
    resourceType: "Organization",
    meta: profile("JP_Organization_ePrescriptionData_issuer"),
    extension: [
      { url: `${EXT}JP_Organization_PrefectureNo`, valueIdentifier: { system: OID.prefecture, value: HOSPITAL.prefecture } },
      { url: `${EXT}JP_Organization_InsuranceOrganizationCategory`, valueIdentifier: { system: OID.scoreTable, value: "1" } },
      { url: `${EXT}JP_Organization_InsuranceOrganizationNo`, valueIdentifier: { system: OID.institutionNo, value: HOSPITAL.code } },
    ],
    identifier: [{ system: "http://jpfhir.jp/fhir/Common/IdSystem/insurance-medical-institution-no", value: INSTITUTION_10 }],
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov" }] }],
    name: HOSPITAL.name,
    telecom: [{ system: "phone", value: HOSPITAL.tel }],
    address: [{ text: HOSPITAL_ADDRESS, country: "JP" }],
  };
  const dept = {
    resourceType: "Organization",
    meta: profile("JP_Organization_ePrescriptionData_departmentOfIssuer"),
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "dept" }] }],
    name: x.department,
    partOf: { reference: ref.org },
  };
  const role = {
    resourceType: "PractitionerRole",
    meta: profile("JP_PractitionerRole_ePrescriptionData_author"),
    practitioner: { reference: ref.doctor },
    organization: { reference: ref.dept },
    code: [{ coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/practitioner-role-category", code: "doctor" }] }],
  };
  const doctor = {
    resourceType: "Practitioner",
    meta: profile("JP_Practitioner_ePrescriptionData_author"),
    identifier: [{ system: `${OID.prescriberId}${INSTITUTION_10}`, value: `D-${uuidOf(x.doctor).slice(0, 6)}` }],
    name: [{ extension: [{ url: NAME_REP, valueCode: "IDE" }], use: "official", text: doctorFamily(x.doctor), family: doctorFamily(x.doctor) }],
  };

  const rpOrder = new Map<number, number>();
  const meds = x.lines.map((l, i) => {
    const n = (rpOrder.get(l.rp) ?? 0) + 1;
    rpOrder.set(l.rp, n);
    const c = PRESCRIPTION_DRUG_CODES[l.drug];
    const m = findOralDrug(l.drug);
    const unit = { unit: l.unit, system: OID.drugUnit, code: UNIT_CODE[l.unit] ?? l.unit };
    const prn = !l.administration && l.timings.length === 0;
    const per = l.perDose ?? 0;
    if (l.perDose === null) problems.push(`Rp${l.rp} ${m?.name ?? l.drug}：1回量がありません。`);
    if (!l.administration && !l.days) problems.push(`Rp${l.rp} ${m?.name ?? l.drug}：${prn ? "回数" : "日数"}がありません。`);
    if (!c) problems.push(`Rp${l.rp} ${l.drug}：医薬品マスターのコードがありません。`);
    const daily = l.administration || prn ? null : per * l.timings.length;
    const total = l.administration ? per : l.days ? (prn ? per * l.days : per * l.timings.length * l.days) : 0;
    return {
      fullUrl: u(`med-${i}`),
      resource: {
        resourceType: "MedicationRequest",
        meta: profile("JP_MedicationRequest_ePrescriptionData"),
        identifier: [
          { system: OID.rp, value: String(l.rp) },
          { system: OID.rpOrder, value: String(n) },
        ],
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
          coding: c
            ? [
                { system: OID.receiptDrug, code: c.receipt, display: c.name },
                { system: OID.yakkaDrug, code: c.yakka, display: c.name },
                ...(c.generic ? [{ system: OID.genericDrug, code: c.generic.code, display: c.generic.name }] : []),
              ]
            : [],
          text: c?.name ?? m?.name ?? l.drug,
        },
        subject: { reference: ref.patient },
        authoredOn: at,
        dosageInstruction: [
          {
            text: lineText(l),
            timing: l.administration || prn || l.dayPattern ? undefined : { repeat: { boundsDuration: { value: l.days ?? 0, unit: "日", system: "http://unitsofmeasure.org", code: "d" } } },
            ...(prn ? { asNeededBoolean: true } : {}),
            route: l.administration ? { text: l.administration.kind } : { coding: [{ system: "http://jpfhir.jp/fhir/ePrescription/CodeSystem/route-codes", code: "PO", display: "口" }] },
            method: l.administration ? { text: l.administration.usage } : { coding: [{ system: OID.basicUsage, code: "1", display: "内服" }] },
            doseAndRate: [
              {
                type: { coding: [{ system: OID.strength, code: "1", display: "製剤量" }] },
                doseQuantity: { value: per, ...unit },
                ...(daily !== null && !l.dayPattern ? { rateRatio: { numerator: { value: daily, ...unit }, denominator: { value: 1, unit: "日", system: "http://unitsofmeasure.org", code: "d" } } } : {}),
              },
            ],
          },
        ],
        dispenseRequest: {
          ...(prn ? { extension: [{ url: `${EXT}JP_MedicationRequest_DispenseRequest_ExpectedRepeatCount`, valueInteger: l.days ?? 0 }] } : {}),
          quantity: { value: Math.round(total * 100) / 100, ...unit },
          ...(l.administration || prn || l.dayPattern ? {} : { expectedSupplyDuration: { value: l.days ?? 0, unit: "日", system: "http://unitsofmeasure.org", code: "d" } }),
        },
        substitution: { allowedCodeableConcept: { coding: [{ system: OID.substitution, code: "0", display: "変更可" }] } },
      },
    };
  });
  // JSON drops the undefined timing of a 頓服 (as FHIR wants: no empty elements).
  const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

  const composition = {
    resourceType: "Composition",
    meta: profile("JP_Composition_ePrescriptionData"),
    extension: [{ url: "http://hl7.org/fhir/StructureDefinition/composition-clinicaldocument-versionNumber", valueString: "1.0" }],
    identifier: { system: "http://jpfhir.jp/fhir/Common/IdSystem/resourceInstance-identifier", value: prescriptionNo },
    status: "final",
    type: { coding: [{ system: "http://jpfhir.jp/fhir/Common/CodeSystem/doc-typecodes", code: "57833-6", display: "処方箋" }] },
    category: [{ coding: [{ system: "http://jpfhir.jp/fhir/ePrescription/CodeSystem/prescription-category", code: "01", display: "一般処方箋" }] }],
    subject: { reference: ref.patient },
    encounter: { reference: ref.encounter },
    date: at,
    author: [{ reference: ref.role }, { reference: ref.org }],
    title: "処方箋",
    custodian: { reference: ref.org },
    event: [{ code: [{ text: "処方箋交付" }], period: { start: issued } }],
    section: [
      {
        title: "処方情報",
        code: { coding: [{ system: "http://jpfhir.jp/fhir/ePrescription/CodeSystem/prescription-section", code: "01", display: "処方情報セクション" }] },
        entry: [{ reference: ref.coverage }, { reference: ref.insurer }, ...meds.map((m) => ({ reference: m.fullUrl }))],
      },
    ],
  };

  const bundle = clean({
    resourceType: "Bundle",
    meta: profile("JP_Bundle_ePrescriptionData"),
    identifier: { system: "urn:ietf:rfc:3986", value: u("bundle") },
    type: "document",
    timestamp: jstDateTime(issued, `${x.time}:00.000`),
    entry: [
      { fullUrl: ref.composition, resource: composition },
      { fullUrl: ref.patient, resource: patient },
      { fullUrl: ref.encounter, resource: encounter },
      { fullUrl: ref.coverage, resource: coverage },
      { fullUrl: ref.insurer, resource: insurer },
      { fullUrl: ref.org, resource: org },
      { fullUrl: ref.dept, resource: dept },
      { fullUrl: ref.role, resource: role },
      { fullUrl: ref.doctor, resource: doctor },
      ...meds,
    ],
  });
  if (!x.lines.length) problems.push("処方がありません。");
  return { bundle, unfilled, problems, practitionerRef: ref.doctor, prescriptionNo };
}

// ---------------------------------------------------------------------------
// 模擬の署名
// ---------------------------------------------------------------------------

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};

/**
 * 模擬の署名: the SHA-256 of the Bundle (without a signature), put in Bundle.signature as HS036's reference
 * shape (type 1.2.840.10065.1.12.1.1 作成者の署名, when, who, data). It proves nothing: a real 電子処方箋 is
 * signed by the doctor with an HPKI card or the HPKI セカンド電子証明書 (remote), with a time stamp.
 */
export async function mockSign(build: ErxBuild, when: string): Promise<{ bundle: Record<string, unknown>; signature: ErxSignature }> {
  const { signature: _old, ...body } = build.bundle as Record<string, unknown> & { signature?: unknown };
  void _old;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body))));
  const data = toBase64(digest);
  const signature: ErxSignature = { mock: true, when, who: build.practitionerRef, data };
  return {
    bundle: { ...body, signature: { type: [{ system: "urn:iso-astm:E1762-95:2013", code: "1.2.840.10065.1.12.1.1", display: "Author's Signature" }], when, who: { reference: build.practitionerRef }, data } },
    signature,
  };
}
