import { describe, expect, it } from "vitest";
import { GET, POST } from "../../app/api/mcp/route";
import { GET as open } from "../../app/api/mcp/open/route";
import { fixtures } from "./server";
import { pseudonym } from "./anonymize";
import { encodePayload } from "./payload";
import { sampleOrder } from "./test-fixture";

describe("MCP HTTP", () => {
  it("returns JSON, rejects GET and malformed JSON, acknowledges notifications", async () => {
    expect(GET().status).toBe(405);
    const request = (body:string) => new Request("https://example.test/api/mcp",{method:"POST",body});
    const response = await POST(request('{"jsonrpc":"2.0","id":1,"method":"ping"}'));
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({jsonrpc:"2.0",id:1,result:{}});
    expect((await POST(request("{"))).status).toBe(400);
    const notification=await POST(request('{"jsonrpc":"2.0","method":"notifications/initialized"}'));
    expect(notification.status).toBe(202); expect(await notification.text()).toBe("");
  });
  it("validates and redirects only to the fictional ward", () => {
    expect(open(new Request("https://example.test/api/mcp/open?d=bad")).status).toBe(400);
    const p=fixtures.patients[1];
    const encoded=encodePayload({patient:pseudonym(p.id),orders:[sampleOrder]});
    const r=open(new Request(`https://example.test/api/mcp/open?d=${encoded}`));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(`/?scenarios=100&open=${p.id}#mcp=`);
  });
});
