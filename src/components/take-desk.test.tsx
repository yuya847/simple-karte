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
import { TakeOnePanel, TakeTable } from "./TakeTable";

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
const p1: WorkPatient = { patient: { id: "p1", name: "佐倉 修", age: 72, sex: "男" } as never, room: "512", entries: [inj("a")] };
const p2: WorkPatient = { patient: { id: "p2", name: "大浦 トメ", age: 88, sex: "女" } as never, room: "503A", entries: [inj("k", { drug: "INJ-KCL20", time: "11:00" })] };
const ch = (e: OrderEntry, at: number, p: WorkPatient): OrderChange => ({ kind: "新規", at, entry: e, patientId: p.patient.id, room: p.room, name: p.patient.name, key: `${e.id}|新規`, timeKnown: true });
const rows = takeRows([ch(p1.entries[0], 600, p1), ch(p2.entries[0], 660, p2)], [p1, p2], TODAY);
const base = { people: [p1, p2], rows, holds: {}, nurses: ["看護師 佐藤", "看護師 田中"], today: TODAY, nowTime: "12:10", onTake: noop, onHold: noop, onConfirm: noop, onOpen: noop, onSheet: noop };

describe("指示受けの画面", () => {
  it("is a screen of 病棟 for nurses, next to the worksheet", () => {
    expect(wardTabsFor("看護師")).toContain("take");
    expect(wardTabsFor("医師")).not.toContain("take");
    expect(wardTabsFor("医事課")).not.toContain("take");
  });

  it("lists the untaken changes in the catalog's form: the band at the top, a band per patient, each change with its heading, the three 日時／者 pairs and 項目名：値 lines", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={{}} isTaken={() => false} confirms={{}} isMine={(room) => room === "512"} />
      </RoleProvider>,
    );
    // The band at the top: the date, 指示受け済みも表示する, the kinds, the checks and 一括受け.
    expect(html).toContain("今日 11/4（水）");
    expect(html).toContain("前の日");
    expect(html).toContain("次の日");
    expect(html).toContain("指示受け済みも表示する");
    for (const c of ["処置・検査", "注射・輸血", "処方", "看護指示", "食事", "その他"]) expect(html).toContain(c);
    expect(html).toContain("全チェック");
    expect(html).toContain("全チェック解除");
    expect(html).toContain("一括受け");
    expect(html).toContain("未指示受け 2件");
    expect(html).toContain("遅れ 2件"); // both older than 60 minutes
    // The band of a patient: 患者ID・氏名・年齢・性別・部屋.
    expect(html).toContain("患者ID ");
    expect(html).toContain("佐倉 修");
    expect(html).toContain("72歳");
    expect(html).toContain("性別 </span>男");
    expect(html).toContain("部屋 </span>512");
    expect(html).toContain("大浦 トメ");
    expect(html).toContain("受け持ち"); // 512 is this nurse's
    expect(html).toContain("2時間10分"); // 10:00 → 12:10
    // Each change: the check, the heading (kind and the order's date and time), the three pairs, the lines.
    expect(html).toContain("入院注射");
    expect(html).toContain("11/4（水） 10:00");
    expect(html).toContain("指示開始日時");
    expect(html).toContain("指示者");
    expect(html).toContain("実施日時");
    expect(html).toContain("実施者");
    expect(html).toContain("指示受け日時");
    expect(html).toContain("指示受け者");
    expect(html).toContain("11/4（水） 14:00"); // 指示開始
    expect(html).toContain("山本（専攻医）");
    expect(html).toContain("手技</dt><dd class=\"nums\">点滴静注");
    expect(html).toContain("セファメジンα注射用1g");
    expect(html).toContain("用法</dt><dd class=\"nums\">12時間ごと");
    expect(html).toContain("実施場所</dt><dd class=\"nums\">5階東病棟");
    expect(html).toContain('type="checkbox" aria-label="佐倉 修 入院注射 をチェック"');
    expect(html).toContain("高リスク薬（カリウム注）");
    expect(html).toContain("開いて受ける"); // KCl one at a time: its check is disabled
    expect(html).toContain('title="1件ずつ受けます：高リスク薬（カリウム注）"');
    expect(html).toContain("指示を受ける");
    expect(html).toContain("指示票（今日・A4）");
    expect(html).not.toContain("denshi_gx.pdf");
    expect(html).not.toContain("架空の病院の取り決め");
  });

  it("a taken change stays until its schedule is confirmed (with who took it and when); confirmed ones are hidden until 指示受け済みも表示する", () => {
    const taken: Record<string, string> = { "a|新規": "11:00 看護師 佐藤" };
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} confirms={{}} isMine={() => false} />
      </RoleProvider>,
    );
    expect(html).toContain("未指示受け 1件");
    expect(html).toContain("受けたが予定の確認がまだ 1件");
    expect(html).toContain("指示受け日時：</span><span class=\"nums\">11:00");
    expect(html).toContain("看護師 佐藤");
    expect(html).toContain("予定を確認する（まだ）");
    const done = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} confirms={{ "a|新規": "11:05 看護師 佐藤" }} isMine={() => false} />
      </RoleProvider>,
    );
    expect(done).not.toContain("予定を確認する（まだ）");
    expect(done).not.toContain("佐倉 修"); // hidden: 指示受け済み
    expect(done).toContain("大浦 トメ");
    expect(done).toContain("指示受け済みも表示する<span class=\"nums text-ink-faint\">（1件）");
  });

  it("fills 実施日時／実施者 from the 与薬・実施の記録", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={{}} isTaken={() => false} confirms={{}} isMine={() => false} records={{ "a|840": { key: "a|840", orderId: "a", patientId: "p1", at: 840, status: "実施", doneAt: "14:05", by: "看護師 田中", checked: { patient: true, label: true } } }} />
      </RoleProvider>,
    );
    expect(html).toContain("実施日時：</span><span class=\"nums\">14:05");
    expect(html).toContain("看護師 田中");
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
    expect(html).not.toContain("指示受け → 指示確認 → 実施入力");
  });

  it("the worksheet's take table marks a taken row whose schedule was not confirmed, also when printed", () => {
    const taken: Record<string, string> = { "a|新規": "11:00 看護師 佐藤" };
    const printed = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeTable rows={rows} taken={taken} isTaken={(r) => r.keys.every((k) => !!taken[k])} holds={{}} interactive={false} day={0} today={TODAY} nurses={[]} onTake={noop} onHold={noop} confirm={{ confirms: {}, onConfirm: noop, people: [p1, p2], nowAbs: 730 }} />
      </RoleProvider>,
    );
    expect(printed).toContain("確認がまだ □");
    expect(printed).toContain("□ まだ");
  });

  it("the doctor sees each change's status and can print the 指示票; the slip carries 指示受け and 指示確認", () => {
    const taken: Record<string, string> = { "a|新規": "11:00 看護師 佐藤" };
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
    expect(slip).toContain("セファメジンα注射用1g");
    expect(slip).toContain("11:00 看護師 佐藤");
    expect(slip).toContain("11:05 看護師 佐藤");
    expect(slip).not.toContain("架空の患者");
    expect(slip).not.toContain("大浦");
  });
});

describe("1件ずつ受けるものは2段階（開いて中身を見てから「この指示を受ける」）", () => {
  const kcl = rows.find((r) => r.patientId === "p2")!;
  it("the screen offers 「開いて受ける」 for a one-at-a-time row and nothing that takes it in one click; no green band before anything was done", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={{}} isTaken={() => false} confirms={{}} isMine={() => false} />
      </RoleProvider>,
    );
    expect(kcl.mustOne.length).toBeGreaterThan(0);
    expect(html).toContain(">開いて受ける<");
    expect(html).not.toContain(">この指示を受ける<");
    expect(html).not.toContain("受ける前に見る指示の内容");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("受けました（");
  });
  it("opened, the panel shows the contents (what, how much, when, who, why one at a time) and 「この指示を受ける」 stays disabled until the nurse ticks that she looked", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeOnePanel row={kcl} nurses={base.nurses} today={TODAY} onTake={noop} onClose={noop} />
      </RoleProvider>,
    );
    expect(html).toContain("1件ずつ受ける理由：高リスク薬（カリウム注）");
    expect(html).toContain('aria-label="受ける前に見る指示の内容"');
    expect(html).toContain("KCL注"); // the drug
    expect(html).toContain("量・方法");
    expect(html).toContain("指示の時刻</dt><dd>11/4（水） 11:00");
    expect(html).toContain("指示した人</dt><dd>山本（専攻医）");
    expect(html).toContain("高リスク薬</dt>");
    expect(html).toContain("2人目の確認者");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>この指示を受ける<\/button>/);
  });
  it("the hint tells the two steps", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="看護師">
        <TakeDesk {...base} taken={{}} isTaken={() => false} confirms={{}} isMine={() => false} />
      </RoleProvider>,
    );
    expect(html).not.toContain("「開いて受ける」で中身（薬・量・時刻・至急の理由）を広げて見てから「この指示を受ける」を押します");
  });
});

describe("指示受けの引き出し（右端ツール「看護」）の中の、医師向けの状態の表", () => {
  it("inDrawer: always open, without the chart's side margins; above the note it was closed unless something was urgent", () => {
    const taken: Record<string, string> = { "a|新規": "11:00 看護師 佐藤" };
    const ctx = { taken, isTaken: (r: { keys: string[] }) => r.keys.every((k) => !!taken[k]), holds: {}, confirms: {} };
    const inDrawer = renderToStaticMarkup(<TakeStatus inDrawer rows={rows} {...ctx} nowAbs={730} onAnswer={noop} />);
    expect(inDrawer).toMatch(/<details data-take-status="true" open="" class="mb-3 /);
    expect(inDrawer).not.toContain("mx-4");
    expect(inDrawer).toContain("まだ 1件");
    const strip = renderToStaticMarkup(<TakeStatus rows={rows} {...ctx} nowAbs={730} onAnswer={noop} />);
    expect(strip).toMatch(/<details data-take-status="true" class="mx-4 /);
  });
});
