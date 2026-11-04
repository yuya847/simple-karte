// The ward's 指示受け screen, the 指示確認 panel under a taken row, the doctor's status strip and the printed 指示票
// render on the server (without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wardTabsFor } from "@/lib/nav";
import { confirmPlan, slipLines } from "@/lib/order-confirm";
import { takeRows } from "@/lib/order-take";
import type { OrderEntry } from "@/lib/types";
import type { OrderChange, WorkPatient } from "@/lib/worksheet";
import { OrderSlipPrint } from "./OrderSlipPrint";
import { RoleProvider } from "./RoleContext";
import { TakeConfirm } from "./TakeConfirm";
import { TakeDesk } from "./TakeDesk";
import { TakeStatus } from "./TakeStatus";
import { TakeTable } from "./TakeTable";

const TODAY = { y: 2026, m: 11, d: 4 };
const noop = () => {};
const inj = (id: string, x: Partial<{ drug: string; time: string }> = {}): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: x.time ?? "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: x.drug ?? "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: 0, time: "14:00" }, minutesPerDose: 30 },
});
const p1: WorkPatient = { patient: { id: "p1", name: "佐倉 修" } as never, room: "512", entries: [inj("a")] };
const p2: WorkPatient = { patient: { id: "p2", name: "大浦 トメ" } as never, room: "503A", entries: [inj("k", { drug: "INJ-KCL20", time: "11:00" })] };
const ch = (e: OrderEntry, at: number, p: WorkPatient): OrderChange => ({ kind: "新規", at, entry: e, patientId: p.patient.id, room: p.room, name: p.patient.name, key: `${e.id}|新規`, timeKnown: true });
const rows = takeRows([ch(p1.entries[0], 600, p1), ch(p2.entries[0], 660, p2)], [p1, p2], TODAY);
const base = { people: [p1, p2], rows, holds: {}, nurses: ["看護師 佐藤", "看護師 田中"], today: TODAY, nowTime: "12:10", onTake: noop, onHold: noop, onConfirm: noop, onOpen: noop, onSheet: noop };

describe("指示受けの画面", () => {
  it("is a screen of 病棟 for nurses, next to the worksheet", () => {
    expect(wardTabsFor("看護師")).toContain("take");
    expect(wardTabsFor("医師")).not.toContain("take");
    expect(wardTabsFor("医事課")).not.toContain("take");
  });

  it("lists the untaken changes by patient with the elapsed time, the late ones and the one-at-a-time rules", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={{}} isTaken={() => false} confirms={{}} isMine={(room) => room === "512"} />
      </RoleProvider>,
    );
    expect(html).toContain("未指示受け 2件");
    expect(html).toContain("512　佐倉 修");
    expect(html).toContain("503A　大浦 トメ");
    expect(html).toContain("受け持ち"); // 512 is this nurse's
    expect(html).toContain("2時間10分"); // 10:00 → 12:10
    expect(html).toContain("遅れ 2件"); // both older than 60 minutes
    expect(html).toContain("高リスク薬（カリウム注）");
    expect(html).toContain("開いて受ける"); // KCl one at a time
    expect(html).toContain("指示を受ける");
    expect(html).toContain("まとめて受ける（1件・1件ずつのもの 1件は除く）");
    expect(html).toContain("指示票（今日・A4）");
    expect(html).toContain("この端末で今日受けた指示はまだありません");
    expect(html).toContain("denshi_gx.pdf");
    expect(html).toContain("架空の病院の取り決め");
  });

  it("moves taken changes to 今日の指示受け済み with who and when, and asks for 指示確認 until the schedule is looked at", () => {
    const taken = { "a|新規": "11:00 看護師 佐藤" };
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} confirms={{}} isMine={() => false} />
      </RoleProvider>,
    );
    expect(html).toContain("未指示受け 1件");
    expect(html).toContain("今日の指示受け済み　1件（予定の確認がまだ 1件）");
    expect(html).toContain("11:00 看護師 佐藤");
    expect(html).toContain("予定を確認する（まだ）");
    const done = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} confirms={{ "a|新規": "11:05 看護師 佐藤" }} isMine={() => false} />
      </RoleProvider>,
    );
    expect(done).toContain("確認 11:05 看護師 佐藤");
    expect(done).not.toContain("予定を確認する（まだ）");
  });

  it("the 指示確認 panel shows the doses of today and tomorrow and the confirm button", () => {
    const row = rows.find((r) => r.key === "a|新規")!;
    const html = renderToStaticMarkup(<TakeConfirm row={row} plan={confirmPlan(row, [p1], TODAY, 630)} today={TODAY} interactive onConfirm={noop} onClose={noop} />);
    expect(html).toContain("指示確認：新規");
    expect(html).toContain("今日 11/4（水）");
    expect(html).toContain("明日 11/5（木）");
    expect(html).toContain("14:00");
    expect(html).toContain("02:00");
    expect(html).toContain("予定を確認した");
    expect(html).toContain("指示受け → 指示確認 → 実施入力");
  });

  it("the worksheet's take table marks a taken row whose schedule was not confirmed, also when printed", () => {
    const taken = { "a|新規": "11:00 看護師 佐藤" };
    const printed = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeTable rows={rows} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} holds={{}} interactive={false} day={0} today={TODAY} nurses={[]} onTake={noop} onHold={noop} confirm={{ confirms: {}, onConfirm: noop, people: [p1, p2], nowAbs: 730 }} />
      </RoleProvider>,
    );
    expect(printed).toContain("確認がまだ □");
    expect(printed).toContain("□ まだ");
  });

  it("the doctor sees each change's status and can print the 指示票; the slip carries 指示受け and 指示確認", () => {
    const taken = { "a|新規": "11:00 看護師 佐藤" };
    const ctx = { taken, isTaken: (r: { keys: string[] }) => r.keys.every((k) => !!taken[k]), holds: {}, confirms: { "a|新規": "11:05 看護師 佐藤" } };
    const strip = renderToStaticMarkup(<TakeStatus rows={rows} {...ctx} nowAbs={730} onAnswer={noop} slip={{ patient: { id: "p1", name: "佐倉 修", room: "512" }, today: TODAY, nowTime: "12:10", by: "山本（専攻医）" }} />);
    expect(strip).toContain("まだ 1件");
    expect(strip).toContain("予定の確認済み 1件");
    expect(strip).toContain("確認済み 11:05 看護師 佐藤");
    expect(strip).toContain("未指示受け");
    expect(strip).toContain("指示票を印刷（今日・A4）");
    const slip = renderToStaticMarkup(<OrderSlipPrint ward="5階東病棟" patient={{ id: "p1", name: "佐倉 修", room: "512" }} day={0} today={TODAY} nowTime="12:10" by="山本（専攻医）" lines={slipLines(rows, "p1", 0, ctx)} />);
    expect(slip).toContain("指示票");
    expect(slip).toContain("11/4（水） の指示");
    expect(slip).toContain("セファゾリン");
    expect(slip).toContain("11:00 看護師 佐藤");
    expect(slip).toContain("11:05 看護師 佐藤");
    expect(slip).toContain("架空の患者");
    expect(slip).not.toContain("大浦");
  });
});
