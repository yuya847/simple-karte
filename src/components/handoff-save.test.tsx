import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { emptyHandoff, handoffKey } from "@/lib/handoff";
import { HandoffView } from "./HandoffView";

it("送信の状態は保存確認まで保存待ちにし、保存後に送り済みにする", () => {
  const patient = PATIENTS[0];
  const h = { ...emptyHandoff("h", patient.id, "夜勤→日勤", "医師"), shiftLo: 510, role: "医師" as const, summary: "観察を続ける", sentAt: { day: 0, time: "08:20" } };
  const props = { people: [{ patient, room: patient.room, entries: [] }], today: { y: 2026, m: 11, d: 7 }, nowTime: "10:00", handoffs: { [handoffKey(patient.id, 510, "医師")]: h }, onSave: () => {}, onSend: () => {}, onReceive: () => {} };
  const pending = renderToStaticMarkup(<HandoffView {...props} saved={false} />);
  expect(pending).toContain("保存待ち");
  expect(pending).not.toContain(">送り済み<");
  const saved = renderToStaticMarkup(<HandoffView {...props} saved />);
  expect(saved).toContain(">送り済み<");
  expect(saved).not.toContain("保存待ち");
});
