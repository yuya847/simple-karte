import { expect, it } from "vitest";
import { standingPending } from "./standing-pending";
import type { OtherChange } from "./worksheet";
it("指示を受けたら以前の未受け札を消す", () => {
 const row: OtherChange = { patientId: "p", key: "s|新規", kind: "指示簿", at: 600, timeKnown: true, room: "525D", name: "患者", text: { type: "指示簿", main: "観察", detail: "", author: "医師" } };
 expect(standingPending("p", [row], {}, false)).toBe(true);
 expect(standingPending("p", [row], { [row.key]: "10:05 看護師" }, false)).toBe(false);
});
