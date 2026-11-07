// 患者さんのページの鍵（サーバーだけで使う）: the QR on the 診察券 carries a token the server made, and the
// patient's tab, once the birth date was right, a session token. What a token says (the workspace, the patient,
// until when) is encrypted (AES-256-GCM), so the patient's device never holds the workspace id or the patient
// id, and signed (HMAC-SHA256), so it cannot be made or changed elsewhere. Nothing personal is in it. The key
// comes from PORTAL_SECRET; without it a fixed development string is used (the records are fictional).

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenKind = "card" | "session";

export interface PortalClaims {
  k: TokenKind;
  /** The workspace (null: the fictional records of the code, no workspace). */
  w: string | null;
  /** The patient: an inpatient's id, or "card:" and the 診察券番号. */
  p: string;
  /** Valid until (epoch seconds). */
  e: number;
}

/** How long a token is good for: the 診察券's QR, and a logged-in tab. */
export const TOKEN_TTL: Record<TokenKind, number> = { card: 30 * 24 * 3600, session: 12 * 3600 };

const DEV_SECRET = "simple-karte-fictional-portal-development-v1";
const key = (label: string) => createHmac("sha256", process.env.PORTAL_SECRET || DEV_SECRET).update(label).digest();
const mac = (text: string) => createHmac("sha256", key("portal:mac")).update(text).digest().subarray(0, 16);

export const isWorkspaceId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
export const isSubject = (s: unknown): s is string => typeof s === "string" && (/^card:\d{7}$/.test(s) || /^[0-9A-Za-z][0-9A-Za-z-]{0,39}$/.test(s));

/** A new token for the patient (the workspace may be null). */
export function sealToken(kind: TokenKind, ws: string | null, subject: string, now = Date.now()): string {
  const claims: PortalClaims = { k: kind, w: ws, p: subject, e: Math.floor(now / 1000) + TOKEN_TTL[kind] };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("portal:enc"), iv);
  const sealed = Buffer.concat([iv, cipher.update(JSON.stringify(claims), "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64url");
  return `${sealed}.${mac(sealed).toString("base64url")}`;
}

/** What a token says, or null when it was not made here, was changed, is of the other kind or has expired. */
export function openToken(token: unknown, kind: TokenKind, now = Date.now()): PortalClaims | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [sealed, sig, rest] = token.split(".");
  if (!sealed || !sig || rest !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const want = mac(sealed);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = createDecipheriv("aes-256-gcm", key("portal:enc"), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const c = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8")) as PortalClaims;
    if (c.k !== kind || !(c.w === null || isWorkspaceId(c.w)) || !isSubject(c.p) || typeof c.e !== "number") return null;
    return c.e * 1000 > now ? c : null;
  } catch {
    return null;
  }
}

/** An opaque name for the patient (the draft kept on the device, the count of tries), without the ids in it. */
export const subjectKey = (c: Pick<PortalClaims, "w" | "p">) => createHmac("sha256", key("portal:subject")).update(`${c.w ?? "-"}|${c.p}`).digest("base64url").slice(0, 22);
