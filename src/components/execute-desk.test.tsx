// 実施入力: the day's scheduled items in the catalog's form, with 「実施した」 and the record it writes.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wardTabsFor } from "@/lib/nav";
import type { OrderEntry } from "@/lib/types";
import type { WorkPatient } from "@/lib/worksheet";
import { ExecuteDesk } from "./ExecuteDesk";
import { RoleProvider } from "./RoleContext";

const TODAY = { y: 2026, m: 11, d: 4 };
const noop = () => {};
const inj: OrderEntry = {
  kind: "order",
  id: "a",
  day: 0,
  time: "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: 0, time: "14:00" }, minutesPerDose: 30 },
};
const rx: OrderEntry = { kind: "order", id: "b", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "朝" } } };
const p1: WorkPatient = { patient: { id: "p1", name: "佐倉 修", age: 72, sex: "男" } as never, room: "512", entries: [inj, rx] };
const base = { people: [p1], today: TODAY, nowTime: "12:10", sessionStart: 600, onRecord: noop, taken: { "a|新規": "11:00 看護師 佐藤" }, sessionKeys: new Set(["a|新規"]), nurses: ["看護師 佐藤", "看護師 田中"], onOpen: noop, onSheet: noop, onTakeDesk: noop };

describe("実施入力の画面", () => {
  it("is a screen of 病棟 for nurses, next to the worksheet", () => {
    expect(wardTabsFor("看護師")).toContain("execute");
    expect(wardTabsFor("医師")).not.toContain("execute");
  });

  it("lists today's scheduled items per patient in the catalog's form with 実施した", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <ExecuteDesk {...base} records={{}} />
      </RoleProvider>,
    );
    expect(html).toContain("今日 11/4（水）");
    expect(html).toContain("実施済みも表示する");
    expect(html).toContain("一括実施");
    expect(html).toContain("全チェック");
    expect(html).toContain("患者ID ");
    expect(html).toContain("佐倉 修");
    expect(html).toContain("72歳");
    // The injection at 14:00 and the evening dose at 18:00 (the morning 08:00 was before the session: hidden as 記録済み).
    expect(html).toContain("入院注射");
    expect(html).toContain("予定 11/4（水） 14:00");
    expect(html).toContain("入院内服");
    expect(html).toContain("予定 11/4（水） 18:00");
    expect(html).not.toContain("予定 11/4（水） 08:00");
    expect(html).toContain("実施済みも表示する<span class=\"nums text-ink-faint\">（1件）");
    expect(html).toContain("実施がまだ 2件");
    expect(html).toContain("指示開始日時");
    expect(html).toContain("実施日時");
    expect(html).toContain("指示受け日時：</span><span class=\"nums\">11:00");
    expect(html).toContain("前の勤務帯（架空）"); // the prescription was taken before this session
    expect(html).toContain("手技</dt><dd class=\"nums\">点滴静注");
    expect(html).toContain("薬品</dt><dd class=\"nums\">メトホルミン");
    expect(html).toContain("実施した");
    expect(html).toContain("照合なし");
    expect(html).toContain("denshi_gx.pdf");
    expect(html).toContain("架空の病院の取り決め");
  });

  it("a recorded item shows 実施 with the time and who, and leaves the list until 実施済みも表示する", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <ExecuteDesk {...base} records={{ "a|840": { key: "a|840", orderId: "a", patientId: "p1", at: 840, status: "実施", doneAt: "14:05", by: "看護師 田中", checked: { patient: false, label: null }, note: "実施入力の画面から" } }} />
      </RoleProvider>,
    );
    expect(html).toContain("実施がまだ 1件");
    expect(html).not.toContain("予定 11/4（水） 14:00");
    expect(html).toContain("実施済みも表示する<span class=\"nums text-ink-faint\">（2件）");
  });
});
