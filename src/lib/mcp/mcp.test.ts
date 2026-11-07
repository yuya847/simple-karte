import { describe, expect, it } from "vitest";
import { callTool, fixtures, handleRpc, resolvePatient, toolsList } from "./server";
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
  it("negotiates protocols, notifications, ping and JSON-RPC errors", () => {
    for (const protocolVersion of ["2025-11-25","2025-06-18","2025-03-26"]) expect(JSON.stringify(handleRpc({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion}},"http://localhost"))).toContain(protocolVersion);
    expect(JSON.stringify(handleRpc({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"old"}},"http://localhost"))).toContain("2025-06-18");
    expect(handleRpc({jsonrpc:"2.0",method:"notifications/initialized"},"http://localhost")).toEqual({status:202});
    expect(handleRpc({},"http://localhost").status).toBe(400);
    expect(JSON.stringify(handleRpc({jsonrpc:"2.0",id:0,method:"ping"},"http://localhost"))).toContain('"result":{}');
    expect(JSON.stringify(handleRpc({jsonrpc:"2.0",id:1,method:"bad"},"http://localhost"))).toContain("-32601");
    expect(toolsList()).toHaveLength(4);
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
