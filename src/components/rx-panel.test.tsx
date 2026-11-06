import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddRxPanel } from "./panels/AddPanels";
import type { RxPattern } from "@/lib/rx-memory";

describe("内服の罫線入力", () => {
  it("最初はRp1の薬名だけ。区分は処方全体で一つ", () => {
    const html = renderToStaticMarkup(<AddRxPanel ward="5階東" onAdd={() => {}} newId={() => "rx1"} />);
    expect(html).toContain('data-rp="0"');
    expect(html).not.toContain('data-rp="1"');
    expect(html.match(/role="combobox"/g)).toHaveLength(1);
    expect(html.match(/aria-label="処方全体の区分"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Rp1 の回数"');
    expect(html).toContain("この病棟の定期処方日：火曜");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).not.toContain("＋コメント");
    expect(html).toContain('title="コメント"');
  });
  it("記憶した処方を直せて、退院時の区分も引き継ぐ", () => {
    const pattern: RxPattern = { key: "apap", count: 1, lastDay: 0, patients: 1, rows: [{ drugCode: "ORAL-APAP500", per: 0.5 }], times: 3, timing: "毎食後", days: 7, category: "退院時" };
    const html = renderToStaticMarkup(<AddRxPanel ward="5階西" onAdd={() => {}} newId={() => "rx1"} seed={{ key: "seed", pattern }} />);
    expect(html).toContain("アセトアミノフェン錠");
    expect(html).toContain('value="0.5"');
    expect(html).toMatch(/aria-checked="true"[^>]*>退院時/);
    expect(html).toContain("＋同じ飲み方の薬");
    expect(html).toContain("一包化");
    expect(html).not.toContain("この病棟の定期処方日");
  });
});
