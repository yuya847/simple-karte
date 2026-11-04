import { describe, expect, it } from "vitest";
import { noticePatientIndex, NOTICE_HIGHLIGHT_MS } from "./notice-focus";

describe("notice patient focus", () => {
  const rows = [
    { patient: "p1", destination: "phs" },
    { patient: "p2", destination: "sheet" },
    { patient: "p1", destination: "sheet" },
    { patient: "p1", destination: "sheet" },
  ];
  it("selects the first matching patient on the destination screen", () => {
    expect(noticePatientIndex(rows, "p1", "sheet")).toBe(2);
    expect(noticePatientIndex(rows, "p1", "phs")).toBe(0);
    expect(noticePatientIndex(rows, "p1", "sheet")).toBe(2);
  });
  it("does not substitute another patient when the target is absent", () => {
    expect(noticePatientIndex(rows, "missing", "sheet")).toBe(-1);
    expect(noticePatientIndex([], "p1", "phs")).toBe(-1);
    expect(noticePatientIndex([{ patient: undefined, destination: undefined }], "", "sheet")).toBe(-1);
  });
  it("highlights for two seconds", () => expect(NOTICE_HIGHLIGHT_MS).toBe(2000));
});
