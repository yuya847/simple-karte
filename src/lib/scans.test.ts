import { describe, expect, it } from "vitest";
import { dataUrlBlob, fileProblem, fitProblem, fitSize, formProblem, SCAN_LIMITS, SHRINK_STEPS, totalKept, validScans, withdraw, type ScanDoc } from "./scans";

const scan = (bytes: number, extra: Partial<ScanDoc> = {}): ScanDoc => ({
  id: `s${bytes}`,
  patientId: "p1",
  type: "紹介状（他院から）",
  docDate: "2026-11-01",
  note: "",
  by: "医事課 渡辺",
  role: "医事課",
  at: { day: 0, time: "10:00" },
  mime: "image/jpeg",
  dataUrl: `data:image/jpeg;base64,${"A".repeat(Math.max(0, bytes - 23))}`,
  bytes,
  original: { name: "見本.jpg", type: "image/jpeg", bytes: bytes * 3 },
  sample: true,
  ...extra,
});

describe("スキャン取込", () => {
  it("makes images smaller to fit the long side, never larger", () => {
    expect(fitSize(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(1000, 3000, 1600)).toEqual({ w: 533, h: 1600 });
    expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(SHRINK_STEPS.map((s) => s.maxSide)).toEqual([...SHRINK_STEPS.map((s) => s.maxSide)].sort((a, b) => b - a));
  });

  it("takes images and small PDFs, and says why not otherwise", () => {
    expect(fileProblem({ type: "image/jpeg", size: 3_000_000, name: "a.jpg" })).toBeNull();
    expect(fileProblem({ type: "", size: 100, name: "IMG_0001.HEIC" })).toBeNull();
    expect(fileProblem({ type: "application/pdf", size: 200_000, name: "a.pdf" })).toBeNull();
    expect(fileProblem({ type: "application/pdf", size: 900_000, name: "a.pdf" })).toMatch(/PDF はそのまま/);
    expect(fileProblem({ type: "text/plain", size: 10, name: "a.txt" })).toMatch(/画像/);
    expect(fileProblem({ type: "image/png", size: SCAN_LIMITS.original + 1, name: "a.png" })).toMatch(/大きすぎ/);
  });

  it("keeps each file and all of the day's files under their limits", () => {
    expect(fitProblem(SCAN_LIMITS.perFile + 1, [])).toMatch(/1件の上限/);
    const many = [scan(390_000, { id: "a" }), scan(390_000, { id: "b" }), scan(390_000, { id: "c" })];
    expect(totalKept(many)).toBe(1_170_000);
    expect(fitProblem(300_000, many)).toBeNull();
    expect(fitProblem(390_000, many)).toMatch(/合計の上限/);
    // A withdrawn scan keeps nothing, so there is room again.
    const freed = [withdraw(many[0], "医事課 渡辺", { day: 0, time: "11:00" }, "別の患者の紙だった"), many[1], many[2]];
    expect(totalKept(freed)).toBe(780_000);
    expect(freed[0].withdrawn?.reason).toBe("別の患者の紙だった");
    expect(freed[0].dataUrl).toBe("");
    expect(fitProblem(390_000, freed)).toBeNull();
  });

  it("asks for the type and the document's date", () => {
    expect(formProblem({ type: "", docDate: "2026-11-01" })).toMatch(/種類/);
    expect(formProblem({ type: "同意書", docDate: "" })).toMatch(/日付/);
    expect(formProblem({ type: "同意書", docDate: "2026-11-01" })).toBeNull();
  });

  it("reads back only what fits, and turns a kept file into bytes to open", () => {
    const ok = scan(1000);
    const bad = { ...scan(1000), dataUrl: "javascript:alert(1)" };
    expect(validScans([ok, bad, { id: 1 }, "x"]).map((s) => s.id)).toEqual([ok.id]);
    expect(validScans(null)).toEqual([]);
    const blob = dataUrlBlob("data:application/pdf;base64,JVBERi0=")!;
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(5);
    expect(dataUrlBlob("nope")).toBeNull();
  });
});
