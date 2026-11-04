import { expect, it } from "vitest";
import { numberedOptionIndex, optionNumber } from "./numbered-options";
it("numbers the first nine displayed choices and rejects missing or disabled choices", () => {
  expect(Array.from({ length: 11 }, (_, i) => optionNumber(i))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", null, null]);
  const options = [{}, { disabled: true }, {}];
  expect(numberedOptionIndex("1", options)).toBe(0);
  expect(numberedOptionIndex("3", options)).toBe(2);
  for (const key of ["2", "4", "0", "a", "Enter"]) expect(numberedOptionIndex(key, options)).toBeNull();
});
