// 実施・未実施 from the order: the menu's items by state and by role, the small mark on the order row, and the
// calendars' dose cells that take a right click (server render).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { marKey, type AdminRecord } from "@/lib/mar";
import { MENU_NOTE, executionBadge, occurrenceStates, occurrencesOn } from "@/lib/order-execute";
import { PATIENTS } from "@/lib/patients";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry, Patient } from "@/lib/types";
import { Copy } from "lucide-react";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "./Calendars";
import { ExecuteMenuBody, type ExecuteProps } from "./ExecuteMenu";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );
const patient = { id: "p1", name: "佐倉 修", room: "512", age: 72, sex: "男" } as never as Patient;
const inj: OrderEntry = {
  kind: "order",
  id: "inj",
  day: -1,
  time: "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: -1, time: "08:00" }, minutesPerDose: 30 },
};
const lab: OrderEntry = { kind: "order", id: "lab", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "lab", codes: ["CBC"], collect: { day: 0, time: "09:00" }, priority: "定時" } };
const noon = 12 * 60;
const done: AdminRecord = { key: marKey("inj", 480), orderId: "inj", patientId: "p1", at: 480, status: "実施", doneAt: "08:05", by: "看護師 佐藤", checked: { patient: true, label: true } };
const exec = (records: Record<string, AdminRecord> = {}): ExecuteProps => ({ records, sessionStart: 420, nowTime: "12:00", onRecord: () => {}, onVoid: () => {} });
const occs = (e: OrderEntry, records: Record<string, AdminRecord> = {}, day = 0) => occurrenceStates(occurrencesOn(patient, e, day, noon).timed, records, 420, noon);

describe("実施・未実施のメニュー", () => {
  it("今日の回が1回なら、その回の3つの選択肢（いま・時刻を選ぶ・未実施）と、照合なしの注記", () => {
    const html = as("看護師", <ExecuteMenuBody title="CEZ" occurrences={occs(lab)} day={0} execute={exec()} onDone={() => {}} />);
    expect(html).toContain("09:00</span> の回");
    expect(html).toContain("未入力");
    expect(html).toContain("実施した（いま 12:00）");
    expect(html).toContain("看護師 佐藤 が実施したとして記録");
    expect(html).toContain("実施した（時刻を選ぶ）…");
    expect(html).toContain("未実施（理由を選ぶ）…");
    expect(html).toContain(MENU_NOTE);
    expect(html).toContain('class="hint');
  });
  it("複数の回は時刻の一覧から選ぶ（状態つき）。実施した回は「実施 08:05 看護師 佐藤」", () => {
    const html = as("医師", <ExecuteMenuBody title="CEZ" occurrences={occs(inj, { [done.key]: done })} day={0} execute={exec({ [done.key]: done })} onDone={() => {}} />);
    expect(html).toContain("今日の回を選ぶ");
    expect(html).toContain(">08:00<");
    expect(html).toContain(">20:00<");
    expect(html).toContain("実施 08:05 看護師 佐藤");
    expect(html).toContain(">予定<");
    expect(html).not.toContain("実施した（いま");
  });
  it("記録のある回（1回だけ）は「この記録を取り消す…」だけ", () => {
    const html = as("看護師", <ExecuteMenuBody title="CEZ" occurrences={[occs(inj, { [done.key]: done })[0]]} day={0} execute={exec({ [done.key]: done })} onDone={() => {}} />);
    expect(html).toContain("実施 08:05 看護師 佐藤");
    expect(html).toContain("この記録を取り消す…");
    expect(html).not.toContain("実施した（いま");
  });
  it("明日の回は記録できない（理由を出す）。頓用は「必要時：実施した（いま）」", () => {
    const html = as("看護師", <ExecuteMenuBody title="CEZ" occurrences={[occs(inj, {}, 1)[0]]} day={1} execute={exec()} onDone={() => {}} />);
    expect(html).toContain("明日以降の分は、その日になってから記録します");
    expect(html).not.toContain("実施した（いま");
    const prn: OrderEntry = { kind: "order", id: "prn", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "臨時", drugCode: "ORAL-ACE500", amount: 1, unit: "錠", timings: [], prn: "疼痛時", start: { day: -1 } } };
    const u = as("看護師", <ExecuteMenuBody title="ACE" occurrences={[]} untimed={occurrencesOn(patient, prn, 0, noon).untimed} day={0} execute={exec()} onDone={() => {}} />);
    expect(u).toContain("必要時：実施した（いま 12:00）");
  });
  it("権限のない職種（薬剤師）には無効の項目と理由。Do の項目は上に残る", () => {
    const html = as("薬剤師", <ExecuteMenuBody title="CEZ" occurrences={occs(lab)} day={0} execute={exec()} extra={[{ label: "右へ写す（Do）", icon: Copy, onClick: () => {} }]} onDone={() => {}} />);
    expect(html).toContain("右へ写す（Do）");
    expect(html).toContain("与薬・実施の記録は看護師・医師が行います（いまは薬剤師で入っています）");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?実施・未実施を記録/);
    expect(html).not.toContain("実施した（いま");
    expect(html).not.toContain(MENU_NOTE);
  });
});

describe("経過のオーダ行", () => {
  const sakura = PATIENTS.find((p) => p.id === "90010231")!;
  const base = { today, selectedDay: null, showStopped: false, onToggleStopped: () => {} };
  const cez = sakura.history.find((e) => e.kind === "order" && e.id === "sakura-cez") as OrderEntry;
  const first = occurrencesOn(sakura, cez, 0, noon).timed[0];
  const rec: AdminRecord = { key: marKey(cez.id, first.at!), orderId: cez.id, patientId: sakura.id, at: first.at!, status: "実施", doneAt: "08:05", by: "看護師 佐藤", checked: { patient: true, label: true } };
  it("今日の実施の印が指示受けの印の並びに出る（実施 08:05・予定 …）、⋯ のメニューは Do のないオーダにも", () => {
    const x = exec({ [rec.key]: rec });
    const html = as("看護師", <HistoryPane {...base} patient={sakura} entries={sakura.history} execute={x} />);
    const badge = executionBadge(sakura, cez, x.records, x.sessionStart, noon)!;
    expect(badge.text).toContain("実施 08:05");
    expect(html).toContain(`data-exec-badge="${badge.tone}"`);
    expect(html).toContain(`>${badge.text}</span>`);
    expect(html).toContain('aria-label="オーダのメニュー"');
    expect(html).toContain("右クリック（iPad は長押し）");
  });
  it("execute を渡さなければ印も右クリックの説明も出ない", () => {
    const html = as("看護師", <HistoryPane {...base} patient={sakura} entries={sakura.history} />);
    expect(html).not.toContain("data-exec-badge");
    expect(html).not.toContain("iPad は長押し");
  });
});

describe("カレンダーのセル", () => {
  const p = { ...PATIENTS[0], admittedOn: -2 };
  const base = { patient: p, today, nowTime: "12:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] as string[] };
  const cez: OrderEntry = { ...inj, patientId: p.id } as OrderEntry;
  const rx: OrderEntry = { kind: "order", id: "rx", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "朝" } } };
  const proc: OrderEntry = { kind: "order", id: "pr", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "procedure", code: "PROC-DRESS", schedule: { kind: "per_day", count: 1 }, start: { day: -1 } } };
  it("注射カレンダー：execute があれば時刻の札が右クリックの対象になり、注記が出る", () => {
    const html = as("看護師", <InjectionCalendar {...base} entries={[cez]} execute={exec()} />);
    expect(html).toContain('data-exec-at="480"');
    expect(html).toContain('data-exec-at="1200"');
    expect(html).toContain("右クリック（iPad は長押し）すると、その回を実施・未実施にできます");
    const plain = as("看護師", <InjectionCalendar {...base} entries={[cez]} />);
    expect(plain).not.toContain("data-exec-at");
    expect(plain).not.toContain("iPad は長押し");
  });
  it("内服カレンダー：朝・夕の札が対象、記録があれば 済 が付く", () => {
    const r: AdminRecord = { key: marKey("rx", 480), orderId: "rx", patientId: p.id, at: 480, status: "実施", doneAt: "08:02", by: "看護師 佐藤", checked: { patient: true, label: true } };
    const html = as("看護師", <PrescriptionCalendar {...base} entries={[rx]} execute={exec({ [r.key]: r })} marOf={(id, at) => (id === "rx" && at === 480 ? r : undefined)} />);
    expect(html).toContain('data-exec-at="480"');
    expect(html).toContain('data-exec-at="1080"');
    expect(html).toContain(">済<");
  });
  it("処置カレンダー：決まった時刻の処置の札が対象", () => {
    const html = as("看護師", <ProcedureCalendar {...base} entries={[proc]} execute={exec()} />);
    expect(html).toContain('data-exec-at="600"');
  });
});
