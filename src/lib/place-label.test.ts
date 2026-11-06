import { expect, it } from "vitest";
import { roomLabel, wardLabel } from "./place-label";
it("病棟と部屋の表記をそろえる", () => {
  expect(roomLabel("525", "D")).toBe("525D");
  expect(roomLabel("507-A")).toBe("507A");
  expect(wardLabel("525D")).toBe("5階南病棟");
  expect(wardLabel("606-B")).toBe("6階東病棟");
});
