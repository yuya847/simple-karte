import { registeredKeys } from "./workspace-test-keys";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as (() => void)[], deps: [] as unknown[][], ec: 0 }));
vi.mock("react", () => ({
  useRef: (value: unknown) => { const i = h.cursor++; return h.slots[i] ??= { current: value }; },
  useState: (value: unknown) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = value; return [h.slots[i], (v: unknown) => { h.slots[i] = v; }]; },
  useEffect: (fn: () => void, deps?: unknown[]) => { const i = h.ec++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) h.effects.push(fn); h.deps[i] = deps ?? []; },
}));
vi.mock("./presence", () => ({ thisTab: () => "me" }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); h.slots = []; h.deps = []; h.effects = []; });
it("無操作と取り込みでは保存せず、未保存入力は残し500を指数間隔で再試行する", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", { location: { search: "?scenarios=100" }, localStorage: { getItem: () => "00000000-0000-4000-8000-000000000000" } });
  let remote = { notes: { p: [] as { id: string }[] } }; let stamp = "1"; let fail = false;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("load_workspace")) return new Response(JSON.stringify([{ version: 1, day: "today", data: remote, updated_at: stamp }]));
    if (fail) return new Response("", { status: 500 });
    remote = JSON.parse(String(init.body)).p_data;
    return new Response("true");
  }); vi.stubGlobal("fetch", fetcher);
  const { useWorkspace } = await import("./use-workspace");
  let notes: Record<string, { id: string }[]> = { p: [] };
  const WorkspaceHarness = () => { h.cursor = 0; h.ec = 0; const result = useWorkspace({ notes: [notes, v => { notes = v; }] }, "today"); const effects = h.effects.splice(0); effects.forEach(f => f()); return result; };
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  WorkspaceHarness(); await flush(); let api = WorkspaceHarness();
  await vi.advanceTimersByTimeAsync(30000); WorkspaceHarness();
  expect(fetcher.mock.calls.filter(([url]) => url.includes("save_workspace"))).toHaveLength(0);
  remote = { notes: { p: [{ id: "remote" }] } }; stamp = "2";
  await api.pull(); api = WorkspaceHarness(); await vi.advanceTimersByTimeAsync(15000);
  expect(fetcher.mock.calls.filter(([url]) => url.includes("save_workspace"))).toHaveLength(0);
  notes = { p: [...notes.p, { id: "local" }] }; api = WorkspaceHarness();
  expect(api.isSaved("notes", notes)).toBe(false);
  remote = { notes: { p: [{ id: "remote" }, { id: "other" }] } }; stamp = "3";
  await api.pull(); WorkspaceHarness(); expect(notes.p.map(x => x.id)).toContain("local");
  fail = true; await vi.advanceTimersByTimeAsync(1000); expect(WorkspaceHarness().status).toBe("error");
  const count = () => fetcher.mock.calls.filter(([url]) => url.includes("save_workspace")).length;
  expect(count()).toBe(1); await vi.advanceTimersByTimeAsync(2000); expect(count()).toBe(2);
  await vi.advanceTimersByTimeAsync(3999); expect(count()).toBe(2);
  fail = false; await vi.advanceTimersByTimeAsync(1); expect(WorkspaceHarness().status).toBe("saved");
  expect(notes.p.map(x => x.id)).toContain("local");
  expect(WorkspaceHarness().isSaved("notes", notes)).toBe(true);
});
it("名前解決の失敗を定期取り込みの呼び元へ投げず、保存の表示をエラーにする", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unreachable.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", { location: { search: "" }, localStorage: { getItem: () => "00000000-0000-4000-8000-000000000000" } });
  let offline=false;
  vi.stubGlobal("fetch", vi.fn(async () => {
    if(offline) throw new TypeError("Failed to fetch");
    return Response.json([]);
  }));
  const { useWorkspace }=await import("./use-workspace");
  const WorkspaceHarness=()=>{h.cursor=0;h.ec=0;const api=useWorkspace({notes:[{},()=>{}]},"today");h.effects.splice(0).forEach(f=>f());return api;};
  WorkspaceHarness(); for(let i=0;i<30;i++) await Promise.resolve();
  let api=WorkspaceHarness();
  offline=true;
  await expect(api.pull()).resolves.toBeNull();
  api=WorkspaceHarness(); expect(api.status).toBe("error");
  offline=false;
  await expect(api.pull()).resolves.toBeNull();
});
it("種の回診・受領を保存し、差分を新しい種へ戻して再読込する", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", { location: { search: "?scenarios=100" }, localStorage: { getItem: () => "00000000-0000-4000-8000-000000000000" } });
  const initial = () => ({ teamDesk: { requests: [{ id: "r", reason: "before" }], rounds: [] as {id:string;assessment:string}[] }, kitchenDesk: { received: {} as Record<string, {by:string}> } });
  let remote: unknown = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("load_workspace")) return Response.json(remote ? [{version:1,day:"today",data:remote}] : []);
    remote = JSON.parse(String(init.body)).p_data; return Response.json(true);
  }));
  const { useWorkspace } = await import("./use-workspace");
  let records = initial();
  const WorkspaceHarness = () => { h.cursor=0;h.ec=0; const api=useWorkspace(Object.fromEntries(Object.entries(records).map(([k,v])=>[k,[v,(x:never)=>{records={...records,[k]:x};}]])),"today");h.effects.splice(0).forEach(f=>f());return api; };
  const flush=async()=>{for(let i=0;i<40;i++) await Promise.resolve();};
  WorkspaceHarness();await flush();WorkspaceHarness();
  records={teamDesk:{requests:[{id:"r",reason:"changed"}],rounds:[{id:"round",assessment:"所見"}]},kitchenDesk:{received:{diet:{by:"高橋"}}}};
  WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  records = {...records, teamDesk: {...records.teamDesk, requests: [{id:"r",reason:"second change"}]}};
  WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  h.slots=[];h.deps=[];h.effects=[];records=initial();WorkspaceHarness();await flush();WorkspaceHarness();
  expect(records.teamDesk.requests[0].reason).toBe("second change");
  expect(records.teamDesk.rounds[0]?.assessment).toBe("所見");
  expect(records.kitchenDesk.received.diet?.by).toBe("高橋");
});

for (const key of registeredKeys()) it(`${key}: 保存完了の次の編集も保存要求を出し再読込で残る`, async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", { location: {search:"?scenarios=100"}, localStorage:{getItem:()=>"00000000-0000-4000-8000-000000000000"} });
  let remote: unknown = null;
  let saves=0;
  vi.stubGlobal("fetch", vi.fn(async (url:string, init:RequestInit) => {
    if(url.endsWith("load_workspace")) return Response.json(remote ? [{version:1,day:"today",data:remote}] : []);
    remote=JSON.parse(String(init.body)).p_data; saves++; return Response.json(true);
  }));
  const {useWorkspace}=await import("./use-workspace");
  const seed=()=>({patient:[{id:"seed",text:"before",received:false}]});
  let value=seed();
  const WorkspaceHarness=()=>{h.cursor=0;h.ec=0;const api=useWorkspace({[key]:[value,v=>{value=v;}]},"today");h.effects.splice(0).forEach(f=>f());return api;};
  const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
  WorkspaceHarness();await flush();WorkspaceHarness();
  value={patient:[{id:"seed",text:"first",received:false}]};WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  value={patient:[{id:"seed",text:"second",received:true}]};WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  expect(saves).toBe(2);
  h.slots=[];h.deps=[];h.effects=[];value=seed();WorkspaceHarness();await flush();WorkspaceHarness();
  expect(value.patient[0]).toEqual({id:"seed",text:"second",received:true});
});

it("値が同じまま保存完了した場合も、次の単純な値の編集を落とさない", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("window", {location:{search:"?scenarios=100"},localStorage:{getItem:()=>"00000000-0000-4000-8000-000000000000"}});
  let remote: unknown=null;let saves=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith("load_workspace"))return Response.json(remote?[{version:1,day:"today",data:remote}]:[]);
    remote=JSON.parse(String(init.body)).p_data;saves++;return Response.json(true);
  }));
  const {useWorkspace}=await import("./use-workspace");let value="before";
  const WorkspaceHarness=()=>{h.cursor=0;h.ec=0;useWorkspace({sessionStart:[value,v=>{value=v;}]},"today");h.effects.splice(0).forEach(f=>f());};
  WorkspaceHarness();for(let i=0;i<40;i++)await Promise.resolve();WorkspaceHarness();
  value="first";WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  value="second";WorkspaceHarness();await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();
  expect(saves).toBe(2);
});

for (const alreadySaved of [false, true]) it(`保存待ちで閉じても復元し、サーバーに${alreadySaved ? "ある" : "ない"}入力を二度送らない`, async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
  const storage = new Map<string,string>();
  vi.stubGlobal("window", {location:{search:"?scenarios=100"},localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
  let remote: unknown = null, saves = 0;
  vi.stubGlobal("fetch", vi.fn(async (url:string, init:RequestInit) => {
    if(url.endsWith("load_workspace")) return Response.json(remote ? [{version:1,day:"today",data:remote}] : []);
    remote=JSON.parse(String(init.body)).p_data;saves++;return Response.json(true);
  }));
  const {useWorkspace}=await import("./use-workspace");
  let value: Record<string,{id:string;text:string}[]>={p:[]};
  const WorkspaceHarness=()=>{h.cursor=0;h.ec=0;const api=useWorkspace({notes:[value,v=>{value=v;}]},"today");h.effects.splice(0).forEach(f=>f());return api;};
  const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
  WorkspaceHarness();await flush();WorkspaceHarness();
  value={p:[{id:"handoff",text:"保存待ちの申し送り"}]};WorkspaceHarness();
  const pending=[...storage.entries()].find(([k])=>k.includes(":pending:"));expect(pending).toBeDefined();
  if(alreadySaved)remote=JSON.parse(pending![1]).data;
  vi.clearAllTimers();h.slots=[];h.deps=[];h.effects=[];value={p:[]};
  WorkspaceHarness();await flush();WorkspaceHarness();
  expect(value.p).toEqual([{id:"handoff",text:"保存待ちの申し送り"}]);
  await vi.advanceTimersByTimeAsync(1000);WorkspaceHarness();await vi.advanceTimersByTimeAsync(15000);WorkspaceHarness();
  expect(saves).toBe(alreadySaved?0:1);
  expect([...storage.keys()].some(k=>k.includes(":pending:"))).toBe(false);
});
