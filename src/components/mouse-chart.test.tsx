// 束B「医師のカルテ」のマウス操作: 経過表の数字の重なり、経過の検体検査カード、検査結果の表、内服・注射カレンダー（server render）。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { labelsThatFit } from "@/lib/point-labels";
import { pickWithShift, valueTip } from "@/lib/lab-pick";
import { PATIENTS } from "@/lib/patients";
import type { InjectionOrder, LabResult, OrderEntry, PrescriptionOrder, VitalSign } from "@/lib/types";
import { ANALYTES } from "@/lib/master";
import { flagOf } from "@/lib/lab-desk";
import { STAFF } from "@/lib/roles";
import { FlowSheet } from "./FlowSheet";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ResultsPanel } from "./panels/ResultsPanel";
import { InjectionCalendar, PrescriptionCalendar, ProcedureCalendar } from "./Calendars";
import { RefWindow } from "./RefWindows";

const today = { y: 2026, m: 11, d: 4 };

describe("経過表：同じ日の数字を重ねない", () => {
  it("近すぎる数字は点にし、新しい方の数字を残す", () => {
    expect(labelsThatFit([{ at: 100, text: "16" }, { at: 104, text: "16" }, { at: 108, text: "18" }])).toEqual([false, false, true]);
    expect(labelsThatFit([{ at: 100, text: "16" }, { at: 140, text: "18" }])).toEqual([true, true]);
    expect(labelsThatFit([])).toEqual([]);
  });
  it("1日に何回測っても「1616」と並べず、点と数字のどれにもカーソルで時刻つきの値が出る", () => {
    const p = PATIENTS[0];
    const vitals: VitalSign[] = [
      { day: 0, time: "06:00", bt: 36.8, rr: 16, spo2: 97 },
      { day: 0, time: "08:00", bt: 36.9, rr: 18, spo2: 96 },
    ];
    const html = renderToStaticMarkup(<FlowSheet patient={{ ...p, vitals }} entries={p.history} today={today} nowTime="10:00" selectedDay={null} onSelectDay={() => {}} />);
    expect(html).toContain('title="11/4 08:00 呼吸数 18"');
    expect(html).toContain('aria-label="11/4 06:00 呼吸数 16"');
    expect(html).not.toMatch(/>16<\/span><span[^>]*>18</);
  });
});

describe("経過の検体検査カード：カーソルでその回の H・L", () => {
  it("「結果を表示」にその採血の H・L の値だけが吹き出しで付く（押すと今までどおり検査結果）", () => {
    const hit = PATIENTS.flatMap((p) => p.history.flatMap((e) => (e.kind === "order" && e.order.type === "lab" && p.labs.some((l) => e.order.type === "lab" && l.day === e.order.collect.day && l.time === e.order.collect.time) ? [{ p, e }] : [])))[0];
    expect(hit).toBeDefined();
    const { p, e } = hit;
    const lab = p.labs.find((l) => e.order.type === "lab" && l.day === e.order.collect.day && l.time === e.order.collect.time)!;
    const html = renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={STAFF["医師"]}><HistoryPane today={today} selectedDay={null} showStopped={false} onToggleStopped={() => {}} patient={p} entries={[e]} onOpenResult={() => {}} /></MeProvider></RoleProvider>);
    expect(html).toContain("結果を表示");
    expect(html).toContain(`id="lab-hl-${e.id}" role="tooltip"`);
    const tip = html.slice(html.indexOf(`id="lab-hl-${e.id}"`)).split("</span></div>")[0];
    for (const a of ANALYTES) {
      const v = lab.values[a.code];
      if (v === undefined) continue;
      if (flagOf(a, p.sex, v)) expect(tip).toContain(`${a.name} <b`);
      else expect(tip).not.toContain(`>${a.name} <b`);
    }
  });
});

describe("検査結果：表を押して選び、右クリックで操作", () => {
  it("押すと1つずつ足し引き、Shift で前に押したところから続けて選ぶ", () => {
    const order = ["WBC", "Hb", "Plt", "CRP"];
    expect(pickWithShift([], order, "Hb", null, false)).toEqual(["Hb"]);
    expect(pickWithShift(["Hb"], order, "Hb", "Hb", false)).toEqual([]);
    expect(pickWithShift(["Hb"], order, "CRP", "Hb", true)).toEqual(["Hb", "Plt", "CRP"]);
    expect(pickWithShift(["CRP"], order, "WBC", "Plt", true)).toEqual(["CRP", "WBC", "Hb", "Plt"]);
  });
  it("値にカーソルで前回の値と日付、いまの値、基準範囲", () => {
    const labs: LabResult[] = [{ day: -4, time: "06:00", values: { CRP: 12.2 } }, { day: -1, time: "06:00", values: { WBC: 6000 } }, { day: 0, time: "06:00", values: { CRP: 0.5 } }];
    expect(valueTip(labs, labs[2], "CRP", "mg/dL", "0.14以下", today)).toBe("前回 12.20（10/31）→ 0.50 mg/dL、基準 0.14以下");
    expect(valueTip(labs, labs[0], "CRP", "mg/dL", "0.14以下", today)).toBe("12.20 mg/dL、基準 0.14以下");
  });
  it("上に残るのは期間と「H・L だけ」。チェックボックスと14個のボタンはなく、項目名と日付が押して選ぶボタンになり、行はドラッグできる", () => {
    const p = PATIENTS.find((x) => x.labs.length >= 2)!;
    const html = renderToStaticMarkup(<ResultsPanel patient={p} today={today} />);
    expect(html).not.toContain('type="checkbox"');
    for (const gone of ["全選択", "全解除", "記事に貼る", "時系列で見る", "全日付", "日付を解除", "旧→新", ">CSV<", ">印刷<", "最新の結果をコピー"]) expect(html).not.toContain(gone);
    expect(html).toContain(">H・L だけ</button>");
    expect(html).toContain(">直近7日</button>");
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBeGreaterThan(p.labs.length);
    expect(html).toMatch(/data-code="[^"]+" draggable="true"/);
    expect(html).toMatch(/title="前回 [^"]+→ [^"]+、基準 /);
  });
});

describe("内服・注射カレンダー：同じボタンを並べず、帯を直接動かす", () => {
  const base = { today, nowTime: "10:00", selectedDay: null, onSelectDay: () => {}, onStopDraft: () => {}, draftedStops: [] as string[] };
  const rxEntry = (): OrderEntry => {
    const e = PATIENTS[0].history.find((x): x is OrderEntry => x.kind === "order" && x.order.type === "prescription")!;
    return { ...e, status: "有効", order: { ...(e.order as PrescriptionOrder), start: { day: -2 }, days: 5 } };
  };
  it("処方：見出しの「＋処方」はなく、新規処方の行の「＋」は日の欄にカーソルがあるときだけ。「延長…」のセレクトはなく、帯の終わりをつかんで延ばす（縮める）", () => {
    const html = renderToStaticMarkup(<PrescriptionCalendar {...base} patient={PATIENTS[0]} entries={[rxEntry()]} onNewPrescription={() => {}} onExtendDraft={() => {}} />);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("延長…");
    expect((html.match(/新規処方/g) ?? []).length).toBe(1);
    expect(html).toMatch(/class="[^"]*opacity-0[^"]*group-hover\/new:opacity-100[^"]*">＋ 処方<\/button>/);
    expect(html).toMatch(/role="slider" aria-label="[^"]+の終わりの日（〜11\/6（金））。左右へ引くか ← → で日数を変える" aria-valuemin="0"/);
    expect(html).toContain('<tr class="group/row">');
  });
  it("処置：「延長…」のセレクトの代わりに右クリック（長押し）の 3日・7日延長", () => {
    const p = PATIENTS.find((x) => x.history.some((e) => e.kind === "order" && e.order.type === "procedure" && e.status === "有効"))!;
    const html = renderToStaticMarkup(<ProcedureCalendar {...base} patient={p} entries={p.history} onExtendDraft={() => {}} onModify={() => {}} />);
    expect(html).not.toContain("<select");
    expect(html).toContain('<div tabindex="0" class="rounded outline-none');
  });
  it("処方をオーダできない人には新規処方の行を出さない", () => {
    const html = renderToStaticMarkup(<PrescriptionCalendar {...base} patient={PATIENTS[0]} entries={[rxEntry()]} />);
    expect(html).not.toContain("新規処方");
    expect(html).not.toContain('role="slider"');
  });
  it("参照の内服カレンダーの窓にも見出しの「＋ 処方」を重ねない", () => {
    const html = renderToStaticMarkup(<RefWindow tab="rxcal" {...base} patient={PATIENTS[0]} entries={[rxEntry()]} onNewPrescription={() => {}} onNewOrder={() => {}} />);
    expect(html.startsWith("<div")).toBe(true);
    expect((html.match(/新規処方/g) ?? []).length).toBe(1);
  });
  it("注射：先の日の「0–6…」と「＋新規」はその日の欄にカーソルがあるときだけ（押して延長・新規は今のまま）", () => {
    const ctrx: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, minutesPerDose: 60, start: { day: -2, time: "10:00" }, days: 3 };
    const entry = { kind: "order", id: "o1", day: -2, time: "09:00", author: "山田", role: "医師", status: "有効", order: ctrx } as OrderEntry;
    const html = renderToStaticMarkup(<InjectionCalendar {...base} patient={{ ...PATIENTS[0], admittedOn: -2 }} entries={[entry]} onExtendDraft={() => {}} onNewInjection={() => {}} />);
    expect(html).toMatch(/border-y border-rule-soft opacity-0 group-hover\/ext:opacity-100/);
    expect(html).toMatch(/aria-label="[^"]+ 0–6 ここまで延長"/);
    expect(html).toMatch(/opacity-0 hover:border-ai hover:text-ai focus-visible:opacity-100 group-hover\/new:opacity-100[^"]*"><svg[\s\S]*?<\/svg>新規<\/button>/);
  });
});
