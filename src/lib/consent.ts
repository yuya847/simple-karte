// Explanations and consent forms (説明書・同意書) of the FICTIONAL hospital. The text of each form is
// a fixed template (reviewed by the hospital in real life); only the patient's details are filled in.
// AI never writes or changes a form. Which orders need which form, and whether one is in place,
// are checked in code. Numbers (frequencies) appear only with their source.

export type ConsentCode = "CONSENT-ANESTHESIA" | "CONSENT-ADMISSION" | "CONSENT-CT-CONTRAST" | "CONSENT-MRI-CONTRAST" | "CONSENT-CVC" | "CONSENT-TRANSFUSION";
export type ConsentStatus = "説明前" | "同意" | "拒否" | "撤回";

export interface ConsentSection {
  heading: string;
  /** Paragraphs or bullet lines. */
  lines: string[];
  /** Frequencies, each with its source (shown in small type under the section). */
  facts?: { text: string; source: string }[];
}

export interface ConsentTemplate {
  code: ConsentCode;
  title: string;
  /** Short name for lists and checks. */
  short: string;
  version: string;
  sections: ConsentSection[];
  /** 問診 or risk check (yes/no) before the procedure. */
  questions?: { id: string; label: string }[];
  questionsTitle?: string;
  /** Shown when any answer is はい. */
  yesNote?: string;
  sources: { label: string; url: string }[];
}

export interface ConsentRecord {
  id: string;
  patientId: string;
  code: ConsentCode;
  status: ConsentStatus;
  /** The order this form is for (e.g. the contrast CT), when there is one. */
  orderId?: string;
  createdAt: { day: number; time: string };
  explainedAt?: { day: number; time: string };
  explainedBy?: string;
  witness?: string;
  proxy?: { name: string; relation: string };
  answers: Record<string, "はい" | "いいえ" | "わからない">;
  /** What the doctor added for this patient (typed or dictated; not written by AI). */
  extra?: string;
  /** Who recorded a refusal or a withdrawal, and when. */
  closedAt?: { day: number; time: string };
  /** Signed on a tablet (iPad): PNG images, kept with the record. Without them the paper form is signed. */
  signatures?: ConsentSignature[];
  /** What the patient (or proxy) chose on the tablet. */
  choice?: "同意する" | "同意しない";
}

export type SignRole = "本人" | "代諾者" | "説明した医師" | "同席者";
export interface ConsentSignature {
  role: SignRole;
  name: string;
  dataUrl: string;
  at: { day: number; time: string };
}

/** The signatures a tablet consent needs: the patient or the proxy, and the doctor. */
export function signaturesMissing(sigs: ConsentSignature[], byProxy: boolean): SignRole[] {
  const need: SignRole[] = [byProxy ? "代諾者" : "本人", "説明した医師"];
  return need.filter((r) => !sigs.some((s) => s.role === r && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.dataUrl)));
}

export const consentDone = (r: ConsentRecord) => r.status === "同意" || (r.status === "説明前" && r.choice === "同意する" && signaturesMissing(r.signatures ?? [], !!r.proxy).length === 0);

export const signatureOf = (r: ConsentRecord, role: SignRole) => r.signatures?.find((s) => s.role === role);

/** The form an order needs, if any. */
export function consentFor(order: { type: string; modality?: string; contrast?: string; code?: string }): ConsentCode | null {
  if (order.type === "imaging" && order.modality === "CT" && order.contrast && order.contrast !== "単純") return "CONSENT-CT-CONTRAST";
  if (order.type === "imaging" && order.modality === "MRI" && order.contrast && order.contrast !== "単純") return "CONSENT-MRI-CONTRAST";
  if (order.type === "procedure" && order.code === "PROC-CVC") return "CONSENT-CVC";
  if (order.type === "procedure" && order.code === "PROC-TX") return "CONSENT-TRANSFUSION";
  return null;
}

/** Templates are filled in consent-templates.ts (text with sources). */
export { CONSENT_TEMPLATES, findConsent } from "./consent-templates";
