import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrescriptionPrintSheet } from "./PrescriptionPrint";
import { PrescriptionCommentInput } from "./PrescriptionCommentInput";
import { DoseTimesEntry } from "./LineEntry";
import { InjectionEntryRow } from "./panels/InjectionEntryRow";
import { TotalPrescriptionEditor } from "./TotalPrescriptionEditor";
import { InsulinDoseEditor } from "./InsulinDoseEditor";
import { InjectionDurationInput } from "./InjectionDurationInput";
import { insulinDoses } from "@/lib/insulin-doses";
import { DayPatternEditor } from "./DayPatternEditor";
import type { InjStep } from "@/lib/inj-entry";
const noop = () => {};
describe("処方と注射の入力欄", () => {
  it("コメントの候補と自由記載を同じ入力に持つ", () => {
    const html = renderToStaticMarkup(<PrescriptionCommentInput value="持参残薬を先に使用" label="Rp1 のコメント" onChange={noop} onEnter={noop} />);
    expect(html).toContain('list=');
    expect(html).toContain('<datalist');
    for (const text of ["粉砕", "一包化", "簡易懸濁", "自己管理", "看護師管理", "食直前", "食直後", "残薬調整", "脱カプセル", "持参残薬を先に使用"]) expect(html).toContain(text);
  });
  it("現在の段にかかわらず注射の全欄がマウスで操作できる形で表示される", () => {
    for (const active of ["dose", "route", "times", "days"] as InjStep[]) {
      const html = renderToStaticMarkup(<>{(["route", "schedule", "times", "duration", "start", "days"] as InjStep[]).map(step => <InjectionEntryRow key={step} step={step} active={active}><input aria-label={step} /></InjectionEntryRow>)}</>);
      expect(html).not.toContain('hidden=');
      expect(html).not.toContain('display:none');
      for (const step of ["route", "schedule", "times", "duration", "start", "days"]) expect(html).toContain(`aria-label="${step}"`);
    }
  });
  it("外用の部位・回数・使い方とインスリンの各時刻が独立した入力になる", () => {
    const topical = renderToStaticMarkup(<TotalPrescriptionEditor value={{ kind: "外用", usage: "1日1回 腰に貼付" }} onChange={noop} />);
    for (const label of ["外用の回数", "外用の部位", "外用の使い方"]) expect(topical).toContain(`aria-label="${label}"`);
    const insulin = renderToStaticMarkup(<InsulinDoseEditor value={insulinDoses([2, 2, 2, 0])} onChange={noop} />);
    for (const label of ["朝", "昼", "夕", "眠前"]) expect(insulin).toContain(`aria-label="${label}のインスリン量"`);
    const duration = renderToStaticMarkup(<InjectionDurationInput value={60} onChange={noop} label="1回の時間" />);
    expect(duration).toContain('role="radio"');
    expect(duration).toContain('aria-label="1回の時間"');
  });
  it("曜日の札と時刻追加のアイコンが表示される", () => {
    const html = renderToStaticMarkup(<DayPatternEditor onChange={noop} />);
    for (const text of ["毎日", "隔日", "週1回（曜日）", "月水金", "火木土", "曜日を選ぶ"]) expect(html).toContain(text);
    const times = renderToStaticMarkup(<DoseTimesEntry label="投与時刻" times={[]} onChange={noop} />);
    expect(times).toContain('title="時刻を足す"');
    expect(times).not.toContain("＋時刻");
  });
});

it("処方せんに外用の用法と総量を印字し、日分や頓用を付けない", () => {
  const html = renderToStaticMarkup(<PrescriptionPrintSheet patient={{ id: "test", name: "試験" }} date="2026-11-06" doctor="医師" lines={[{ rp: 1, drug: "620003477", perDose: 14, unit: "枚", timings: [], prn: null, maxPerDay: null, days: null, administration: { kind: "外用", usage: "1日1回 腰に貼付" } }]} />);
  expect(html).toContain("総量14枚");
  expect(html).toContain("腰に貼付");
  expect(html).not.toContain("頓用");
  expect(html).not.toContain("日分");
});
