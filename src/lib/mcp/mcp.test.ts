import { describe, expect, it } from "vitest";
import { callImproveTool, callTool, fixtures, handleRpc, resolvePatient, toolsList } from "./server";
import { mergeWorkspace } from "../merge-workspace";
import { readImproveRequests, type ImproveRequest } from "../improve/requests";
import type { ImproveStore } from "../improve/server";
import { pseudonym, redact } from "./anonymize";
import { decodePayload, encodePayload, parseProposal } from "./payload";
import { readMcpDraft } from "./receive";

import { sampleOrder } from "./test-fixture";
describe("MCP fictional ward", () => {
  it("does not disclose any patient identity in every clinical output (100 ward + ICU・HCU)", () => {
    expect(fixtures.patients.length).toBeGreaterThanOrEqual(100);
    expect(new Set(fixtures.patients.map(p => pseudonym(p.id))).size).toBe(fixtures.patients.length);
    for (const p of fixtures.patients) {
      const json = JSON.stringify(callTool("get_patient",{patient:pseudonym(p.id)},"http://localhost"));
      for (const identity of [p.name,p.kana,p.id,fixtures.insurance[p.id]?.[0]?.form.birthDate].filter((s): s is string => !!s)) expect(json).not.toContain(identity);
      expect(resolvePatient(pseudonym(p.id))?.patient.id).toBe(p.id);
    }
    const list = JSON.stringify(callTool("list_patients",{},"http://localhost"));
    for (const p of fixtures.patients) { expect(list).not.toContain(p.name); expect(list).not.toContain(p.id); }
  });
  it("redacts free text and relative records", () => {
    const p = fixtures.patients[0];
    const text = redact(`${p.name} ${p.kana} ${p.attending} 090-1234-5678 2026年11月7日 架空県架空市1丁目`,fixtures.patients);
    expect(text).toContain("［氏名］"); expect(text).toContain("［電話］"); expect(text).toContain("［日付］"); expect(text).toContain("［住所］");
  });
  it("negotiates protocols, notifications, ping and JSON-RPC errors", async () => {
    for (const protocolVersion of ["2025-11-25","2025-06-18","2025-03-26"]) expect(JSON.stringify(await handleRpc({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion}},"http://localhost"))).toContain(protocolVersion);
    expect(JSON.stringify(await handleRpc({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"old"}},"http://localhost"))).toContain("2025-06-18");
    expect(await handleRpc({jsonrpc:"2.0",method:"notifications/initialized"},"http://localhost")).toEqual({status:202});
    expect((await handleRpc({},"http://localhost")).status).toBe(400);
    expect(JSON.stringify(await handleRpc({jsonrpc:"2.0",id:0,method:"ping"},"http://localhost"))).toContain('"result":{}');
    expect(JSON.stringify(await handleRpc({jsonrpc:"2.0",id:1,method:"bad"},"http://localhost"))).toContain("-32601");
    expect(toolsList()).toHaveLength(6);
  });
  it("filters, searches and imports a draft without confirming orders", () => {
    expect(callTool("list_patients",{status:"外来"},"http://localhost")).toHaveLength(10);
    expect(callTool("search_master",{kind:"lab",query:"CRP"},"http://localhost")).not.toEqual([]);
    const p = {patient:pseudonym(fixtures.patients[1].id),orders:[sampleOrder]};
    const before = JSON.stringify(fixtures);
    const result = callTool("propose_orders",p,"http://localhost") as string;
    expect(result).toContain("医師が開いて確かめ、確定してください");
    const encoded = result.split("?d=")[1];
    expect(decodePayload(encoded)).toEqual(parseProposal(p));
    const drafts = readMcpDraft(`#mcp=${encoded}`,fixtures.patients[1].id,()=>"test-draft");
    expect(drafts?.[0].kind).toBe("lab");
    expect(JSON.stringify(fixtures)).toBe(before);
    expect(()=>decodePayload(encodePayload({...p,orders:[{}]}))).toThrow();
    expect(()=>decodePayload("!")).toThrow();
    expect(()=>callTool("propose_orders",{...p,patient:"P-000000000000"},"http://localhost")).toThrow();
  });
});

it("get_patient は固定した14時より後の一般病棟・ICUのバイタルを返さない", () => {
  for (const p of fixtures.patients) {
    const result = callTool("get_patient", { patient: pseudonym(p.id) }, "http://localhost", 840) as { vitals: { day: string; time: string }[] };
    expect(result.vitals.every(v => v.day.endsWith("日前") || v.day === "今日" && Number(v.time.slice(0,2)) * 60 + Number(v.time.slice(3)) <= 840)).toBe(true);
    if (Number(p.id) >= 99000101) expect(result.vitals[0]?.time).toBe("14:00");
  }
});

describe("その場で直す（list_requests・resolve_request）", () => {
  const WS = "0f8f5d2e-1c3b-4a5d-9e7f-123456789abc";
  const p = fixtures.patients[0];
  const saved = (over: Partial<ImproveRequest> = {}): ImproveRequest => ({ id: "r1", by: "看護師 佐藤", role: "看護師", iso: "2026-11-07T15:12:00.000Z", screen: "病棟 › 入院患者一覧", text: `${p.name}さんの体温の欄が小さい`, status: "受付", ...over });
  const memory = (data: Record<string, unknown>) => {
    let row: Record<string, unknown> | null = data;
    const store: ImproveStore = {
      read: async () => (row ? JSON.parse(JSON.stringify(row)) : null),
      save: async (_ws, mine, base) => { row = mergeWorkspace(mine, row ?? {}, base).data; },
    };
    return { store, row: () => row! };
  };
  it("一覧は送った人の名前を出さず、文をもう一度置き換え、直していないものを先に", async () => {
    const m = memory({ improveRequests: [saved({ id: "done", status: "直った", commit: "abcdef1", iso: "2026-11-07T10:00:00.000Z" }), saved(), saved({ id: "r0", iso: "2026-11-07T09:00:00.000Z", text: "検査の列を右へ" })], notes: { x: 1 } });
    const out = await callImproveTool("list_requests", { workspace: `https://simple-karte.vercel.app/?ws=${WS}` }, m.store) as { requests: { id: string; text: string; role: string }[] };
    expect(out.requests.map(r => r.id)).toEqual(["r0", "r1", "done"]);
    const json = JSON.stringify(out);
    expect(json).not.toContain(p.name); expect(json).not.toContain("佐藤"); expect(json).toContain("［氏名］");
    expect(out.requests[1]).toMatchObject({ role: "看護師", screen: "病棟 › 入院患者一覧", status: "受付" });
  });
  it("直ったにすると、コミットとひとことを足し、ほかの要望とほかの記録は残る", async () => {
    const m = memory({ improveRequests: [saved({ status: "直った", commit: "1111111", seen: true, note: "前の直し" }), saved({ id: "r2", text: "別の要望" })], notes: { keep: true } });
    const out = await callImproveTool("resolve_request", { workspace: WS, id: "r1", commit: "ABCDEF1234", note: "体温の欄を広げました" }, m.store) as { status: string; commit: string };
    expect(out).toMatchObject({ status: "直った", commit: "abcdef1234" });
    const after = readImproveRequests(m.row().improveRequests);
    expect(after.find(r => r.id === "r1")).toMatchObject({ status: "直った", commit: "abcdef1234", note: "体温の欄を広げました" });
    // Fixed again: shown anew to the person who asked.
    expect(after.find(r => r.id === "r1")?.seen).toBeUndefined();
    expect(after.find(r => r.id === "r2")?.status).toBe("受付");
    expect(m.row().notes).toEqual({ keep: true });
    await callImproveTool("resolve_request", { workspace: WS, id: "r2", status: "作業中" }, m.store);
    expect(readImproveRequests(m.row().improveRequests).find(r => r.id === "r2")?.status).toBe("作業中");
  });
  it("workspace・id・コミットが不正なら書かない", async () => {
    const m = memory({ improveRequests: [saved()] });
    await expect(callImproveTool("list_requests", { workspace: "x".repeat(40) }, m.store)).rejects.toThrow("ほかの端末で開くリンク");
    await expect(callImproveTool("resolve_request", { workspace: WS, id: "none", commit: "abcdef1" }, m.store)).rejects.toThrow("見つかりません");
    await expect(callImproveTool("resolve_request", { workspace: WS, id: "r1" }, m.store)).rejects.toThrow("コミット");
    await expect(callImproveTool("resolve_request", { workspace: WS, id: "r1", commit: "not-a-sha" }, m.store)).rejects.toThrow();
    expect(readImproveRequests(m.row().improveRequests)[0].status).toBe("受付");
  });
  it("道具一覧に入力の JSON Schema があり、JSON-RPC から呼べる", async () => {
    const tools = toolsList();
    expect(tools.find(t => t.name === "list_requests")?.inputSchema).toMatchObject({ type: "object", required: ["workspace"] });
    expect(tools.find(t => t.name === "resolve_request")?.inputSchema).toMatchObject({ type: "object", required: ["workspace", "id"] });
    const m = memory({ improveRequests: [saved()] });
    const ok = await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_requests", arguments: { workspace: WS } } }, "http://localhost", m.store);
    expect(JSON.stringify(ok)).toContain("r1");
    const bad = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "resolve_request", arguments: { workspace: WS, id: "r1" } } }, "http://localhost", m.store);
    expect(JSON.stringify(bad)).toContain("isError");
    expect(JSON.stringify(bad)).toContain("コミット");
  });
});
