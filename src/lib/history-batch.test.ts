import { describe, expect, it } from "vitest";
import { appendTexts, batchDo, batchDoFlash, orderDrafts, recordsText, setRowsOf, stoppableOrders } from "./history-batch";
import type { HistoryEntry, NoteEntry, OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 7 };
let n = 0;
const id = () => `new-${++n}`;
const rx = (eid: string, drugCode: string, rp: string, status: OrderEntry["status"] = "有効"): OrderEntry => ({
  kind: "order", id: eid, day: -2, time: "10:00", author: "山本（専攻医）", status,
  order: { type: "prescription", category: "臨時", drugCode, amount: 1, unit: "錠", timings: ["朝", "昼", "夕"], start: { day: -2, timing: "朝" }, days: 3, rp },
});
const inj: OrderEntry = {
  kind: "order", id: "inj-1", day: -1, time: "09:00", author: "山本（専攻医）", status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, minutesPerDose: 120, start: { day: -1, time: "10:00" }, days: 5, comment: "左腕" },
};
const lab: OrderEntry = {
  kind: "order", id: "lab-1", day: -1, time: "17:00", author: "山本（専攻医）", status: "実施済",
  order: { type: "lab", codes: ["SET-ROUTINE"], collect: { day: 0, time: "06:00" }, priority: "定時" },
};
const proc: OrderEntry = {
  kind: "order", id: "proc-1", day: -1, time: "11:00", author: "山本（専攻医）", status: "有効",
  order: { type: "procedure", code: "PROC-X", start: { day: -1 } } as unknown as OrderEntry["order"],
};
const note: NoteEntry = { kind: "note", day: -1, time: "08:00", author: "山本（専攻医）", role: "医師", soap: { s: "痛みは軽い", a: "改善" } };

describe("選んだオーダを下書きに（Do・セット）", () => {
  it("同じ Rp の内服は1つの下書きにまとめ、注射・検体検査は1件ずつ。開始・採取の日時は空のまま（医師が選ぶ）", () => {
    const out = orderDrafts([rx("a", "ORAL-LOX60", "rp1"), inj, rx("b", "ORAL-REBA100", "rp1"), lab, proc], id);
    expect(out.map((x) => x.draft.kind)).toEqual(["prescription", "injection", "lab"]);
    const p = out[0].draft;
    if (p.kind !== "prescription") throw Error();
    expect(p.items.map((i) => i.drugCode)).toEqual(["ORAL-LOX60", "ORAL-REBA100"]);
    expect(p).toMatchObject({ timings: ["朝", "昼", "夕"], days: 3, category: "臨時", start: { day: null, timing: null }, origin: "manual" });
    const i = out[1].draft;
    if (i.kind !== "injection") throw Error();
    expect(i).toMatchObject({ route: "点滴静注", infusionMinutes: 120, rateMlPerH: null, start: { day: null, time: null }, days: 5, comment: "左腕", duplicate: null });
    const l = out[2].draft;
    if (l.kind !== "lab") throw Error();
    expect(l.tests.map((t) => t.code)).toEqual(["SET-ROUTINE"]);
    expect(l.collect).toEqual({ day: null, when: null, time: null, beforeDose: null });
    expect(out[0].label).toContain("内服");
    expect(out[1].label).toContain("注射");
  });
  it("持参薬は定期として写す（持参薬は薬剤師の鑑別からだけ）", () => {
    const own = { ...rx("c", "ORAL-LOX60", "rp2"), order: { ...rx("c", "ORAL-LOX60", "rp2").order, category: "持参薬" } } as OrderEntry;
    const [d] = orderDrafts([own], id);
    expect(d.draft.kind === "prescription" && d.draft.category).toBe("定期");
  });
  it("まとめて写すと、記事は本文を順に、オーダは下書きに（渡した順のまま）", () => {
    const r = batchDo([{ kind: "note", text: "一つ目", label: "" }, { kind: "order", entryId: "inj-1" }, { kind: "note", text: "二つ目", label: "" }, { kind: "order", entryId: "なし" }], [inj, note] as HistoryEntry[], id);
    expect(r.texts).toEqual(["一つ目", "二つ目"]);
    expect(r.drafts.map((d) => d.kind)).toEqual(["injection"]);
    expect(appendTexts("S) 書きかけ  \n", r.texts)).toBe("S) 書きかけ\n一つ目\n二つ目\n");
    expect(appendTexts("", ["一つ目"])).toBe("一つ目\n");
    expect(batchDoFlash(r)).toContain("記事 2件・オーダの下書き 1件");
  });
  it("セットの行は患者の日時・コメントを持たない", () => {
    const rows = setRowsOf([inj], id);
    expect(rows).toHaveLength(1);
    expect(rows[0].draft).toMatchObject({ id: "", sourceText: "", comment: null, start: { day: null, time: null } });
    expect(rows[0].label).toContain("注射");
  });
});

describe("中止の下書きを作れるオーダ", () => {
  it("有効な内服・注射で、監査・払出で止まっていないものだけ", () => {
    const stopped = rx("d", "ORAL-LOX60", "rp3", "中止");
    expect(stoppableOrders([rx("a", "ORAL-LOX60", "rp1"), stopped, inj, lab, proc], (x) => x === "a").map((e) => e.id)).toEqual(["inj-1"]);
  });
});

describe("本文をコピー", () => {
  it("見出し（種類・日時・書いた人）と本文を、渡した順に空行で区切る", () => {
    const text = recordsText([note, inj], today, () => "注射");
    expect(text.split("\n\n")).toEqual([
      "【記事】11/6（金） 08:00 山本（専攻医）\nS) 痛みは軽い\nA) 改善",
      "【注射】11/6（金） 09:00 山本（専攻医）\n大塚生食注 500mLソフトバッグ 500mL/袋　500mL\n点滴静注　1日1本　1回2時間　開始 11/6（金） 10:00　5日間　左腕",
    ]);
  });
});
