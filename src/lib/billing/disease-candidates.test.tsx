import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiseaseCandidates } from "@/components/billing/DiseaseCandidates";
import { StickyStrip } from "@/components/StickyStrip";
import { RoleProvider } from "@/components/RoleContext";
import { checkDiseases } from "./disease-check";
import { withDiseaseRequest } from "./disease-request";
const c = checkDiseases({ today: "2026-11-06", month: "2026-11", diagnoses: [], entries: [{ kind: "order", id: "lab", day: 0, time: "08:00", author: "医師", status: "有効", order: { type: "lab", codes: ["LAB-HBA1C"], collect: { day: 0, time: "08:00" }, priority: "定時" } }] });
const saved = withDiseaseRequest([], c[0], "主治医", "医事課", "12:00", "2026-11-06");
describe("病名漏れ候補の表示", () => {
  it("確かめる候補と依頼ボタンを表示し、既依頼は押せない", () => {
    const props = { patientId: "p", candidates: c, onDiseaseRequest: () => {} };
    const html = renderToStaticMarkup(<RoleProvider value="医事課"><DiseaseCandidates {...props} /></RoleProvider>);
    expect(html).toContain("確かめる");
    expect(html).toContain("病名漏れの候補");
    expect(html).toContain("医師に病名の追加を頼む");
    const requested = renderToStaticMarkup(<RoleProvider value="医事課"><DiseaseCandidates {...props} diseaseRequests={{ p: saved }} /></RoleProvider>);
    expect(requested).toContain('disabled=""');
    expect(requested).toContain("主治医に依頼済み");
    expect(renderToStaticMarkup(<DiseaseCandidates {...props} candidates={[]} />)).toBe("");
  });
  it("医師側の付箋には病名を足す入口を出す", () => {
    const props = { stickies: saved, onAdd: () => {}, onRemove: () => {}, newId: () => "new", nowTime: "12:00", onDiagnoses: () => {} };
    expect(renderToStaticMarkup(<RoleProvider value="医師"><StickyStrip {...props} /></RoleProvider>)).toContain("病名を足す");
    expect(renderToStaticMarkup(<RoleProvider value="医事課"><StickyStrip {...props} /></RoleProvider>)).not.toContain("病名を足す");
  });
});
