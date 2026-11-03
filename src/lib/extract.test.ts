import { describe, expect, it } from "vitest";
import { emptyQuery, runExtract, toCsv } from "./extract";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const entriesOf = (p: (typeof PATIENTS)[number]) => p.history.filter((e): e is OrderEntry => e.kind === "order");
const run = (q: Partial<ReturnType<typeof emptyQuery>>) => runExtract({ ...emptyQuery(), ...q }, PATIENTS, entriesOf, () => [], (p) => `5階東 ${p.room}`);

describe("データ抽出", () => {
  it("keeps every patient with no condition, and narrows by each condition", () => {
    expect(run({})).toHaveLength(PATIENTS.length);
    expect(run({ ageMin: 80 }).map((r) => r.name)).toEqual(PATIENTS.filter((p) => p.age >= 80).map((p) => p.name));
    expect(run({ diagnosis: "肺炎" }).map((r) => r.name)).toEqual(["大浦 トメ"]);
  });

  it("compares the latest lab value", () => {
    const rows = run({ lab: { code: "CRP", op: "≥", value: 5 } });
    expect(rows.every((r) => r.lab.startsWith("CRP "))).toBe(true);
  });

  it("writes CSV that opens in Excel (BOM, quoted, quotes doubled)", () => {
    const csv = toCsv([{ id: "1", name: 'A "B"', age: 70, sex: "男", where: "512", day: 3, diagnoses: "肺炎、心不全", drugs: "", lab: "" }]);
    expect(csv.startsWith("﻿\"ID\",\"氏名\"")).toBe(true);
    expect(csv).toContain('"A ""B"""');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
