import { describe, expect, it } from "vitest";
import { qrMatrix, qrPath } from "./qr";

// Format information: 15 bits around the top-left finder, BCH(15,5) with the mask 0x5412.
function formatOf(m: boolean[][]): { level: number; mask: number } {
  let bits = 0;
  const at = (x: number, y: number) => (m[y][x] ? 1 : 0);
  const order: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  order.forEach(([x, y], i) => (bits |= at(x, y) << i));
  const v = (bits ^ 0x5412) >>> 10;
  return { level: v >>> 3, mask: v & 7 };
}

describe("QR コード", () => {
  it("短い文は 21×21（バージョン1）、URL は大きいバージョン", () => {
    expect(qrMatrix("HELLO").length).toBe(21);
    const url = `https://simple-karte.vercel.app/patient#t=${"A".repeat(170)}`;
    expect(qrMatrix(url).length).toBeGreaterThan(41);
  });

  it("3つの位置検出パターンと誤り訂正 M・選んだマスクの形式情報", () => {
    const m = qrMatrix("https://example.test/patient#t=abc", 5);
    const n = m.length;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[y0][x0 + i]).toBe(true);
        expect(m[y0 + 6][x0 + i]).toBe(true);
      }
      expect(m[y0 + 1][x0 + 1]).toBe(false);
      expect(m[y0 + 3][x0 + 3]).toBe(true);
    }
    expect(formatOf(m)).toEqual({ level: 0, mask: 5 });
    expect(m[n - 8][8]).toBe(true);
  });

  it("SVG の枠は周りに4モジュールの余白", () => {
    const p = qrPath(qrMatrix("x"));
    expect(p.size).toBe(29);
    expect(p.d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });

  it("入りきらない長さは断る", () => {
    expect(() => qrMatrix("x".repeat(700))).toThrow();
  });
});
