// 未実施の一覧 renders (on the server, without a browser) with the rows it is given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clockText } from "@/lib/drip-course";
import { wardTabsFor } from "@/lib/nav";
import type { GapRow, UndoneRow } from "@/lib/undone";
import { UndoneView } from "./UndoneView";

const row: UndoneRow = { patientId: "p1", room: "503A", name: "佐倉 修", orderId: "o1", kind: "注射", main: "セファゾリン 1g", detail: "点滴静注　12時間ごと", at: 8 * 60, lateMin: 125 };
const gap: GapRow = { kind: "実施したが算定に入らない", patientId: "p2", room: "508", name: "大浦 トメ", orderId: "o2", main: "喀痰吸引", at: 10 * 60, by: "看護師 佐藤", why: "喀痰吸引（1日につき）。必要時の処置は、指示に残した実施の時刻から算定を数えます" };

describe("未実施の一覧", () => {
  it("is a screen of 病棟 for nurses and 医事課", () => {
    expect(wardTabsFor("看護師")).toContain("undone");
    expect(wardTabsFor("医事課")).toContain("undone");
    expect(wardTabsFor("医師")).not.toContain("undone");
  });

  it("shows each item past its time with how late it is, and the records the claim reads differently", () => {
    const html = renderToStaticMarkup(<UndoneView rows={[row]} gaps={[gap]} clock={clockText} forBilling={false} onOpen={() => {}} onSheet={() => {}} />);
    expect(html).toContain("実施の記録がないもの（実施漏れ）");
    expect(html).toContain("08:00");
    expect(html).toContain("セファゾリン 1g");
    expect(html).toContain("2時間5分");
    expect(html).toContain("ワークシートで記録する");
    expect(html).toContain("算定漏れの候補");
    expect(html).toContain("実施したが算定に入らない");
    expect(html).toContain("未実施患者一覧");
  });

  it("tells 医事課 that unrecorded items are in the claim, and opens the claim", () => {
    const html = renderToStaticMarkup(<UndoneView rows={[row]} gaps={[gap]} clock={clockText} forBilling onOpen={() => {}} onBilling={() => {}} />);
    expect(html).toContain("記録のないまま算定に入っています");
    expect(html).toContain("算定を開く");
  });

  it("says so when there is nothing", () => {
    const html = renderToStaticMarkup(<UndoneView rows={[]} gaps={[]} clock={clockText} forBilling={false} onOpen={() => {}} />);
    expect(html).toContain("記録がないまま時刻を過ぎたものはありません");
    expect(html).toContain("食い違いはありません");
  });
});
