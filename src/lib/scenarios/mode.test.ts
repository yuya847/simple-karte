import { afterEach, describe, expect, it, vi } from "vitest";
import { scenarioMode, scenarioStorageKey } from "./mode";
import { workspaceId } from "../workspace";
afterEach(() => vi.unstubAllGlobals());
describe("試験用と元の病棟の保存を分ける", () => {
  it("通常の保存ID・共有URLを試験側が上書きしない", () => {
    const normal = "11111111-1111-4111-8111-111111111111";
    const shared = "22222222-2222-4222-8222-222222222222";
    const data = new Map([["simple-karte:workspace", normal], ["simple-karte:workspace:scenarios-100", shared]]);
    const location = { search: `?scenarios=100&ws=${shared}` };
    vi.stubGlobal("window", { location, localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) } });
    expect(scenarioMode()).toBe(true);
    const test = workspaceId();
    expect(test).not.toBe(normal);
    expect(test).not.toBe(shared);
    expect(workspaceId()).toBe(test);
    expect(data.get("simple-karte:workspace")).toBe(normal);
    expect(data.get("simple-karte:workspace:scenarios-100")).toBe(shared);
    expect(scenarioStorageKey("display")).toBe("display:scenarios-100:v3");
    location.search = "";
    expect(workspaceId()).toBe(normal);
    expect(scenarioStorageKey("display")).toBe("display");
  });
  it("ブラウザ以外・未知のモードでは通常表示", () => {
    expect(scenarioMode()).toBe(false);
    vi.stubGlobal("window", { location: { search: "?scenarios=wrong" } });
    expect(scenarioMode()).toBe(false);
  });
});

it("試験専用の共有IDを2端末で指定でき、通常の保存先を変更しない", () => {
  const shared = "33333333-3333-4333-8333-333333333333";
  for (let device = 0; device < 2; device++) {
    const data = new Map([["simple-karte:workspace", "11111111-1111-4111-8111-111111111111"]]);
    vi.stubGlobal("window", { location: { search: `?scenarios=100&scenarioWs=${shared}` }, localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
    expect(workspaceId()).toBe(shared);
    expect(data.get("simple-karte:workspace")).toBe("11111111-1111-4111-8111-111111111111");
    expect(data.get(scenarioStorageKey("simple-karte:workspace"))).toBe(shared);
  }
});
