import { describe, expect, it } from "vitest";
import { ROLES, TABS, can, denyReason, home } from "./roles";

describe("roles", () => {
  it("only the doctor confirms orders; a nurse enters them as 口頭指示", () => {
    expect(can("医師", "order")).toBe(true);
    expect(can("看護師", "order")).toBe(false);
    expect(can("看護師", "order.verbal")).toBe(true);
    expect(can("薬剤師", "order")).toBe(false);
    expect(can("薬剤師", "order.verbal")).toBe(false);
  });

  it("says who may do a locked action", () => {
    expect(denyReason("医師", "order")).toBeNull();
    expect(denyReason("看護師", "consent")).toBe("説明と同意の記録は医師が行います（いまは看護師で入っています）。");
    expect(denyReason("医事課", "vitals")).toContain("看護師・医師");
  });

  it("every role starts on a tab it can see", () => {
    for (const r of ROLES) expect(TABS[r]).toContain(home(r));
  });

  it("only the laboratory takes in samples, enters results and phones panic values", () => {
    for (const a of ["lab.receive", "lab.result", "panic.call"] as const) {
      expect(can("臨床検査技師", a)).toBe(true);
      expect(can("医師", a)).toBe(false);
      expect(can("看護師", a)).toBe(false);
    }
    expect(denyReason("看護師", "lab.result")).toBe("検査結果の入力と確定は臨床検査技師が行います（いまは看護師で入っています）。");
  });

  it("the blood bank is the laboratory's; the bedside check is the ward's", () => {
    expect(can("臨床検査技師", "blood.bank")).toBe(true);
    expect(can("看護師", "blood.bank")).toBe(false);
    expect(can("看護師", "tx.bedside")).toBe(true);
    expect(can("臨床検査技師", "tx.bedside")).toBe(false);
  });

  it("病理: technologists take in and process; only a doctor (the pathologist) writes the report", () => {
    expect(can("臨床検査技師", "path.process")).toBe(true);
    expect(can("看護師", "path.process")).toBe(false);
    expect(can("医師", "path.report")).toBe(true);
    expect(denyReason("臨床検査技師", "path.report")).toBe("病理診断の報告書（病理医）は医師が行います（いまは臨床検査技師で入っています）。");
  });

  it("生理検査 is done and reported by the laboratory", () => {
    expect(can("臨床検査技師", "physio.exam")).toBe(true);
    expect(can("医師", "physio.exam")).toBe(false);
    expect(can("看護師", "physio.exam")).toBe(false);
  });

  it("放射線部: the technologist records the study, a doctor reads it, and the ordering doctor signs the 照射録", () => {
    expect(can("診療放射線技師", "ris.exam")).toBe(true);
    expect(can("医師", "ris.exam")).toBe(false);
    expect(can("医師", "ris.report")).toBe(true);
    expect(can("診療放射線技師", "ris.report")).toBe(false);
    expect(denyReason("看護師", "ris.sign")).toBe("照射録の署名（指示をした医師）は医師が行います（いまは看護師で入っています）。");
  });

  it("リハビリ: therapists record, the doctor makes the 実施計画書, and the doctor, a therapist or a nurse explains it", () => {
    expect(can("療法士", "rehab.therapy")).toBe(true);
    expect(can("看護師", "rehab.therapy")).toBe(false);
    expect(can("医師", "rehab.plan")).toBe(true);
    expect(can("療法士", "rehab.plan")).toBe(false);
    for (const r of ["医師", "療法士", "看護師"] as const) expect(can(r, "rehab.explain")).toBe(true);
    expect(can("MSW", "rehab.explain")).toBe(false);
  });

  it("医事課 does not write clinical notes", () => {
    expect(can("医事課", "note")).toBe(false);
    expect(can("MSW", "note")).toBe(true);
  });

  it("医事課 registers the insurance and records the bill; it starts on its own work list", () => {
    expect(can("医事課", "insurance")).toBe(true);
    expect(can("医事課", "settle")).toBe(true);
    // 医師・看護師 may also register it from the 患者基本情報 window (架空の病院の取り決め, 2026-11-04).
    expect(can("医師", "insurance")).toBe(true);
    expect(can("看護師", "insurance")).toBe(true);
    expect(can("薬剤師", "insurance")).toBe(false);
    expect(denyReason("薬剤師", "insurance")).toBe("保険の登録・変更（患者基本情報の保険・制度）は医事課・医師・看護師が行います（いまは薬剤師で入っています）。");
    expect(home("医事課")).toBe("iji");
  });
});
