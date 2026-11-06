import { helpSections } from "@/lib/help";
// 患者モニター（模擬）とセントラルモニター, rendered on the server: no canvas is drawn there, but the numbers from
// the latest recorded vital signs, the alarms and the 模擬 notes are in the markup.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MONITOR_NOTES } from "@/lib/monitor";
import type { VitalSign } from "@/lib/types";
import { RoleProvider } from "./RoleContext";
import { CentralMonitor } from "./CentralMonitor";
import { MonitorPanel } from "./panels/MonitorPanel";

const vital = (over: Partial<VitalSign> = {}): VitalSign => ({ day: 0, time: "08:00", bt: 36.8, hr: 72, sbp: 128, dbp: 76, rr: 16, spo2: 97, o2: "室内気", ...over });
const quiet = { id: "p-quiet", name: "佐倉 花", room: "501A", age: 70, sex: "女" as const, admittedOn: -5, vitals: [vital()] };
const sick = { id: "p-sick", name: "大浦 太郎", room: "502B", age: 82, sex: "男" as const, admittedOn: -1, vitals: [vital({ hr: 128, spo2: 87, rr: 28, sbp: 84, o2: "鼻カニュラ 2L" })] };

describe("患者モニター（模擬）のウインドウ", () => {
  it("shows the patient, the numbers from the latest record, the limits, the notes and the buttons; nothing is drawn on the server", () => {
    const html = renderToStaticMarkup(<MonitorPanel patient={quiet} nowTime="10:15" lockedWhy={null} onRecord={() => {}} />);
    expect(html).toContain("佐倉 花");
    expect(html).toContain("501A");
    expect(html).toContain("10:15");
    // The wobble at tick 0 keeps HR within ±3 of 72.
    expect(html).toMatch(/>(69|7[0-5])<span/);
    expect(html).toContain("128/76");
    expect(html).toContain("36.8");
    expect(html).toContain("アラームなし");
    expect(html).toContain("音は鳴りません");
    expect(html.match(/>模擬</g)).toHaveLength(1);
    expect(html).not.toContain("波形は模擬（実際の装置につないでいません）");
    expect(html).not.toContain(MONITOR_NOTES.limits);
    expect(JSON.stringify(helpSections)).toContain(MONITOR_NOTES.limits);
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).toContain("NIBP 測定");
    expect(html).toContain("記録する（HR・SpO2・RR）");
    expect(html).toContain("<canvas");
    expect(html).not.toContain('class="hint');
    expect(html).not.toContain("role=\"alert\"");
  });

  it("a recorded fast heart, low SpO2, fast breathing and low pressure are alarms with the limit crossed, and no sound", () => {
    const html = renderToStaticMarkup(<MonitorPanel patient={sick} nowTime="10:15" lockedWhy={null} onRecord={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("上限 120");
    expect(html).toContain("下限 90");
    expect(html).toContain("上限 25");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("音は鳴りません");
  });

  it("a person who may not write vital signs sees the reason and the record buttons disabled", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="薬剤師">
        <MonitorPanel patient={quiet} nowTime="10:15" lockedWhy="バイタルの記録は看護師・医師が行います。" onRecord={() => {}} />
      </RoleProvider>,
    );
    expect(html).toContain("バイタルの記録は看護師・医師が行います。");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>記録する（HR・SpO2・RR）/);
    // The simulated cuff can still be started (it records nothing by itself).
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>NIBP 測定/);
  });

  it("a patient without records shows — and no alarm", () => {
    const html = renderToStaticMarkup(<MonitorPanel patient={{ ...quiet, vitals: [] }} nowTime="10:15" lockedWhy={null} onRecord={() => {}} />);
    expect(html).toContain("記録なし");
    expect(html).toContain("アラームなし");
    expect(html).not.toContain('role="alert"');
  });
});

describe("セントラルモニター", () => {
  const cands = [
    { id: quiet.id, name: quiet.name, room: quiet.room, admittedOn: quiet.admittedOn, latest: quiet.vitals[0] },
    { id: sick.id, name: sick.name, room: sick.room, admittedOn: sick.admittedOn, latest: sick.vitals[0] },
  ];

  it("shows only the patients the rule picks (plus those put on by hand), the alarmed cell in red, and the toggle table for every patient", () => {
    const html = renderToStaticMarkup(<CentralMonitor candidates={cands} manual={{ on: [], off: [] }} lockedWhy={null} onToggle={() => {}} onOpen={() => {}} nowTime="10:15" />);
    expect(html).toContain("装着中 1人");
    expect(html).toContain("アラーム 1人");
    expect(html).toContain("大浦 太郎（502B）のカルテと患者モニターを開く");
    expect(html).not.toContain("佐倉 花（501A）のカルテと患者モニターを開く");
    expect(html).toContain('data-alarm="true"');
    expect(html).toContain("border-shu");
    expect(html).toContain("酸素投与中・心拍数 100 以上・SpO2 95 未満・入院 2 日以内");
    // The table lists both, the quiet one as outside the rule, with the checkbox to put on.
    expect(html).toContain("佐倉 花にモニターを付ける");
    expect(html).toContain("大浦 太郎にモニターを外す");
    expect(html).toContain("（取り決めの対象外）");
    expect(html).not.toContain("架空の病院の取り決め");
    expect(html).toContain("音は鳴りません");
    expect(html).toContain(MONITOR_NOTES.simulated);
    expect(html).not.toContain('class="hint');
  });

  it("put on by hand: the quiet patient gets a cell; taken off: the sick one loses it", () => {
    const on = renderToStaticMarkup(<CentralMonitor candidates={cands} manual={{ on: [quiet.id], off: [] }} lockedWhy={null} onToggle={() => {}} onOpen={() => {}} nowTime="10:15" />);
    expect(on).toContain("装着中 2人");
    expect(on).toContain("佐倉 花（501A）のカルテと患者モニターを開く");
    expect(on).toContain("手で装着");
    const off = renderToStaticMarkup(<CentralMonitor candidates={cands} manual={{ on: [], off: [sick.id] }} lockedWhy={null} onToggle={() => {}} onOpen={() => {}} nowTime="10:15" />);
    expect(off).toContain("モニターを付けている患者はいません");
    expect(off).toContain("手で外した");
  });

  it("a doctor sees the table but cannot change it", () => {
    const html = renderToStaticMarkup(<CentralMonitor candidates={cands} manual={{ on: [], off: [] }} lockedWhy="モニターの付け外しは看護師が行います。" onToggle={() => {}} onOpen={() => {}} nowTime="10:15" />);
    expect(html).toContain("モニターの付け外しは看護師が行います");
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""/);
  });
});
