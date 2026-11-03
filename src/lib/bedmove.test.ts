import { describe, expect, it } from "vitest";
import { bedProblem } from "./admission";
import { findPatient } from "./patients";
import { BEDS, FLOORS, OTHER_FLOOR_BEDS, floorOf, isolationFor } from "./ward";

const all = { beds: [...BEDS, ...OTHER_FLOOR_BEDS], patient: findPatient };
const room = (no: string) => FLOORS.flatMap((f) => f.rooms).find((r) => r.no === no)!;

describe("転棟・転床", () => {
  it("keeps shared rooms single-sex on every floor", () => {
    expect(bedProblem(all, room("513"), "男")).toBe("女性の部屋です");
    expect(bedProblem(all, room("526"), "男")).toBeNull(); // 5階南の男性の部屋
    expect(bedProblem(all, room("525"), "男")).toBe("女性の部屋です");
    expect(bedProblem(all, room("502"), "男")).toBeNull(); // 個室
  });
  it("knows a move to another floor is 転棟", () => {
    expect(floorOf("512")).not.toBe(floorOf("607"));
  });
  it("marks the MRSA patient for contact precautions (a shared room is asked about)", () => {
    expect(isolationFor(findPatient("90010231")!.infections)).toBe("接触予防策");
  });
});
