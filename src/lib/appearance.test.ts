import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, FONT_SIZES, LAST_APPEARANCE_KEY, THEMES, appearanceBootScript, applyAppearance, fontZoom, loadAppearance, normalizeAppearance, saveAppearance } from "./appearance";
import { cssPx, pageZoom, viewH, viewW } from "./page-zoom";

const memory = () => {
  const data = new Map<string, string>();
  return { data, store: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } };
};

/** A stand-in <html> with attributes, and a document around it (no browser in the tests). */
const fakeDoc = (attrs: Record<string, string> = {}) => {
  const a = new Map(Object.entries(attrs));
  const meta = new Map<string, string>([["content", "#f5f1e6"]]);
  const root = { getAttribute: (k: string) => a.get(k) ?? null, setAttribute: (k: string, v: string) => void a.set(k, v), removeAttribute: (k: string) => void a.delete(k) };
  const doc = { documentElement: root, querySelector: () => ({ setAttribute: (k: string, v: string) => void meta.set(k, v) }) } as unknown as Document;
  return { a, meta, doc };
};

afterEach(() => vi.unstubAllGlobals());

describe("設定の読み書き（人ごと・この端末だけ）", () => {
  it("人ごとに保存し、別の人は標準のまま。最後に出した見た目も覚える", () => {
    const { data, store } = memory();
    saveAppearance("山本", { theme: "dark", font: "xl" }, store);
    expect(loadAppearance("山本", store)).toEqual({ theme: "dark", font: "xl" });
    expect(loadAppearance("田中", store)).toEqual(DEFAULT_APPEARANCE);
    expect(JSON.parse(data.get(LAST_APPEARANCE_KEY)!)).toEqual({ theme: "dark", font: "xl" });
  });

  it("壊れた値・知らない値・読めない保存先は標準", () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ theme: "neon", font: 3 })).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ theme: "white" })).toEqual({ theme: "white", font: "md" });
    const broken = { getItem: () => "{", setItem: () => {} };
    expect(loadAppearance("山本", broken)).toEqual(DEFAULT_APPEARANCE);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadAppearance("山本", blocked)).toEqual(DEFAULT_APPEARANCE);
    expect(() => saveAppearance("山本", { theme: "dark", font: "md" }, blocked)).not.toThrow();
  });

  it("見た目は紙・白・ダーク・くっきり、字の大きさは小・標準・大・特大（0.9・1・1.12・1.25）", () => {
    expect(THEMES.map((t) => t.label)).toEqual(["紙", "白", "ダーク", "くっきり"]);
    expect(FONT_SIZES.map((f) => f.label)).toEqual(["小", "標準", "大", "特大"]);
    expect(FONT_SIZES.map((f) => fontZoom(f.key))).toEqual([0.9, 1, 1.12, 1.25]);
  });
});

describe("ページに付ける", () => {
  it("紙・標準は属性を外し、ほかは data-theme・data-font を付ける。バーの色も替える", () => {
    const { a, meta, doc } = fakeDoc({ "data-theme": "dark", "data-font": "lg" });
    applyAppearance({ theme: "white", font: "xl" }, doc);
    expect(a.get("data-theme")).toBe("white");
    expect(a.get("data-font")).toBe("xl");
    expect(meta.get("content")).toBe("#f4f4f2");
    applyAppearance(DEFAULT_APPEARANCE, doc);
    expect(a.has("data-theme")).toBe(false);
    expect(a.has("data-font")).toBe(false);
  });

  it("字の大きさが変わると resize を知らせ、ウインドウが画面に収まり直す", () => {
    const events: string[] = [];
    vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e.type) });
    const { doc } = fakeDoc();
    applyAppearance({ theme: "dark", font: "md" }, doc);
    expect(events).toEqual([]);
    applyAppearance({ theme: "dark", font: "lg" }, doc);
    expect(events).toEqual(["resize"]);
  });

  it("最初の描画の前の script：最後の見た目を付け、知らない値と読めない保存先は何もしない", () => {
    const run = (stored: string | null, throws = false) => {
      const { a, doc } = fakeDoc();
      const localStorage = { getItem: (k: string) => { if (throws) throw new Error("blocked"); return k === LAST_APPEARANCE_KEY ? stored : null; } };
      new Function("localStorage", "document", appearanceBootScript())(localStorage, doc);
      return Object.fromEntries(a);
    };
    expect(run(JSON.stringify({ theme: "dark", font: "xl" }))).toEqual({ "data-theme": "dark", "data-font": "xl" });
    expect(run(JSON.stringify({ theme: "paper", font: "md" }))).toEqual({});
    expect(run(JSON.stringify({ theme: "<x>", font: "huge" }))).toEqual({});
    expect(run(null)).toEqual({});
    expect(run("{")).toEqual({});
    expect(run(null, true)).toEqual({});
  });
});

describe("拡大の下の位置の換算", () => {
  it("画面の px をページの CSS px に（標準・サーバーは 1）", () => {
    expect(pageZoom()).toBe(1);
    const { doc } = fakeDoc({ "data-font": "xl" });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { innerWidth: 1440, innerHeight: 900 });
    expect(pageZoom()).toBe(1.25);
    expect(cssPx(250)).toBe(200);
    expect(viewW()).toBe(1152);
    expect(viewH()).toBe(720);
  });
});
