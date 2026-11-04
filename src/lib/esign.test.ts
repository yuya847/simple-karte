import { describe, expect, it } from "vitest";
import { canonical, keyFor, memoryKeys, nowStamp, signDoc, validSignatures, verificationText, verifyDoc } from "./esign";

const summary = { dischargeDay: 2, destination: "自宅", sections: { course: "抗菌薬で改善した（架空）", plan: "外来で経過をみる" }, confirmedBy: "山本（専攻医）" };
const at = { date: "2026-11-04", time: "10:32:05" };

describe("電子署名（模擬）", () => {
  it("writes the same text for the same content, whatever the order of the keys", () => {
    expect(canonical({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: "あ" } })).toBe(canonical({ a: { c: "あ", d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(canonical({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("signs with this browser's key and checks the signature and the content", async () => {
    const keys = memoryKeys();
    const r = await signDoc(keys, { id: "g1", kind: "退院時サマリー", patientId: "p1", doc: summary, signer: "山本（専攻医）", role: "医師", at });
    expect(r.docHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.keyId).toMatch(/^[0-9a-f]{32}$/);
    expect(r.signature.length).toBeGreaterThan(40);
    expect(await verifyDoc(keys, r, { ...summary })).toEqual({ sameContent: true, signature: "正しい" });
    // The same person keeps the same key.
    expect((await keyFor(keys, "山本（専攻医）")).keyId).toBe(r.keyId);
  });

  it("finds a changed document, a changed signature record, and a key that is not on this device", async () => {
    const keys = memoryKeys();
    const r = await signDoc(keys, { id: "g1", kind: "診療情報提供書", patientId: "p1", doc: summary, signer: "山本（専攻医）", role: "医師", at });
    const changed = await verifyDoc(keys, r, { ...summary, destination: "施設" });
    expect(changed).toEqual({ sameContent: false, signature: "正しい" });
    expect(verificationText(changed)).toContain("署名したあとで内容が変わっています");
    // Someone changed who signed in the record: the signature does not fit any more.
    expect((await verifyDoc(keys, { ...r, signer: "山本（専攻医）", at: { ...at, time: "09:00:00" } }, summary)).signature).toBe("正しくない");
    expect(await verifyDoc(memoryKeys(), r, summary)).toEqual({ sameContent: true, signature: "この端末に鍵がない" });
  });

  it("keeps the private key in the browser: it cannot be exported", async () => {
    const { pair } = await keyFor(memoryKeys(), "看護師 佐藤");
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("pkcs8", pair.privateKey)).rejects.toThrow();
  });

  it("reads back only signature records, and stamps the time in Japan", async () => {
    const r = await signDoc(memoryKeys(), { id: "g1", kind: "退院時サマリー", patientId: "p1", doc: summary, signer: "山本（専攻医）", role: "医師", at });
    expect(validSignatures([r, { ...r, docHash: "x" }, null, { id: 1 }])).toEqual([r]);
    expect(nowStamp(new Date("2026-11-04T01:02:03Z"))).toEqual({ date: "2026-11-04", time: "10:02:03" });
  });
});
