// The SIMULATED connector (模擬): answers in code with FICTIONAL data, the same every time, and never sends
// anything anywhere. adapter.ts uses it in place of a real connection.

import { addDays, isoDate } from "../dates";
import type { NationalServices } from "./adapter";
import type { ClinsReceipt, OtherHospitalInfo } from "./clins";
import type { ErxReceipt } from "./erx";
import { erxChecks } from "./erx-check";
import { seedOf, uuidOf } from "./fictional";
import { fictionalQualification } from "./onshi";
import { otherRxOf } from "./other-records";

/** The other hospitals' 6情報 the service holds (FICTIONAL). By chart id. */
const OTHER_SIX: Record<string, { kind: OtherHospitalInfo["items"][number]["kind"]; text: string; from: string; day: number }[]> = {
  "90010231": [
    { kind: "傷病名", text: "高血圧症", from: "かえで内科医院（架空）", day: -400 },
    { kind: "傷病名", text: "逆流性食道炎", from: "かえで内科医院（架空）", day: -300 },
    { kind: "その他アレルギー等", text: "そば（じんましん）", from: "かえで内科医院（架空）", day: -700 },
    { kind: "検査", text: "HbA1c 6.1%（2回前の受診）", from: "かえで内科医院（架空）", day: -20 },
  ],
  "90010244": [
    { kind: "傷病名", text: "アルツハイマー型認知症", from: "あおば内科（架空）", day: -900 },
    { kind: "傷病名", text: "骨粗鬆症", from: "あおば内科（架空）", day: -500 },
    { kind: "検査", text: "Cre 0.92 mg/dL", from: "あおば内科（架空）", day: -15 },
  ],
  "90010198": [
    { kind: "傷病名", text: "慢性心不全", from: "みなと循環器クリニック（架空）", day: -800 },
    { kind: "傷病名", text: "発作性心房細動の疑い", from: "みなと循環器クリニック（架空）", day: -60 },
    { kind: "薬剤アレルギー等", text: "ロキソプロフェン（喘息発作）", from: "みなと循環器クリニック（架空）", day: -1200 },
    { kind: "検査", text: "BNP 286 pg/mL", from: "みなと循環器クリニック（架空）", day: -26 },
    { kind: "検査", text: "K 4.9 mmol/L", from: "みなと循環器クリニック（架空）", day: -26 },
  ],
  "90010260": [
    { kind: "傷病名", text: "脂質異常症", from: "かえで内科医院（架空）", day: -365 },
    { kind: "感染症", text: "HBs抗原 陰性", from: "かえで内科医院（架空）", day: -365 },
    { kind: "検査", text: "LDL-C 162 mg/dL", from: "かえで内科医院（架空）", day: -12 },
  ],
};

export const mockNationalServices: NationalServices = {
  simulated: true,
  name: "模擬の接続（本物の回線・証明書・契約が要るので、どこにもつながない）",

  async checkQualification(req) {
    return fictionalQualification(req, req.today, req.time);
  },

  async checkPrescription({ patientKey, drugs, consent, today }) {
    return erxChecks(drugs, otherRxOf(patientKey), today, consent);
  },

  async registerPrescription({ patientKey, bundle, signature, kind, today, time }) {
    // 引換番号: 6桁 at the start of the service (systems handle up to 16). Only for a 院外処方箋.
    const seed = seedOf(`${patientKey}|${signature?.data ?? JSON.stringify(bundle).length}|${time}`);
    const r: ErxReceipt = {
      prescriptionId: uuidOf(`erx|${seed}`),
      ...(kind === "院外" ? { exchangeNo: String(seed % 1_000_000).padStart(6, "0") } : {}),
      registeredAt: `${isoDate(today)} ${time}`,
      kind,
      mock: true,
    };
    return r;
  },

  async sendClinical({ kind, bundle, today, time }) {
    const entries = (bundle as { entry?: unknown[] }).entry?.length ?? 0;
    const r: ClinsReceipt = { kind, receiptNo: `R${String(seedOf(`${kind}|${JSON.stringify(bundle).length}|${time}`) % 100_000_000).padStart(8, "0")}`, receivedAt: `${isoDate(today)} ${time}`, result: `受け付けた（模擬）：${entries}件のリソース。本物のサービスでは検証と無害化のあと、状況照会で結果を確かめる`, mock: true };
    return r;
  },

  async otherHospitalInfo({ patientKey, consent, today }) {
    if (!consent) return { consented: false, items: [] };
    return { consented: true, items: (OTHER_SIX[patientKey] ?? []).map((x) => ({ kind: x.kind, text: x.text, from: x.from, date: isoDate(addDays(today, x.day)) })) };
  },
};
