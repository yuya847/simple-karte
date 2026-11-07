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
    expect(html).not.toContain("実施日時"); // an empty pair is not shown
    expect(html).toContain("指示受け日時：11:00　指示受け者：看護師 佐藤");
    expect(html).not.toContain("前の勤務帯"); // no timestamp or receiver is invented
    expect(html).toContain("手技：点滴静注");
    expect(html).toContain("薬品：メトホルミン");
    expect(html).toContain('<b class="nums w-[5.5rem] shrink-0 text-ai">14:00</b>');
    expect(html).toContain("実施した");
    expect(html).toContain("照合なし");
    expect(html).not.toContain("denshi_gx.pdf");
    expect(html).not.toContain("架空の病院の取り決め");
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

describe("実施入力と指示受け with the fictional ward's patients", () => {
  it("render every kind of order in the record without error", async () => {
    const { PATIENTS } = await import("@/lib/patients");
    const { currentEntries } = await import("@/lib/record");
    const { orderChanges } = await import("@/lib/worksheet");
    const { takeRows } = await import("@/lib/order-take");
    const { TakeDesk } = await import("./TakeDesk");
    const people: WorkPatient[] = PATIENTS.map((p, i) => ({ patient: p, room: ["512", "515B", "508A", "511"][i], entries: currentEntries(p).filter((e): e is OrderEntry => e.kind === "order") }));
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <ExecuteDesk {...base} people={people} taken={{}} sessionKeys={new Set()} records={{}} sessionStart={0} />
      </RoleProvider>,
    );
    expect(html).toContain("入院");
    const rows = takeRows(orderChanges(people, -1440 * 30, 730), people, TODAY);
    expect(rows.length).toBeGreaterThan(3);
    const take = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk people={people} rows={rows} taken={{}} isTaken={() => false} holds={{}} confirms={{}} nurses={[]} today={TODAY} nowTime="12:10" onTake={noop} onHold={noop} onConfirm={noop} isMine={() => false} onOpen={noop} onSheet={noop} />
      </RoleProvider>,
    );
    expect(take).toContain("指示開始日時");
  });
});
