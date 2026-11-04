// The one place where the app talks to the national services: オンライン資格確認, 電子処方箋管理サービス and
// 電子カルテ情報共有サービス. They need the closed network (オンライン資格確認等システムの回線), the
// institution's certificates and contracts, so this prototype never connects: `nationalServices` is the
// SIMULATED connector (mock.ts), labelled 模擬 on every screen. A real connector implements the same
// interface and replaces it here; the screens and the FHIR builders stay as they are.

import type { CalendarDate } from "../dates";
import type { ClinsReceipt, OtherHospitalInfo } from "./clins";
import type { ErxReceipt, ErxSignature } from "./erx";
import type { ErxFinding } from "./erx-check";
import { mockNationalServices } from "./mock";
import type { CardQuery, OnshiConsent, OnshiPerson, OnshiResult } from "./onshi";

/** Every request carries the chart's day and time (Japan time). */
export interface When {
  today: CalendarDate;
  time: string;
}

export interface NationalServices {
  /** true for the mock: every screen says 模擬. */
  readonly simulated: boolean;
  readonly name: string;

  /** オンライン資格確認: 資格情報, and with consent 薬剤情報・特定健診情報 (限度額: see OnshiConsent). */
  checkQualification(req: When & { person: OnshiPerson; consent: OnshiConsent; how: OnshiResult["how"]; card?: CardQuery; body?: { heightCm?: number; weightKg?: number } }): Promise<OnshiResult>;

  /** 電子処方箋管理サービス: 重複投薬等チェック before registering (consent = 薬剤情報の閲覧の同意). */
  checkPrescription(req: When & { patientKey: string; drugs: string[]; consent: boolean }): Promise<ErxFinding[]>;
  /** 電子処方箋管理サービス: register a signed 院外処方箋 (the answer carries the 引換番号) or 院内処方の情報. */
  registerPrescription(req: When & { patientKey: string; bundle: unknown; signature: ErxSignature | null; kind: "院外" | "院内" }): Promise<ErxReceipt>;

  /** 電子カルテ情報共有サービス: register a document or the 臨床情報. */
  sendClinical(req: When & { patientKey: string; kind: ClinsReceipt["kind"]; bundle: unknown }): Promise<ClinsReceipt>;
  /** 電子カルテ情報共有サービス: what other institutions registered (only with the patient's consent). */
  otherHospitalInfo(req: When & { patientKey: string; consent: boolean }): Promise<OtherHospitalInfo>;
}

/** The connector the app uses. Replace with a real one to connect (not in this prototype). */
export const nationalServices: NationalServices = mockNationalServices;
