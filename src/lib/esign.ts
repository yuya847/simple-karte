// 電子署名（模擬）: a confirmed 退院時サマリー or 診療情報提供書 is signed with a key made in this browser (Web
// Crypto, ECDSA P-256 with SHA-256). The signature covers the document's SHA-256, the kind, the patient, the
// signer and the time; checking it later tells whether the content is still the same and whether the
// signature fits. The private key never leaves the browser (kept in IndexedDB as a key that cannot be taken
// out); only the signature, the hashes and the key's fingerprint go into the records.
//
// This is NOT a legal signature: replacing a doctor's 記名・押印 needs an electronic certificate such as one of an
// HPKI certification authority, and a timestamp of an accredited provider when it must be checked over the
// years (安全管理ガイドライン 第7.0版 企画管理編 14、システム運用編 15).

import type { DischargeDraft } from "./discharge";

export const ESIGN_SOURCES = [
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 企画管理編」14 法令で定められた記名・押印のための電子署名（遵守事項① 1.(2)(a) HPKI 認証局の電子証明書、2. タイムスタンプ、② 秘密鍵の管理）",
    url: "https://www.mhlw.go.jp/content/10808000/001716292.pdf",
  },
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」15 電子署名、タイムスタンプ（15.1：秘密鍵を格納する機器・媒体は FIPS 140-3 レベル1相当以上）",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
];

export type SignedKind = "退院時サマリー" | "診療情報提供書";
export const ALG = "ECDSA P-256 / SHA-256（模擬）";

export interface SignRecord {
  id: string;
  patientId: string;
  kind: SignedKind;
  /** SHA-256 (hex) of the document as signed. */
  docHash: string;
  /** The signature (base64 of r‖s). */
  signature: string;
  /** Fingerprint of the public key (first 16 bytes of the SHA-256 of its SPKI, hex). */
  keyId: string;
  signer: string;
  role: string;
  /** "YYYY-MM-DD" and "HH:MM:SS" (Japan), from this device's clock (no timestamp authority). */
  at: { date: string; time: string };
  alg: typeof ALG;
}

/** JSON with the keys of every object in order, so the same content always gives the same text. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const sha256Hex = async (text: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

/** What the signature covers. */
export const signedText = (r: Pick<SignRecord, "kind" | "patientId" | "docHash" | "signer" | "role" | "at">) => canonical({ v: 1, kind: r.kind, patientId: r.patientId, docHash: r.docHash, signer: r.signer, role: r.role, at: r.at });

// ---------------------------------------------------------------------------
// Keys: one pair per person in this browser
// ---------------------------------------------------------------------------

export interface KeyStore {
  get(name: string): Promise<CryptoKeyPair | null>;
  put(name: string, pair: CryptoKeyPair): Promise<void>;
}

/** Keys in memory (tests; a browser without IndexedDB keeps them only while the page is open). */
export function memoryKeys(): KeyStore {
  const m = new Map<string, CryptoKeyPair>();
  return { get: async (n) => m.get(n) ?? null, put: async (n, p) => void m.set(n, p) };
}

/** Keys in this browser's IndexedDB. The private key is made non-extractable, so it cannot be read out. */
export function browserKeys(): KeyStore {
  if (typeof indexedDB === "undefined") return memoryKeys();
  const open = () =>
    new Promise<IDBDatabase>((ok, fail) => {
      const r = indexedDB.open("simple-karte-esign", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("keys");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((ok, fail) => {
        const req = f(db.transaction("keys", mode).objectStore("keys"));
        req.onsuccess = () => ok(req.result);
        req.onerror = () => fail(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: async (n) => ((await run("readonly", (s) => s.get(n))) as CryptoKeyPair | undefined) ?? null,
    put: async (n, p) => void (await run("readwrite", (s) => s.put(p, n))),
  };
}

export const keyIdOf = async (pub: CryptoKey) => hex(await crypto.subtle.digest("SHA-256", await crypto.subtle.exportKey("spki", pub))).slice(0, 32);

/** This person's key pair in this browser, made the first time. */
export async function keyFor(store: KeyStore, signer: string): Promise<{ pair: CryptoKeyPair; keyId: string; made: boolean }> {
  const had = await store.get(signer);
  if (had) return { pair: had, keyId: await keyIdOf(had.publicKey), made: false };
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
  await store.put(signer, pair);
  return { pair, keyId: await keyIdOf(pair.publicKey), made: true };
}

const ECDSA = { name: "ECDSA", hash: "SHA-256" } as const;

/** Sign a document's content now. */
export async function signDoc(store: KeyStore, input: { id: string; kind: SignedKind; patientId: string; doc: unknown; signer: string; role: string; at: SignRecord["at"] }): Promise<SignRecord> {
  const { pair, keyId } = await keyFor(store, input.signer);
  const docHash = await sha256Hex(canonical(input.doc));
  const head = { kind: input.kind, patientId: input.patientId, docHash, signer: input.signer, role: input.role, at: input.at };
  const sig = await crypto.subtle.sign(ECDSA, pair.privateKey, enc.encode(signedText(head)));
  return { id: input.id, ...head, signature: b64(sig), keyId, alg: ALG };
}

export type SignatureCheck = "正しい" | "正しくない" | "この端末に鍵がない";
export interface Verification {
  /** The document now is what was signed. */
  sameContent: boolean;
  signature: SignatureCheck;
}

/** Check a signature against the document as it is now. */
export async function verifyDoc(store: KeyStore, r: SignRecord, docNow: unknown): Promise<Verification> {
  const sameContent = (await sha256Hex(canonical(docNow))) === r.docHash;
  const pair = await store.get(r.signer);
  if (!pair || (await keyIdOf(pair.publicKey)) !== r.keyId) return { sameContent, signature: "この端末に鍵がない" };
  let ok = false;
  try {
    ok = await crypto.subtle.verify(ECDSA, pair.publicKey, unb64(r.signature), enc.encode(signedText(r)));
  } catch {
    ok = false;
  }
  return { sameContent, signature: ok ? "正しい" : "正しくない" };
}

/** The result in words. */
export function verificationText(v: Verification): string {
  const content = v.sameContent ? "内容は署名したときと同じです。" : "署名したあとで内容が変わっています（修正か改ざん）。";
  const sig =
    v.signature === "正しい"
      ? "署名はこの端末の鍵と合います。"
      : v.signature === "正しくない"
        ? "署名が合いません（署名の記録が書き換えられたかもしれません）。"
        : "この署名の鍵はこの端末にありません（鍵は署名した端末のブラウザにだけあります）。署名そのものは確かめられません。";
  return `${content}${sig}`;
}

/** The records read back from the day's records (anything that does not fit is left out). */
export function validSignatures(v: unknown): SignRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is SignRecord => {
    if (!r || typeof r !== "object") return false;
    const x = r as Record<string, unknown>;
    const at = x.at as Record<string, unknown> | undefined;
    return (
      typeof x.id === "string" &&
      typeof x.patientId === "string" &&
      (x.kind === "退院時サマリー" || x.kind === "診療情報提供書") &&
      typeof x.docHash === "string" &&
      /^[0-9a-f]{64}$/.test(x.docHash) &&
      typeof x.signature === "string" &&
      x.signature.length <= 200 &&
      typeof x.keyId === "string" &&
      typeof x.signer === "string" &&
      !!at &&
      typeof at.date === "string" &&
      typeof at.time === "string"
    );
  });
}

/** What is signed of the 退院時サマリー or the 診療情報提供書 (null while it is not confirmed or issued). */
export function signedContent(kind: SignedKind, d: DischargeDraft | undefined): unknown | null {
  if (!d) return null;
  if (kind === "退院時サマリー")
    return d.status === "確定" ? { patientId: d.patientId, dischargeDay: d.dischargeDay, destination: d.destination, outcome: d.outcome, route: d.route, sections: d.sections, confirmedAt: d.confirmedAt, confirmedBy: d.confirmedBy } : null;
  return d.letter.issuedAt ? { patientId: d.patientId, letter: d.letter, sections: d.sections } : null;
}

/** "2026-11-04" and "10:32:05" in Japan. */
export function nowStamp(d = new Date()): SignRecord["at"] {
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}:${v("second")}` };
}
