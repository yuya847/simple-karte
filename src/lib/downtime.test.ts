import { describe, expect, it } from "vitest";
import { downtimeBody, downtimeDocument, downtimeSnapshot, esc, forgetDowntime, keepDowntime, keptDowntime, latestLabs, DOWNTIME_STORE } from "./downtime";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { OrderEntry } from "./types";
import type { WorkPatient } from "./worksheet";

const today = { y: 2026, m: 11, d: 4 };
const people: WorkPatient[] = PATIENTS.map((p, i) => ({ patient: p, room: ["512", "515B", "508A", "511"][i] ?? `50${i}`, entries: currentEntries(p).filter((e): e is OrderEntry => e.kind === "order") }));
const make = (limited: (id: string) => boolean = () => false) => downtimeSnapshot(people, { today, nowAbs: 600, mar: {}, sessionStart: 480, limited, by: "看護師 佐藤", place: "5階東病棟", madeAt: "2026/11/4 10:00" });

describe("障害時の参照", () => {
  it("gathers each patient's essentials, in room order", () => {
    const s = make();
    expect(s.patients.map((p) => p.room)).toEqual([...s.patients.map((p) => p.room)].sort());
    const withOrders = s.patients.find((p) => p.orders.length > 0)!;
    expect(withOrders.orders[0].kind).toMatch(/注射|内服|処置|検体検査|画像検査|生理検査|食事|その他/);
    // Today's doses carry the time and what the 与薬 record says (none here: 予定 or 未入力).
    const doses = s.patients.flatMap((p) => p.doses);
    expect(doses.length).toBeGreaterThan(0);
    expect(doses.every((d) => /^\d\d:\d\d$|必要時|時刻の指定なし/.test(d.time))).toBe(true);
    expect(s.patients.some((p) => p.vitals?.includes("BT"))).toBe(true);
  });

  it("marks the latest lab values against the reference range", () => {
    const p = PATIENTS.find((x) => x.labs.length > 0)!;
    const labs = latestLabs(p, today)!;
    expect(labs.when).toMatch(/^\d+\/\d+/);
    expect(labs.items.length).toBeGreaterThan(0);
  });

  it("writes only the safety essentials of a limited chart", () => {
    const first = people[0].patient.id;
    const s = make((id) => id === first);
    const p = s.patients.find((x) => x.id === first)!;
    expect(p.limited).toBe(true);
    expect(p.orders).toEqual([]);
    expect(p.doses).toEqual([]);
    expect(downtimeBody(s)).toContain("閲覧制限のある患者です");
  });

  it("escapes every value and puts no script in the page", () => {
    const s = make();
    s.patients[0] = { ...s.patients[0], name: `<script>alert(1)</script>`, allergies: [`"><img src=x onerror=alert(1)>`] };
    const html = downtimeDocument(s);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
    expect(esc(`a&b<'"`)).toBe("a&amp;b&lt;&#39;&quot;");
  });

  it("keeps the page in this browser and reads it back (and does not throw when storage is not allowed)", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(keepDowntime(make(), store)).toBe(true);
    expect(m.has(DOWNTIME_STORE)).toBe(true);
    const kept = keptDowntime(store)!;
    expect(kept.count).toBe(PATIENTS.length);
    expect(kept.body).toContain("障害時の参照");
    forgetDowntime(store);
    expect(keptDowntime(store)).toBeNull();
    const broken = { setItem: () => { throw new Error("quota"); }, getItem: () => "{壊れた" };
    expect(keepDowntime(make(), broken)).toBe(false);
    expect(keptDowntime(broken)).toBeNull();
  });
});
