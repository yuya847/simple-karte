import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DRUGS } from "./master";
import { ADOPTED_ROWS } from "./formulary-expansion";
import { chooseDiluent, diluentChoices, SALINE_CODES } from "./inj-diluent";

const rows = [{ drugCode: "INJ-CEZ1", amount: "1", unit: "g" }];
describe("抗菌薬の溶解の選択", () => {
  it("50mL は別名で検索でき、追加規格のコード・薬価は公開マスターと一致する", () => {
    for (const alias of ["生食50", "NS50", "生食 50"]) expect(DRUGS.find(d => d.aliases.includes(alias))?.code).toBe(SALINE_CODES[50]);
    const master = JSON.parse(readFileSync("src/data/generated/y.json", "utf8")).rows as string[][];
    for (const code of ["643310190", "622830801", "643310476"]) {
      const source = master.find(r => r[0] === code)!;
      const adopted = ADOPTED_ROWS.find(r => r[0] === code)!;
      expect(adopted[1]).toBe(source[1]);
      expect(adopted[3]).toBe(Number(source[5]));
    }
  });
  it("粉末抗菌薬で聞き、輸液・静注・液剤では聞かない", () => {
    expect(diluentChoices(rows, null)).toEqual([50, 100]);
    expect(diluentChoices(rows, "点滴静注")).toEqual([50, 100]);
    expect(diluentChoices(rows, "静注")).toEqual([]);
    expect(diluentChoices([{ drugCode: "INJ-NS100", amount: "1", unit: "本" }, ...rows], "点滴静注")).toEqual([]);
    for (const d of DRUGS.filter(d => d.kind === "抗菌薬" && d.volumeMl)) expect(diluentChoices([{ drugCode: d.code, amount: "1", unit: d.units[0] }], "点滴静注")).toEqual([]);
  });
  it("同じRpの末尾に加え、主薬・回数・時刻を保持し、輸液があれば聞かない", () => {
    const rp = { rows, sched: 2, doseTimes: ["09:00", "21:00"] };
    const mixed = chooseDiluent(rp, 50);
    expect(mixed.rows).toEqual([...rows, { drugCode: SALINE_CODES[50], amount: "50", unit: "mL" }]);
    expect(mixed.sched).toBe(2);
    expect(mixed.doseTimes).toEqual(rp.doseTimes);
    expect(diluentChoices(mixed.rows, "点滴静注")).toEqual([]);
    expect(chooseDiluent(mixed, 100)).toBe(mixed);
  });
  it("入れないの記憶はRpに残る", () => {
    const declined = chooseDiluent({ rows }, null);
    expect(declined.rows).toEqual(rows);
    expect(diluentChoices(declined.rows, null, declined.diluentDeclined)).toEqual([]);
    expect(diluentChoices(rows, null)).not.toEqual([]);
  });
  it("バンコマイシン1g以上は単位を換算して100・250mLを先に出す", () => {
    for (const [amount, unit] of [["1", "g"], ["1000", "mg"], ["2", "V"]]) expect(diluentChoices([{ drugCode: "INJ-VCM05", amount, unit }], null)).toEqual([100, 250, 50]);
  });
});
