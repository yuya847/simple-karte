import { afterEach, expect, it, vi } from "vitest";
import { documentMemorySnapshot, parseDocumentMemory, rememberDocument, saveDocumentMemory } from "./document-memory";
afterEach(() => vi.unstubAllGlobals());
it("壊れた保存値を除き、重複をなくす", () => {
  expect(parseDocumentMemory("bad")).toEqual({ stars: [], recent: [] });
  expect(parseDocumentMemory('{"stars":["診断書",3,"診断書"],"recent":null}')).toEqual({ stars: ["診断書"], recent: [] });
});
it("利用者ごとに分け、最近作った順に最大10件を残す", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  saveDocumentMemory("甲", { stars: ["診断書"], recent: [] });
  for (let i = 0; i < 12; i++) rememberDocument("甲", String(i));
  rememberDocument("甲", "8");
  const memory = parseDocumentMemory(documentMemorySnapshot("甲"));
  expect(memory.stars).toEqual(["診断書"]);
  expect(memory.recent).toHaveLength(10);
  expect(memory.recent.slice(0, 3)).toEqual(["8", "11", "10"]);
  expect(parseDocumentMemory(documentMemorySnapshot("乙"))).toEqual({ stars: [], recent: [] });
});
