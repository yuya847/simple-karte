import { describe, expect, it } from "vitest";
import { GENERAL_FLOORS, FLOORS, OTHER_FLOOR_BEDS, floorOf, nurseFor, doctorFor, BEDS } from "./ward";

describe("other floors (fictional)", () => {
  it("room numbers skip 4 and 9, and every bed is in a room of its floor", () => {
    for (const f of GENERAL_FLOORS) for (const r of f.rooms) expect(r.no, f.name).not.toMatch(/[49]$/);
    for (const b of OTHER_FLOOR_BEDS) {
      const room = FLOORS.flatMap((f) => f.rooms).find((r) => r.no === b.room);
      expect(room, b.room).toBeDefined();
      expect(room!.beds).toContain(b.bed);
    }
  });
  it("no bed is used twice and 4床室 are single-sex", () => {
    const all = [...BEDS, ...OTHER_FLOOR_BEDS].filter((b) => b.other);
    expect(new Set(all.map((b) => `${b.room}${b.bed}`)).size).toBe(all.length);
    const byRoom = new Map<string, Set<string>>();
    for (const b of OTHER_FLOOR_BEDS) byRoom.set(b.room, (byRoom.get(b.room) ?? new Set()).add(b.other!.sex));
    for (const [room, sexes] of byRoom) expect(sexes.size, room).toBe(1);
  });
  it("each bed has its floor, a nurse and a named doctor", () => {
    expect(floorOf("512")).toBe("5階東病棟");
    expect(floorOf("526")).toBe("5階南病棟");
    expect(floorOf("607")).toBe("6階東病棟");
    for (const b of OTHER_FLOOR_BEDS) {
      expect(nurseFor(b.room)).not.toBe("（未定）");
      expect(doctorFor(b.other!.department)).not.toBe(b.other!.department);
    }
  });
});
