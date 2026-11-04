// 公開データの画像の出典：全部に出典のページ・作者・使えるライセンスがあり、ファイルが public/ にあって小さい。
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creditLine, findCredit, IMAGE_CREDITS, PUBLIC_IMAGE_NOTE } from "./image-credits";

const PUBLIC = join(process.cwd(), "public");
const ALLOWED = ["CC0 1.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "パブリックドメイン"];

/** JPEG の幅・高さ（SOF の印から読む）。 */
function jpegSize(buf: Buffer): { width: number; height: number } {
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  let i = 2;
  while (i < buf.length) {
    expect(buf[i]).toBe(0xff);
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("SOF がない");
}

describe("画像の出典", () => {
  const all = Object.values(IMAGE_CREDITS);

  it("20 枚以内で、ID とファイル名が合っている", () => {
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(20);
    for (const c of all) {
      expect(IMAGE_CREDITS[c.id]).toBe(c);
      expect(c.src).toBe(`/images/radiology/${c.id}.jpg`);
    }
  });

  it("全部に Wikimedia Commons のページ・作者・公開ライセンス（NC なし）がある", () => {
    for (const c of all) {
      expect(c.page, c.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(c.title, c.id).toMatch(/^File:/);
      expect(c.author.trim().length, c.id).toBeGreaterThan(0);
      expect(ALLOWED, c.id).toContain(c.license);
      expect(c.license).not.toMatch(/NC/);
      if (c.license.startsWith("CC")) expect(c.licenseUrl, c.id).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(c.what.length, c.id).toBeGreaterThan(0);
    }
  });

  it("ファイルが public/ にあり、1 枚 1 MB 以下・幅 1200px 以下で、幅と高さが記録と合う", () => {
    for (const c of all) {
      const path = join(PUBLIC, c.src);
      expect(statSync(path).size, c.id).toBeLessThanOrEqual(1024 * 1024);
      const size = jpegSize(readFileSync(path));
      expect(size, c.id).toEqual({ width: c.width, height: c.height });
      expect(c.width).toBeLessThanOrEqual(1200);
    }
  });

  it("出典の 1 行と、常に出す注記", () => {
    const c = findCredit("chest-pa-normal")!;
    expect(creditLine(c)).toBe("Wikimedia Commons「File:Normal posteroanterior (PA) chest radiograph (X-ray).jpg」Mikael Häggström, M.D.（CC0 1.0）");
    expect(creditLine(findCredit("chest-chf-film")!)).toContain("加工：");
    expect(PUBLIC_IMAGE_NOTE).toContain("この患者のものではありません");
    expect(findCredit("nothing")).toBeUndefined();
  });
});
