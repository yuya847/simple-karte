// Explanations and consent forms (説明書・同意書) of the FICTIONAL hospital. The text of each form is
// a fixed template (reviewed by the hospital in real life); only the patient's details are filled in.
// AI never writes or changes a form. Which orders need which form, and whether one is in place,
// are checked in code. Numbers (frequencies) appear only with their source.

export type ConsentCode = "CONSENT-ADMISSION" | "CONSENT-CT-CONTRAST" | "CONSENT-CVC";
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
  /** 問診 (yes/no) asked before the procedure. */
  questions?: { id: string; label: string }[];
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
}

export const consentDone = (r: ConsentRecord) => r.status === "同意";

/** The form an order needs, if any. */
export function consentFor(order: { type: string; modality?: string; contrast?: string; code?: string }): ConsentCode | null {
  if (order.type === "imaging" && order.modality === "CT" && order.contrast && order.contrast !== "単純") return "CONSENT-CT-CONTRAST";
  if (order.type === "procedure" && order.code === "PROC-CVC") return "CONSENT-CVC";
  return null;
}

/** Templates are filled in consent-templates.ts (text with sources). */
export { CONSENT_TEMPLATES, findConsent } from "./consent-templates";
