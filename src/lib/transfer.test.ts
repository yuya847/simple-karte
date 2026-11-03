import { describe, expect, it } from "vitest";
import { transferSummary } from "./transfer";
import { PATIENTS } from "./patients";

describe("転院・施設の打診", () => {
  it("summarises without the name or ID", () => {
    const p = PATIENTS[0];
    const lines = transferSummary(p, [], { dietNow: "常食", restrained: false });
    const text = lines.join("\n");
    expect(text).not.toContain(p.name);
    expect(text).not.toContain(p.id);
    expect(lines[0]).toMatch(/^\d0代(男|女)性$/);
    expect(text).toContain(`病名：${p.admissionDiagnosis}`);
  });
});
