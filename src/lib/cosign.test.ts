import { describe, expect, it } from "vitest";
import { confirmDeny, confirmItems, confirmerAs, cosignLabel, newItems, noteRevised, pendingOf, residentBlock, signerLabel } from "./cosign";
import { DEFAULT_DOCTOR, DOCTORS, doctorOf, isResident, onTeamOf, teamOf } from "./doctors";
import type { Order } from "./types";

let n = 0;
const id = () => `c${++n}`;
const base = { patientId: "90010231", by: "研修医 田中", at: { day: 0, time: "09:00" } };

describe("医師の役で選ぶ人", () => {
  it("has 山本（専攻医） first, a 研修医, a 指導医 of the same team, a doctor of another team and the radiologist", () => {
    expect(DEFAULT_DOCTOR).toBe("山本（専攻医）");
    expect(DOCTORS.slice(0, 6).map((d) => d.rank)).toEqual(["専攻医", "研修医", "指導医", "医師", "医師", "医師"]);
    expect(teamOf("放射線科 石田")).toBe("放射線科");
    expect(isResident("研修医 田中")).toBe(true);
    expect(isResident("山本（専攻医）")).toBe(false);
    expect(teamOf("指導医 高橋")).toBe(teamOf("研修医 田中"));
  });

  it("the team of the attending: 山本チーム for the three, not the B team doctor", () => {
    expect(onTeamOf("研修医 田中", "山本（専攻医）")).toBe(true);
    expect(onTeamOf("指導医 高橋", "山本（専攻医）")).toBe(true);
    expect(onTeamOf("木下（総合診療科 B）", "山本（専攻医）")).toBe(false);
    // An attending who is not on the list (another department) is a team of one.
    expect(onTeamOf("田村（消化器内科）", "田村（消化器内科）")).toBe(true);
    expect(onTeamOf("山本（専攻医）", "田村（消化器内科）")).toBe(false);
  });
});

describe("研修医の記録の確認（カウンターサイン）", () => {
  const items = newItems(base, [
    { ref: "note-1", kind: "記事", text: "S) 熱はない" },
    { ref: "order-1", kind: "オーダ", text: "セファゾリン 2g 8時間ごと" },
  ], id);

  it("new items carry who wrote it, the team and the time, and wait for confirmation", () => {
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ ref: "note-1", by: "研修医 田中", team: teamOf("研修医 田中"), at: { day: 0, time: "09:00" } });
    expect(pendingOf(items)).toHaveLength(2);
    expect(pendingOf(items, "other")).toHaveLength(0);
    expect(cosignLabel(items[0])).toBe("指導医の確認待ち");
  });

  it("指導医 and 上級医 (専攻医) of the same team confirm; the 研修医, another team and the writer do not", () => {
    expect(confirmerAs(doctorOf("指導医 高橋"))).toBe("指導医");
    expect(confirmerAs(doctorOf("山本（専攻医）"))).toBe("上級医");
    expect(confirmerAs(doctorOf("研修医 田中"))).toBeNull();
    expect(confirmDeny("指導医 高橋", items[0])).toBeNull();
    expect(confirmDeny("山本（専攻医）", items[0])).toBeNull();
    expect(confirmDeny("研修医 田中", items[0])).toContain("指導医か上級医");
    expect(confirmDeny("木下（総合診療科 B）", items[0])).toContain("指導医か上級医");
    expect(confirmDeny("看護師 佐藤", items[0])).toContain("指導医か上級医");
    expect(confirmDeny("指導医 高橋", { ...items[0], by: "指導医 高橋" })).toBe("自分の記録は確かめられません。");
    expect(confirmDeny("指導医 高橋", { ...items[0], team: "総合診療科 B（木下チーム）" })).toContain("木下チーム");
  });

  it("confirms one or several, recording who, as what, when and the comment", () => {
    const one = confirmItems(items, [items[0].id], "指導医 高橋", { day: 0, time: "10:30" }, "  抗菌薬の選択はよい ");
    expect(one.done).toHaveLength(1);
    expect(one.items[0].confirmed).toEqual({ by: "指導医 高橋", as: "指導医", at: { day: 0, time: "10:30" }, comment: "抗菌薬の選択はよい" });
    expect(cosignLabel(one.items[0])).toBe("確認 指導医 高橋 10:30");
    expect(one.items[1].confirmed).toBeUndefined();
    expect(items[0].confirmed).toBeUndefined(); // the list given is not changed

    const all = confirmItems(one.items, one.items.map((i) => i.id), "山本（専攻医）", { day: 0, time: "11:00" });
    expect(all.done.map((i) => i.ref)).toEqual(["order-1"]);
    expect(all.refused.map((r) => r.why)).toEqual(["確認済みです。"]);
    expect(cosignLabel(all.items[1])).toBe("確認 上級医 山本（専攻医） 11:00");
    expect(all.items[1].confirmed?.comment).toBeUndefined();
    expect(pendingOf(all.items)).toHaveLength(0);
  });

  it("a 研修医 cannot confirm their own; nothing changes", () => {
    const r = confirmItems(items, items.map((i) => i.id), "研修医 田中", { day: 0, time: "10:00" });
    expect(r.done).toHaveLength(0);
    expect(r.refused).toHaveLength(2);
    expect(r.items).toEqual(items);
  });

  it("a corrected note goes back to waiting, with the new text and the version", () => {
    const ok = confirmItems(items, [items[0].id], "指導医 高橋", { day: 0, time: "10:30" }).items;
    const again = noteRevised(ok, { ...base, ref: "note-1", at: { day: 0, time: "12:00" }, text: "S) 熱はない。食事 全量" }, id);
    expect(again).toHaveLength(2);
    expect(again[0]).toMatchObject({ kind: "記事の修正", text: "S) 熱はない。食事 全量", version: 2, at: { day: 0, time: "12:00" } });
    expect(again[0].confirmed).toBeUndefined();
    expect(cosignLabel(again[0])).toBe("指導医の確認待ち（第2版）");
    // A note with no item (written before) gets one.
    const fresh = noteRevised(ok, { ...base, ref: "note-old", at: { day: 0, time: "12:00" }, text: "追記" }, id);
    expect(fresh).toHaveLength(3);
    expect(fresh[2]).toMatchObject({ ref: "note-old", kind: "記事の修正", version: 2 });
  });

  it("signer label does not repeat 指導医", () => {
    expect(signerLabel("指導医 高橋", "指導医")).toBe("指導医 高橋");
    expect(signerLabel("山本（専攻医）", "上級医")).toBe("上級医 山本（専攻医）");
  });
});

describe("研修医が確定できないオーダ", () => {
  const inj = (codes: string[]): Order => ({ type: "injection", items: codes.map((drugCode) => ({ drugCode, amount: 1, unit: "V" })), route: "点滴静注", schedule: { kind: "once" }, start: { day: 0, time: "10:00" }, days: null } as unknown as Order);

  it("抗がん薬 (the master's chemo mark) is blocked; an antibiotic is not", () => {
    expect(residentBlock(inj(["INJ-PTX", "INJ-NS100"]))).toBe("抗がん薬（レジメン）");
    expect(residentBlock(inj(["INJ-CEZ1"]))).toBeNull();
  });

  it("麻薬 by the list of codes (the fictional master has none yet)", () => {
    expect(residentBlock(inj(["INJ-X-NARC"]))).toBeNull();
    expect(residentBlock(inj(["INJ-X-NARC"]), new Set(["INJ-X-NARC"]))).toBe("麻薬");
    const rx = { type: "prescription", drugCode: "ORAL-X-NARC" } as unknown as Order;
    expect(residentBlock(rx, new Set(["ORAL-X-NARC"]))).toBe("麻薬");
    expect(residentBlock({ type: "lab" } as unknown as Order)).toBeNull();
  });
});

it("指示簿の頓用にも研修医の麻薬・抗がん薬の制限を使う", async () => {
  const { emptyStanding } = await import("./standing");
  const base = emptyStanding("研修医 田中", { day: 0, time: "10:00" });
  const rule = (code: string) => ({ id: "r", when: "疼痛時" as const, detail: "", drug: { code, amount: 1, unit: "mg" }, intervalH: 6, maxPerDay: 3 });
  expect(residentBlock({ ...base, prn: [rule("INJ-PTX")] })).toBe("抗がん薬（レジメン）");
  expect(residentBlock({ ...base, prn: [rule("test")] }, new Set(["test"]))).toBe("麻薬");
  expect(residentBlock(base)).toBeNull();
});
