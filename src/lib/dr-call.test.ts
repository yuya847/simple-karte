import { describe, expect, it, vi, afterEach } from "vitest";
import { drCallMatches, emptyStanding } from "./standing";
import { vitalsFlash } from "./flash";
import { noteTemplate, preferredNoteForm, rememberNoteForm } from "./notes";

import { vitalsContact, vitalsContactTodos } from "./vitals-contact";

const standing = { ...emptyStanding("医師", { day: 0, time: "09:00" }), calls: [{ key: "sbpLow" as const, value: 90 }, { key: "sbpHigh" as const, value: 180 }, { key: "spo2" as const, value: 90 }, { key: "bt" as const, value: 39 }, { key: "hrHigh" as const, value: 130 }, { key: "hrLow" as const, value: 40 }] };
const base = { day: 0, time: "10:00" };
afterEach(() => vi.unstubAllGlobals());
describe("医師への連絡条件", () => {
  it("境界を含む血圧・体温・脈拍と、境界を含まないSpO2を比較する", () => {
    expect(drCallMatches({ ...base, sbp: 90, spo2: 90, bt: 39, hr: 130 }, standing)).toEqual(["指示簿：収縮期血圧 90mmHg以下で Dr.call", "指示簿：体温 39℃以上で Dr.call", "指示簿：脈拍 130/分以上で Dr.call"]);
    expect(drCallMatches({ ...base, sbp: 180, spo2: 89, hr: 40 }, standing)).toHaveLength(3);
    expect(drCallMatches(base, standing)).toEqual([]);
    expect(drCallMatches(base)).toEqual([]);
  });
  it("NEWS2か指示簿のどちらかが該当すれば連絡情報を付ける", () => {
    expect(vitalsFlash({ ...base, spo2: 89 }, undefined, standing).contact?.reasons).toContain("指示簿：SpO2 90%未満で Dr.call");
    expect(vitalsFlash({ ...base, rr: 30, sbp: 80, hr: 140 }).contact?.score).toBeGreaterThanOrEqual(7);
    expect(vitalsFlash({ ...base, spo2: 93, o2: "鼻カニュラ 2L", hr: 95 }).contact).toBeUndefined();
  });
});
describe("職種別の記事形式", () => {
  it("看護師はDAR、医師は空の記事（自由文）が既定で、保存は職種ごと", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k), setItem: (k: string, v: string) => data.set(k, v) });
    expect(noteTemplate("看護師")).toContain("Act)");
    expect(preferredNoteForm("医師")).toBe("自由文");
    rememberNoteForm("看護師", "経時記録");
    expect(preferredNoteForm("看護師")).toBe("経時記録");
    expect(preferredNoteForm("医師")).toBe("自由文");
    data.set("simple-karte:note-form:看護師", "壊れた値");
    expect(preferredNoteForm("看護師")).toBe("フォーカス（DAR）");
  });
});

it("連絡先は主治医で、同じ通話メモから医師のやることを作る", () => {
  const n = vitalsContact({ text: "記録しました", contact: { score: 8, reasons: ["NEWS2 8点"] } }, { id: "p", name: "佐倉 修", attending: "主治医" }, "看護師", "10:00", "c1", base)!;
  expect(n.to).toBe("主治医");
  expect(vitalsContactTodos([n])[0].label).toBe("看護師から連絡：佐倉 修 NEWS2 8点");
  expect(vitalsContact(null, { id: "p", name: "佐倉 修", attending: "主治医" }, "看護師", "10:00", "c2", base)).toBeNull();
});
