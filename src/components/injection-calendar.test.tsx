// 注射カレンダーから新しい注射: the panel takes the start handed from the calendar, the 記憶 hides behind an
// icon, and the calendar shows the ＋ 新しい注射 row, Do, and the drafts not confirmed yet (server render).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InjectionDraft } from "@/lib/drafts";
import { PATIENTS } from "@/lib/patients";
import type { InjectionOrder, OrderEntry } from "@/lib/types";
import { InjectionCalendar } from "./Calendars";
import { AddInjectionPanel } from "./panels/AddPanels";

const today = { y: 2026, m: 11, d: 4 };
const patient = { ...PATIENTS[0], admittedOn: -2 };
const ctrx: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, minutesPerDose: 60, start: { day: -2, time: "10:00" }, days: 5 };
const entry = (id: string, order: InjectionOrder, status: OrderEntry["status"] = "有効"): OrderEntry => ({ kind: "order", id, day: -2, time: "09:00", author: "山田", role: "医師", status, order }) as OrderEntry;
const memory = { patterns: [{ key: "k", order: ctrx, count: 3, lastDay: -1, patients: 2 }], previous: [{ key: "k", order: ctrx, count: 1, lastDay: -2, patients: 1 }] };

describe("注射のタブ：カレンダーから渡された開始", () => {
  it("開始日と時刻帯の時刻が最初の Rp に入り、薬を選ぶ前から見える（3日後・14:00）", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} seed={{ key: "s1", start: { day: 3, time: "14:00" } }} memory={memory} />);
    expect(html).toContain('data-start="3|14:00"');
    expect(html).toContain("開始：3日後 14:00（カレンダーから");
    // Only the first Rp took it; the second stays as it was.
    expect((html.match(/data-start=/g) ?? []).length).toBe(1);
  });
  it("時刻なしなら開始時刻は空（指示受け後すぐ）", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} seed={{ key: "s2", start: { day: 1, time: null } }} />);
    expect(html).toContain('data-start="1|"');
    expect(html).toContain("開始：明日 時刻なし");
  });
  it("Do（同じ内容で新規）は薬と日数をそのまま、開始は渡された日から（3日後が選ばれている）", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} seed={{ key: "s3", order: ctrx, start: { day: 3, time: "10:00" } }} />);
    expect(html).toContain("セフトリアキソン");
    expect(html).toMatch(/aria-checked="true"[^>]*>3日後</);
    expect(html).toMatch(/type="time"[^>]*value="10:00"/);
    expect(html).toMatch(/aria-label="Rp1 の日数"[^>]*value="5"/);
  });
});

describe("注射のタブ：注射の記憶はアイコンの中", () => {
  it("一覧は出ず、時計のアイコンのボタンだけがある", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} memory={memory} />);
    expect(html).toContain('aria-label="注射の記憶"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("lucide-history");
    expect(html).not.toContain("写す");
    expect(html).not.toContain("前回の注射（Do）");
  });
  it("記憶がないときはアイコンも出ない", () => {
    const html = renderToStaticMarkup(<AddInjectionPanel onAdd={() => {}} newId={() => "d1"} drafts={[]} />);
    expect(html).not.toContain('aria-label="注射の記憶"');
  });
});

describe("注射カレンダー：新規・Do・下書きの行", () => {
  const base = { patient, today, nowTime: "10:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] as string[] };
  it("オーダできる人には「＋ 新しい注射」の行と今日以降の「新規」の欄、各行に「同じ内容で新規」が出る", () => {
    const html = renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", ctrx)]} onNewInjection={() => {}} />);
    expect(html).toContain("新しい注射");
    expect((html.match(/>新規</g) ?? []).length).toBe(8); // 今日 + 7日先
    expect(html).toContain("同じ内容で新規");
  });
  it("中止したオーダの今日以降の欄は、その日から同じ内容で新規（Do）", () => {
    const html = renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", ctrx, "中止")]} onNewInjection={() => {}} />);
    expect(html).toContain("から同じ内容で新規（Do）");
  });
  it("オーダできない人（看護師など）には出ない", () => {
    const html = renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", ctrx)]} />);
    expect(html).not.toContain("新しい注射");
    expect(html).not.toContain("同じ内容で新規");
  });
  it("まだ確定していない注射の下書きが、開始日から日数ぶん点線で出る", () => {
    const draft: InjectionDraft = { id: "d1", origin: "manual", sourceText: "", comment: null, kind: "injection", items: [{ drugCode: "INJ-CTRX1", said: "CTRX", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, infusionMinutes: 60, infusionScope: "per_dose", rateMlPerH: null, prefer: null, start: { day: 2, time: "14:00" }, days: 3, duplicate: null };
    const html = renderToStaticMarkup(<InjectionCalendar {...base} entries={[]} onNewInjection={() => {}} pendingNew={[draft]} />);
    expect(html).toContain("まだ確定していない新しい注射");
    expect((html.match(/>下書き</g) ?? []).length).toBe(2); // 3日分：最初の日は時刻付きなので別に数える
    expect(html).toContain("14:00 下書き");
    expect(html).toContain("3日間");
  });
});

describe("注射カレンダー：各回の共通表示", () => {
  const base = { patient, today, nowTime: "12:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] as string[] };
  const order: InjectionOrder = { ...ctrx, schedule: { kind: "per_day", count: 2 }, days: undefined };
  const record = (at: number, status: "実施" | "未実施"): import("@/lib/mar").AdminRecord => ({ key: `o1|${at}`, orderId: "o1", patientId: patient.id, at, status, doneAt: "11:00", by: "架空の担当者", checked: { patient: false, label: null } });
  const execute = (records: import("./ExecuteMenu").ExecuteProps["records"] = {}): import("./ExecuteMenu").ExecuteProps => ({ records, sessionStart: 540, nowTime: "12:00", onRecord: () => {}, onVoid: () => {} });
  const todayCell = (html: string) => html.match(/<td[^>]*data-cal-day="0"[\s\S]*?<\/td>/)?.[0] ?? "";
  it("時刻のない旧オーダも10:00・22:00が縦に並び、回数のチップにならない", () => {
    const html = todayCell(renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", order)]} execute={execute()} />));
    expect(html).toContain("flex flex-col items-start");
    expect(html).toMatch(/>(?:✓ )?10:00<\/button>[\s\S]*>(?:✓ )?22:00<\/button>/); // 過去の回は「✓ 10:00」（記録のない過去の分は架空の実施済み）
    expect(html).toContain('data-exec-at="600"');
    expect(html).toContain('data-exec-at="1320"');
    expect(html).not.toContain("2回");
  });
  it("Rpに指定された時刻を優先し、1日1回なら1つだけ出す", () => {
    const html = todayCell(renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", { ...order, doseTimes: ["09:00", "21:00"] })]} />));
    expect(html).toMatch(/>09:00<\/button>[\s\S]*>21:00<\/button>/);
    expect(html).not.toMatch(/>(?:✓ )?10:00</);
    const once = todayCell(renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", ctrx)]} />));
    expect(once).toMatch(/>(?:✓ )?10:00</);
    expect(once).not.toMatch(/>(?:✓ )?22:00</);
  });
  it("実施記録のある回だけ✓、消した回は薄い取り消し線と担当者・時刻", () => {
    const html = todayCell(renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", order)]} execute={execute({ "o1|600": record(600, "実施"), "o1|1320": record(1320, "未実施") })} />));
    expect(html).toContain("✓ 10:00");
    expect(html).toContain('title="未実施に戻す"');
    expect(html).toContain("opacity-40 line-through");
    expect(html).toContain("消した回 11:00 架空の担当者");
  });
  it("取り消した記録は✓にもスキップにもならない", () => {
    const r = { ...record(600, "未実施"), cancellation: { by: "担当者", at: "12:00", reason: "訂正" } };
    const html = todayCell(renderToStaticMarkup(<InjectionCalendar {...base} entries={[entry("o1", order)]} execute={execute({ "o1|600": r })} />));
    expect(html).not.toContain("✓");
    expect(html).not.toContain("line-through");
  });
});
