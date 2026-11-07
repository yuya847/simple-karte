import { describe, expect, it } from "vitest";
import { migrateStandingLines, migrateStandingVersions, standingSeeds } from "./standing-seeds";
import type { StandingLine } from "./standing-lines";

const old = (id: string, text: string): StandingLine => ({ id, cat: "安静", text, start: { day: -3, time: "10:00" }, by: "山本（専攻医）", at: { day: -3, time: "10:00" } });

describe("保存された古い指示をかたまりに移す", () => {
  it("古い 1 行の初期データはかたまりに置き換わり、人が書いた行は残る", () => {
    const mine = { ...old("mine-1", "発熱時指示\nカロナール"), cat: "頓用" as const };
    const out = migrateStandingLines({ "90010198": [old("sl-198-2", "安静度：病棟内フリー"), old("sl-198-3", "体重が前日より1kg以上増えたら報告"), mine] });
    const ids = out["90010198"].map((l) => l.id);
    expect(ids).toContain("mine-1");
    expect(out["90010198"].every((l) => l.id === "mine-1" || l.text.includes("\n"))).toBe(true);
    expect(ids.sort()).toEqual([...standingSeeds["90010198"].map((l) => l.id), "mine-1"].sort());
  });
  it("初期データの項目の版（3 日前 10:00 の山本）は落とし、ほかの版は残す", () => {
    const v = (by: string, day: number) => ({ by, at: { day, time: "10:00" } });
    expect(migrateStandingVersions({ a: [v("山本（専攻医）", -3), v("研修医 田中", 0)] }).a).toEqual([v("研修医 田中", 0)]);
  });
});

it("項目から作った行を再び取り込まず、同内容同時刻の行は1件、別の終了履歴は保持する", () => {
  const line = old("a", "バイタル測定1日3回");
  const out = migrateStandingLines({ p: [line, {...line,id:"b"}, {...line,id:"fields",fromFields:true}, {...line,id:"stop",stop:{day:0,time:"12:00",by:"医師"}}] }, {});
  expect(out.p.map(l => l.id)).toEqual(["a","stop"]);
  expect(migrateStandingLines(out, {})).toEqual(out);
});
