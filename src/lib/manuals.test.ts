import { describe, expect, it } from "vitest";
import { CHAPTERS, MANUALS, byChapter, revisedLabel, searchManuals } from "./manuals";

describe("manuals", () => {
  it("every manual has a chapter, 4 to 8 steps, a fictional 版 and 改訂日, and a public source with a URL", () => {
    expect(MANUALS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(MANUALS.map((m) => m.id)).size).toBe(MANUALS.length);
    for (const m of MANUALS) {
      expect(CHAPTERS).toContain(m.chapter);
      expect(m.steps.length).toBeGreaterThanOrEqual(4);
      expect(m.steps.length).toBeLessThanOrEqual(8);
      expect(m.version).toMatch(/^第\d+版$/);
      expect(m.sources.length).toBeGreaterThanOrEqual(1);
      for (const s of m.sources) {
        expect(s.url).toMatch(/^https:\/\//);
        expect(s.title && s.issuer && s.year).toBeTruthy();
      }
      // No step decides for the doctor or says that something works.
      for (const s of m.steps) expect(s).not.toMatch(/効きます/);
    }
    // Every chapter of the hospital has at least one manual.
    expect(byChapter(searchManuals(MANUALS, "")).map((g) => g.chapter)).toEqual(CHAPTERS);
  });

  it("finds manuals by title, or by a step typed in hiragana for katakana", () => {
    const hit = searchManuals(MANUALS, "輸血");
    expect(hit.map((h) => h.manual.id)).toContain("m-transfusion");
    expect(hit.find((h) => h.manual.id === "m-transfusion")!.head).toBe(true);

    const gown = searchManuals(MANUALS, "がうん");
    const contact = gown.find((h) => h.manual.id === "m-contact")!;
    expect(contact.head).toBe(false);
    expect(contact.steps.length).toBeGreaterThan(0);
    expect(contact.steps.every((i) => MANUALS.find((m) => m.id === "m-contact")!.steps[i].includes("ガウン"))).toBe(true);

    expect(searchManuals(MANUALS, "ぞうきん")).toEqual([]);
  });

  it("groups by chapter in the hospital's order", () => {
    const groups = byChapter(searchManuals(MANUALS, "手指衛生"));
    expect(groups.map((g) => g.chapter)).toEqual(["感染対策"]);
    expect(revisedLabel({ y: 2026, m: 4, d: 1 })).toBe("2026年4月1日");
  });
});
