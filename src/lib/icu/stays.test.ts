import { describe, expect, it } from "vitest";
import { icuRecordShown, stayOnArrive, stayOnMove } from "./stays";
import { emptyIcuRecords } from "./types";
const at = {day:0,time:"10:00"};
describe("集中治療の入退室", () => {
  it("転入を記録し、二度受けても重複しない", () => {
    const records=stayOnArrive(emptyIcuRecords(),"p","ICU",at,"救急外来","急性呼吸不全");
    expect(records.stays).toHaveLength(1);
    expect(records.stays[0]).toMatchObject({in:at,from:"救急外来",reason:"急性呼吸不全"});
    expect(stayOnArrive(records,"p","ICU",{day:0,time:"11:00"},"救急外来","")).toBe(records);
  });
  it("ICUのoutとHCUのin、一般病棟へのoutだけを記録", () => {
    const initial=stayOnArrive(emptyIcuRecords(),"p","ICU",at,"救急外来","");
    const moved=stayOnMove(initial,"p","ICU","HCU",{day:0,time:"14:00"});
    expect(moved.stays).toHaveLength(2);
    expect(moved.stays[0]).toMatchObject({out:{day:0,time:"14:00"},to:"HCU"});
    expect(moved.stays[1]).toMatchObject({unit:"HCU",in:{day:0,time:"14:00"},from:"ICU"});
    const left=stayOnMove(moved,"p","HCU","5階東病棟",{day:1,time:"10:00"});
    expect(left.stays).toHaveLength(2); expect(left.stays[1].out).toEqual({day:1,time:"10:00"});
    expect(initial.stays[0].out).toBeUndefined();
  });
  it("同じ病棟内の転床では入退室を増やさない", () => {
    const r=stayOnArrive(emptyIcuRecords(),"p","ICU",at,"救急外来","");
    expect(stayOnMove(r,"p","ICU","ICU",at)).toBe(r);
  });
});

describe("ICU 記録を出す患者", () => {
  const stay = (out?: { day: number; time: string }) => ({ ...emptyIcuRecords(), stays: [{ id: "s", patientId: "p", unit: "ICU" as const, in: { day: -3, time: "00:00" }, from: "救急外来", reason: "架空", ...(out ? { out, to: "5階東" } : {}) }] });
  it("ICU・HCU のベッドにいる・今日まで入室していた患者だけ", () => {
    expect(icuRecordShown({ id: "p", ward: "ICU" }, emptyIcuRecords())).toBe(true);
    expect(icuRecordShown({ id: "p", ward: "HCU" }, emptyIcuRecords())).toBe(true);
    expect(icuRecordShown({ id: "p", ward: "5階東" }, emptyIcuRecords())).toBe(false);
    expect(icuRecordShown({ id: "p", ward: "5階東" }, stay({ day: 0, time: "10:00" }))).toBe(true);
    expect(icuRecordShown({ id: "p", ward: "5階東" }, stay({ day: -1, time: "10:00" }))).toBe(false);
    expect(icuRecordShown({ id: "q", ward: "5階東" }, stay())).toBe(false);
  });
});
