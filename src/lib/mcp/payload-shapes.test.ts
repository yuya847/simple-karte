import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload, parseProposal, toAiOrder } from "./payload";
import { draftsFromAi } from "../drafts";

// A link Claude Code made through the production MCP (2026-11-07): the lab order left out the procedure
// fields and mixed null into the wire shape, and the link was refused with 400.
const FROM_CLAUDE_CODE = "eyJwYXRpZW50IjoiUC1GRTgyQTc0MjNCRDkiLCJvcmRlcnMiOlt7ImtpbmQiOiJpbmplY3Rpb24iLCJzb3VyY2VfdGV4dCI6IuOCu-ODleODiOODquOCouOCreOCveODsyAyZyAx5pelMeWbniDngrnmu7QgNeaXpemWkyIsImV4YW0iOiIiLCJleGFtX3JlZ2lvbiI6IiIsImV4YW1fY29udHJhc3QiOiIiLCJleGFtX3B1cnBvc2UiOiIiLCJyeF9jYXRlZ29yeSI6IiIsInJ4X2Ftb3VudF9pcyI6IiIsInJ4X3RpbWluZ3MiOltdLCJyeF9tYXhfcGVyX2RheSI6MCwicHJvY2VkdXJlX2NvZGUiOiIiLCJzaXRlIjoiIiwic2l6ZV9zYWlkIjoiIiwiZGVwdGgiOiIiLCJvMl9kZXZpY2UiOiIiLCJvMl9scG0iOjAsImRydWdzIjpbeyJjb2RlIjoiNjIwMDAyOTU1Iiwic2FpZCI6IuOCu-ODleODiOODquOCouOCreOCveODsyIsImFtb3VudCI6MiwidW5pdCI6ImcifV0sInJvdXRlIjoi54K55ru06Z2Z5rOoIiwiZnJlcXVlbmN5Ijp7ImtpbmQiOiJwZXJfZGF5IiwidmFsdWUiOjF9LCJpbmZ1c2lvbiI6eyJtaW51dGVzIjpudWxsLCJhcHBsaWVzX3RvIjpudWxsLCJyYXRlX21sX3Blcl9oIjpudWxsfSwic3RhcnQiOnsiZGF5IjoidW5zcGVjaWZpZWQiLCJ0aW1lIjpudWxsfSwiZGF5cyI6NSwidGVzdHMiOltdLCJjb2xsZWN0Ijp7ImRheSI6InVuc3BlY2lmaWVkIiwid2hlbiI6InVuc3BlY2lmaWVkIiwidGltZSI6bnVsbCwiYmVmb3JlX2Rvc2VfbnVtYmVyIjpudWxsLCJiZWZvcmVfZG9zZV9kcnVnX2NvZGUiOm51bGx9LCJwcmlvcml0eSI6bnVsbCwiY3VsdHVyZV9zZXRzIjpudWxsLCJjb21tZW50IjpudWxsfSx7ImtpbmQiOiJsYWIiLCJzb3VyY2VfdGV4dCI6IuaYjuacnSBDQkMg44GoIENSUCIsImV4YW0iOiIiLCJleGFtX3JlZ2lvbiI6IiIsImV4YW1fY29udHJhc3QiOiIiLCJleGFtX3B1cnBvc2UiOiIiLCJyeF9jYXRlZ29yeSI6IiIsInJ4X2Ftb3VudF9pcyI6IiIsInJ4X3RpbWluZ3MiOltdLCJyeF9tYXhfcGVyX2RheSI6MCwicHJvY2VkdXJlX2NvZGUiOiIiLCJzaXRlIjoiIiwiZXhhbSI6IiIsImRydWdzIjpbXSwicm91dGUiOm51bGwsImZyZXF1ZW5jeSI6eyJraW5kIjoidW5zcGVjaWZpZWQiLCJ2YWx1ZSI6bnVsbH0sImluZnVzaW9uIjp7Im1pbnV0ZXMiOm51bGwsImFwcGxpZXNfdG8iOm51bGwsInJhdGVfbWxfcGVyX2giOm51bGx9LCJzdGFydCI6eyJkYXkiOiJ1bnNwZWNpZmllZCIsInRpbWUiOm51bGx9LCJkYXlzIjpudWxsLCJ0ZXN0cyI6W3siY29kZSI6IkxBQi1DQkMiLCJzYWlkIjoiQ0JDIn0seyJjb2RlIjoiTEFCLUNSUCIsInNhaWQiOiJDUlAifV0sImNvbGxlY3QiOnsiZGF5IjoidG9tb3Jyb3ciLCJ3aGVuIjoibW9ybmluZ19yb3V0aW5lIiwidGltZSI6bnVsbCwiYmVmb3JlX2Rvc2VfbnVtYmVyIjpudWxsLCJiZWZvcmVfZG9zZV9kcnVnX2NvZGUiOm51bGx9LCJwcmlvcml0eSI6bnVsbCwiY3VsdHVyZV9zZXRzIjpudWxsLCJjb21tZW50IjpudWxsfV19";

describe("orders proposed through MCP in whatever shape", () => {
  it("opens the link Claude Code made, with both orders", () => {
    const p = decodePayload(FROM_CLAUDE_CODE);
    expect(p.orders.map(o => o.kind)).toEqual(["injection", "lab"]);
    expect(p.orders[1].tests.map(t => t.code)).toEqual(["LAB-CBC", "LAB-CRP"]);
    expect(p.orders[1].collect.day).toBe("tomorrow");
    expect(draftsFromAi({ orders: p.orders, not_understood: [] }, (() => { let n = 0; return () => String(++n); })())).toHaveLength(2);
  });
  it("re-encodes what it decoded and reads it back the same (the link → the chart's #)", () => {
    const p = decodePayload(FROM_CLAUDE_CODE);
    expect(decodePayload(encodePayload(p))).toEqual(p);
  });
  it("fills an order that names only what was said", () => {
    const o = toAiOrder({ kind: "lab", source_text: "明朝 CRP", tests: [{ code: "LAB-CRP", said: "CRP" }], collect: { day: "tomorrow", when: "morning_routine" } });
    expect(o.size_said).toBe("");
    expect(o.collect.time).toBeNull();
    expect(o.route).toBeNull();
  });
  it("still refuses what is not an order", () => {
    expect(() => parseProposal({ patient: "P-ABCDEF123456", orders: [{ kind: "魔法" }] })).toThrow();
    expect(() => parseProposal({ patient: "P-ABCDEF123456", orders: [] })).toThrow();
  });
});
