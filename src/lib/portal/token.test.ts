import { afterEach, describe, expect, it, vi } from "vitest";
import { openToken, sealToken, subjectKey, TOKEN_TTL } from "./token";
import { createTries } from "./tries";

const WS = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("患者さんのページのトークン", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("作ったものは開け、中身（ワークスペース・患者）は読めない形で入る", () => {
    const t = sealToken("card", WS, "90010244");
    expect(openToken(t, "card")).toMatchObject({ k: "card", w: WS, p: "90010244" });
    const bytes = Buffer.from(t.split(".")[0], "base64url").toString("latin1");
    expect(t).not.toContain("90010244");
    expect(bytes).not.toContain("90010244");
    expect(bytes).not.toContain(WS);
    expect(t.length).toBeLessThan(200);
  });

  it("書き換え・別の種類・期限切れ・別の鍵では開けない", () => {
    const t = sealToken("card", null, "card:1000102", 1_000_000);
    expect(openToken(t, "card", 1_000_000)).not.toBeNull();
    const [body, sig] = t.split(".");
    const flipped = body.slice(0, 20) + (body[20] === "A" ? "B" : "A") + body.slice(21);
    expect(openToken(`${flipped}.${sig}`, "card", 1_000_000)).toBeNull();
    expect(openToken(`${body}.${sig.slice(1)}`, "card", 1_000_000)).toBeNull();
    expect(openToken(t, "session", 1_000_000)).toBeNull();
    expect(openToken(t, "card", 1_000_000 + TOKEN_TTL.card * 1000 + 1000)).toBeNull();
    vi.stubEnv("PORTAL_SECRET", "another-secret");
    expect(openToken(t, "card", 1_000_000)).toBeNull();
  });

  it("形の違う値は開けない", () => {
    expect(openToken(undefined, "card")).toBeNull();
    expect(openToken("abc", "card")).toBeNull();
    expect(openToken("a.b.c", "card")).toBeNull();
    expect(openToken("x".repeat(700), "card")).toBeNull();
  });

  it("下書きの名前は患者ごとに違い、id を含まない", () => {
    const a = subjectKey({ w: WS, p: "90010244" });
    expect(a).not.toContain("90010244");
    expect(a).not.toBe(subjectKey({ w: WS, p: "90010245" }));
    expect(a).toBe(subjectKey({ w: WS, p: "90010244" }));
  });
});

describe("生年月日の入れ直し", () => {
  it("5回違えるとしばらく入れず、時間が過ぎると戻る", () => {
    const t = createTries(5, 1000);
    expect(t.left("k", 0)).toBe(5);
    for (let i = 4; i >= 0; i--) expect(t.fail("k", 10)).toBe(i);
    expect(t.left("k", 500)).toBe(0);
    expect(t.left("other", 500)).toBe(5);
    expect(t.left("k", 1011)).toBe(5);
    t.fail("k", 2000);
    t.clear("k");
    expect(t.left("k", 2000)).toBe(5);
  });
});
