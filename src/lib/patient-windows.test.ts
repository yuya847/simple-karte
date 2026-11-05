import { expect, it } from "vitest";
import { closeOtherPatientWindows } from "./patient-windows";
import { entryKey } from "./window-entry";

it("患者の違う注射・内服・検査・参照の窓を閉じ、同じ患者の窓だけを保つ", () => {
  const windows = ["add-injection", "add-rx", "add-lab", "add-imaging", "standing", "add-consult", "nutrition", "flowsheet"].map((key) => ({ key, patientId: "90010231" }));
  const er = { key: "add-injection", patientId: "er:er-3" };
  expect(closeOtherPatientWindows([...windows, er], er.patientId)).toEqual([er]);
  expect(closeOtherPatientWindows(windows, "90010231")).toEqual(windows);
  expect(closeOtherPatientWindows(windows, null)).toEqual([]);
  expect(windows).toHaveLength(8);
});

it("入れかけの保存先は患者・職種・入力欄ごとに分かれる", () => {
  const keys = [entryKey("90010231:医師", "injection.入れかけ"), entryKey("er:er-3:医師", "injection.入れかけ"), entryKey("90010231:看護師", "injection.入れかけ"), entryKey("90010231:医師", "rx.入れかけ")];
  expect(new Set(keys).size).toBe(4);
});
