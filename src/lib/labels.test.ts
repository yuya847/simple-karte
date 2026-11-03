import { describe, expect, it } from "vitest";
import { labelItems } from "./labels";
import { labelFor } from "./mar";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

describe("ラベル", () => {
  const p = PATIENTS[0];
  const person = { patient: p, room: p.room, entries: p.history.filter((e): e is OrderEntry => e.kind === "order") };
  const { drugs } = labelItems(person, { y: 2026, m: 11, d: 3 }, 8 * 60);
  it("makes one drug label per dose for today and tomorrow", () => {
    expect(drugs.length).toBeGreaterThan(0);
    expect(new Set(drugs.map((d) => d.code)).size).toBe(drugs.length);
  });
  it("prints the code the bedside 照合 expects", () => {
    const d = drugs[0];
    const [prefix, at] = d.code.split("-");
    const entry = person.entries.find((e) => labelFor(e.id, Number(at)) === d.code);
    expect(entry, prefix).toBeDefined();
  });
});
