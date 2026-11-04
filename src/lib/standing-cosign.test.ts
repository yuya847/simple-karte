import { describe, it, expect } from "vitest";
import { syncStandingCosign, markStandingTake } from "./standing-cosign";
import { confirmItems } from "./cosign";
import { emptyStanding } from "./standing";
import { stopLine, type StandingLine } from "./standing-lines";
import { changeKey } from "./worksheet";
import type { TakeRow } from "./order-take";
const at = { day: 0, time: "10:00" };
const line: StandingLine = { id: "l1", cat: "安静", text: "室内", start: at, at, by: "研修医 田中" };
describe("指示簿の確認待ち", () => {
  it("追加・修正・中止と項目の各版を、書いた研修医で登録し再確認できる", () => {
    const fields = { p: [emptyStanding("山本（専攻医）", at), emptyStanding(line.by, at)] };
    const ls = { p: stopLine([line], line.id, { ...at, by: line.by, reason: "修正" }) };
    const items = syncStandingCosign([], fields, ls);
    expect(items).toHaveLength(3); expect(items.every((i) => i.by === line.by && i.kind === "指示簿")).toBe(true);
    expect(items.some((i) => i.text.includes("中止"))).toBe(true);
    expect(confirmItems(items, items.map((i) => i.id), line.by, at).done).toHaveLength(0);
    const done = confirmItems(items, items.map((i) => i.id), "指導医 高橋", at).items;
    expect(syncStandingCosign(done, fields, ls)).toBe(done);
    const revised = syncStandingCosign(done, { p: [...fields.p, { ...fields.p[1], rest: "室内" }] }, ls);
    expect(revised.filter((i) => !i.confirmed)).toHaveLength(1);
  });
  it("看護師には追加と中止に確認待ちの印を出し、指示受けを妨げない", () => {
    const items = syncStandingCosign([], {}, { p: stopLine([line], line.id, { ...at, by: line.by }) });
    const rows = ["新規", "中止"].map((kind) => ({ kind: "指示簿", patientId: "p", keys: [changeKey(line.id, kind as "新規" | "中止")], flags: {}, mustOne: [] } as unknown as TakeRow));
    expect(markStandingTake(rows, items).every((r) => r.flags.resident === "研修医の指示（確認待ち）" && !r.mustOne.length)).toBe(true);
    const done = confirmItems(items, items.map((i) => i.id), "山本（専攻医）", at).items;
    expect(markStandingTake(rows, done).every((r) => !r.flags.resident)).toBe(true);
  });
});
