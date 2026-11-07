// 束B「医師のカルテ」のマウス操作: 経過表の数字の重なり、経過の検体検査カード、検査結果の表、内服・注射カレンダー（server render）。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { labelsThatFit } from "@/lib/point-labels";
import { PATIENTS } from "@/lib/patients";
import type { VitalSign } from "@/lib/types";
import { ANALYTES } from "@/lib/master";
import { flagOf } from "@/lib/lab-desk";
import { STAFF } from "@/lib/roles";
import { FlowSheet } from "./FlowSheet";
import { HistoryPane } from "./HistoryPane";
import { MeProvider, RoleProvider } from "./RoleContext";

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
