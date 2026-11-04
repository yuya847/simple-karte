import { describe, expect, it } from "vitest";
import { consentDefaults, consentFromRecord, editImagingDraft } from "./imaging-consent";
import { checkDraft, type CheckContext } from "./drafts";
import { emptyImaging } from "./exams";
import { consentDone, signaturesMissing, type ConsentRecord } from "./consent";

describe("画像検査の同意と直書き", () => {
  it("取得時に現在の日時とログイン医師を入れ、打ち替えた値を保つ", () => {
    const now = new Date(2026, 10, 5, 14, 9);
    const c = consentDefaults(null, "取得済み", "研修医", now);
    expect(c).toMatchObject({ at: "2026/11/05 14:09", by: "研修医" });
    expect(consentDefaults({ ...c, by: "指導医", at: "2026/11/04 12:00" }, "取得済み", "研修医", now)).toMatchObject({ by: "指導医", at: "2026/11/04 12:00" });
    expect(consentDefaults(null, "未取得", "研修医", now).at).toBeNull();
  });
  it("目的・医師・日時を同じ下書きに反映する", () => {
    const d = emptyImaging("d", "CT");
    const edited = editImagingDraft(d, { purpose: " 肺炎の経過 ", by: "指導医", at: "11/5 12:00" });
    expect(edited).toMatchObject({ id: "d", purpose: " 肺炎の経過 ", consent: { by: "指導医", at: "11/5 12:00" } });
    const ctx = { activeOrders: [], labOrders: [], drafts: [], nowTime: "12:00", fmtDay: String, describe: () => "" } as CheckContext;
    const contrast = { ...edited, contrast: "造影" as const };
    expect(checkDraft(contrast, ctx).filter((i) => ["purpose", "consent"].includes(i.key) && i.level !== "info")).toEqual([]);
    expect(d.purpose).toBeNull();
    expect(editImagingDraft(edited, { purpose: " " }).purpose).toBeNull();
  });
  it("患者と医師の署名と同意の選択を確認し、拒否・撤回を優先する", () => {
    const r: ConsentRecord = { id: "c", patientId: "p", code: "CONSENT-CT-CONTRAST", status: "説明前", createdAt: { day: 0, time: "12:00" }, explainedAt: { day: 0, time: "12:00" }, explainedBy: "医師", answers: {}, choice: "同意する", signatures: ["本人", "説明した医師"].map((role) => ({ role: role as "本人" | "説明した医師", name: "架空", dataUrl: "data:image/png;base64,aA==", at: { day: 0, time: "12:00" } })) };
    expect(consentDone(r)).toBe(true);
    expect(consentFromRecord(r)?.state).toBe("取得済み");
    expect(consentDone({ ...r, status: "撤回" })).toBe(false);
    expect(consentDone({ ...r, choice: "同意しない" })).toBe(false);
    expect(signaturesMissing([{ ...r.signatures![0], dataUrl: "" }], false)).toEqual(["本人", "説明した医師"]);
  });
});
