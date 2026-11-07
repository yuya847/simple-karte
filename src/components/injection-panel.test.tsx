import { helpSections } from "@/lib/help";
// The injection tab's Rp renders on the server: big chips for 経路・回数 (the chosen one 藍 with white letters),
// visible headings for 開始・日数・コメント, and the reason a 「決める」 button is off written next to it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InjectionOrder } from "@/lib/types";
import { TAB_CHOICE_LG } from "./TabChoice";
import { AddInjectionPanel } from "./panels/AddPanels";
import { DRUGS } from "@/lib/master";

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
    expect(group(html, "Rp1 の回数")).toContain("</span>1日1回<");
    expect(group(html, "Rp1 の回数")).toContain("</span>1回だけ<");
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
    expect(html).not.toContain("コメントの欄で Enter でも決められます");
    expect(JSON.stringify(helpSections)).toContain("コメントの欄で Enter でも決められます");
  });

  it("an incomplete Rp: the missing things are written next to the button (not only in the title)", () => {
    // every 5 hours is not among the chips: 回数 stays unchosen.
    const odd = render({ ...ctrx, schedule: { kind: "every_hours", hours: 5 } });
    expect(odd).toMatch(/<button type="button" disabled=""[^>]*title="回数を選ぶと決められます"[^>]*>Rp1 を決める<\/button><span class="text-\[12px\] text-yamabuki">回数を選ぶと決められます<\/span>/);
    expect(odd).not.toContain("あと：");
  });
});

describe("注射の罫線入力の表示", () => {
  it("薬の量の段でも経路以降の全欄を表示し、混注は明示的に足す", () => {
    const html = render(ctrx);
    expect(html).toMatch(/data-step="drug" hidden="" style="display:none"/);
    for (const step of ["route", "schedule", "times", "duration", "start", "days"]) {
      expect(html).toContain(`data-step="${step}" data-active=`);
      expect(html).not.toMatch(new RegExp(`data-step="${step}" hidden=`));
    }
    expect(html).toContain("＋混注");
    expect(html).not.toContain("Shift+Enter");
    expect(JSON.stringify(helpSections)).toContain("Shift+Enter");
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

it("新規の注射に区分があり、既定の開始をカレンダー由来と表示しない", () => {
  for (const patientId of ["er:er-3", "90010231"]) {
    const html = renderToStaticMarkup(<AddInjectionPanel patientId={patientId} onAdd={() => {}} newId={() => "d"} drafts={[]} />);
    expect(group(html, "注射の区分")).toMatch(/aria-checked="true"[^>]*>定期<\/button>/);
    expect(html).not.toContain("（カレンダーから。");
  }
});
it("輸液も1回だけを選べる", () => {
  const html = render({ ...ctrx, items: [{ drugCode: "INJ-SOL3A500", amount: 1, unit: "本" }], schedule: { kind: "once" } });
  expect(group(html, "Rp1 の回数")).toMatch(/aria-checked="true"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?1回だけ<\/button>/); // 番号付きの選択肢（1 1回だけ）
});

describe("注射の持続（ポンプ、mL/時）", () => {
  const nor = DRUGS.find((d) => d.name.normalize("NFKC").includes("ノルアドレナリン注射液"))!.code, saline = DRUGS.find((d) => d.name.normalize("NFKC").includes("大塚生食注 50mL"))!.code;
  const order: InjectionOrder = { type: "injection", items: [{ drugCode: nor, amount: 5, unit: "A" }, { drugCode: saline, amount: 45, unit: "mL" }], route: "点滴静注", schedule: { kind: "once" }, start: { day: 0 }, rateMlPerH: 3, continuous: { infusionId: "inf1" } };
  it("経路の「持続」は持続の注射オーダから戻り、速さの横に体重と濃度からの γ を式とともに出す（体重がなければ出さない）", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} weightKg={50} seed={{ key: "s1", order, start: { day: 0, time: "10:00" } }} />);
    expect(html).toMatch(/aria-checked="true"[^>]*>(<[^>]+>)*6(<[^>]+>)*\s*持続/);
    expect(html).toContain("3mL/時 × 5mg/50mL × 1000 ÷（50kg × 60）= 0.10μg/kg/分");
    expect(renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} seed={{ key: "s1", order, start: { day: 0, time: "10:00" } }} />)).not.toContain("μg/kg/分");
  });
});
