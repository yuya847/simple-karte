// The injection tab's Rp renders on the server: big chips for 経路・回数 (the chosen one 藍 with white letters),
// visible headings for 開始・日数・コメント, and the reason a 「決める」 button is off written next to it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InjectionOrder } from "@/lib/types";
import { TAB_CHOICE_LG } from "./TabChoice";
import { AddInjectionPanel } from "./panels/AddPanels";

const ctrx: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, minutesPerDose: 60, start: { day: 0, time: "10:00" }, days: 5 };
const render = (order: InjectionOrder) => renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} seed={{ key: "s1", order, start: { day: 0, time: "10:00" } }} />);
const group = (html: string, label: string) => html.match(new RegExp(`<div role="radiogroup" aria-label="${label}"[^>]*>(.*?)</div>`))![1];

describe("注射の Rp：チップと見出し", () => {
  const html = render(ctrx);

  it("the 経路 and 回数 chips are 30px and up with room on the sides; the chosen one is 藍 with white letters", () => {
    expect(TAB_CHOICE_LG).toContain("min-h-[30px]");
    for (const label of ["Rp1 の経路", "Rp1 の回数", "Rp1 の開始日"]) {
      const chips = group(html, label).match(/<button[^>]*role="radio"[^>]*>/g)!;
      expect(chips.length, label).toBeGreaterThan(1);
      for (const c of chips) {
        expect(c, label).toContain("min-h-[30px]");
        expect(c, label).toContain("px-3");
      }
      const on = chips.filter((c) => c.includes('aria-checked="true"'));
      expect(on.length, label).toBe(1);
      expect(on[0], label).toContain("bg-ai font-bold text-white");
    }
    expect(group(html, "Rp1 の回数")).toContain(">1日1回<");
    expect(group(html, "Rp1 の回数")).toContain(">1回だけ<");
  });

  it("開始・日数・コメント have a visible heading (label) tied to the field; the days field has the unit 日間", () => {
    for (const [name, aria] of [
      ["開始", "Rp1 の開始時刻"],
      ["日数", "Rp1 の日数"],
      ["コメント", "Rp1 のコメント"],
    ]) {
      const m = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${name}</label>`));
      expect(m, name).toBeTruthy();
      expect(html, name).toMatch(new RegExp(`<input id="${m![1].replace(/[«»:]/g, (c) => c)}"[^>]*aria-label="${aria}"`));
    }
    expect(html).toMatch(/aria-label="Rp1 の日数"[^>]*value="5"\/><span>日間<\/span>/);
  });

  it("a complete Rp: the button is on and the Enter hint shows", () => {
    expect(html).toMatch(/<button type="button"[^>]*title="選んだ結果だけを1行で出し[^"]*"[^>]*>Rp1 を決める<\/button>/);
    expect(html).toContain("コメントの欄で Enter でも決められます");
  });

  it("an incomplete Rp: the missing things are written next to the button (not only in the title)", () => {
    // every 5 hours is not among the chips: 回数 stays unchosen.
    const odd = render({ ...ctrx, schedule: { kind: "every_hours", hours: 5 } });
    expect(odd).toMatch(/<button type="button" disabled=""[^>]*title="回数を選ぶと決められます"[^>]*>Rp1 を決める<\/button><span class="text-\[12px\] text-yamabuki">回数を選ぶと決められます<\/span>/);
    expect(odd).not.toContain("あと：");
  });
});

describe("注射の罫線入力の表示", () => {
  it("薬の量の段では混注検索・経路以降の段を閉じ、混注は明示的に足す", () => {
    const html = render(ctrx);
    for (const step of ["drug", "route", "schedule", "times", "duration", "start", "days"]) {
      expect(html).toMatch(new RegExp(`data-step="${step}" hidden="" style="display:none"`));
    }
    expect(html).toContain("＋混注");
    expect(html).toContain("Shift+Enter");
    expect(html).toContain("実施済み");
    expect(html).toContain("1回の時間");
  });
  it("新規入力では Rp1 の薬から始まり、日数の初期値は1", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} />);
    expect(html).toContain("Rp1 に薬を入れる");
    expect(html).not.toContain("Rp2 に薬を入れる");
    expect(html).not.toContain("に混注する薬を足す");
  });
});
