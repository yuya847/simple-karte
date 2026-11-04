import { describe, expect, it } from "vitest";
import { patientPlace } from "./patient-place";
import { placeOf } from "./results";
import { stayKindOf } from "./stay-labels";
import { placeOf as tabPlace } from "./tab-groups";

describe("patient place shared by results, stay labels and tabs", () => {
  it.each([
    ["er-1", "er", "救急", "受診"],
    ["er:er-1", "er", "救急", "受診"],
    ["opd:opd-1", "opd", "外来", "受診"],
    ["90010231", "ward", "病棟", "入院"],
    ["admitted-er-1", "ward", "病棟", "入院"],
  ] as const)("classifies %s consistently", (id, place, label, stay) => {
    expect(patientPlace(id)).toBe(place);
    expect(tabPlace(id)).toBe(place);
    expect(placeOf(id)).toBe(label);
    expect(stayKindOf({ id })).toBe(stay);
  });
});
