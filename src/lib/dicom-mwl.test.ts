import { describe, expect, it } from "vitest";
import { accessionOf, ctDoseConcepts, fictionalBirthDate, mppsCreate, mppsSet, mwlItem, personName, simulatedAcquisition, studyUidOf, toDicomJson, toOrthancTags, worklistFor, type DicomAttr } from "./dicom-mwl";
import { PATIENTS } from "./patients";
import { demoRisOrders, initialRisDesk, putWork, risRows } from "./ris";

const today = { y: 2026, m: 11, d: 4 };
const orders = demoRisOrders(600);
const people = PATIENTS.map((p) => ({ patient: p, room: `5階東 ${p.room}`, entries: orders[p.id] ?? [] }));
const base = initialRisDesk(600);
const ct0 = risRows(people, base).find((r) => r.orderId === "o-ris-demo2")!;
// 受付して CT室に割り当てた
const desk = putWork(base, ct0, (w) => ({ ...w, arrived: { day: 0, time: "14:40", by: "技師" }, room: "CT1", slot: { day: 0, time: "15:00" } }));
const rows = risRows(people, desk);
const ct = rows.find((r) => r.orderId === "o-ris-demo2")!;
const flat = (attrs: DicomAttr[]): DicomAttr[] => attrs.flatMap((a) => [a, ...(a.items ?? []).flatMap(flat)]);
const get = (attrs: DicomAttr[], keyword: string) => flat(attrs).find((a) => a.keyword === keyword)?.value;

describe("Modality Worklist（PS3.4 Table K.6-1）", () => {
  it("only the device it was assigned to gets a study that was taken in", () => {
    expect(worklistFor("SK_CT1", rows).map((r) => r.orderId)).toEqual(["o-ris-demo2"]);
    expect(worklistFor("SK_DR1", rows)).toEqual([]);
    // 依頼のまま（受付前）のものはワークリストに出ない
    expect(worklistFor("SK_CT1", risRows(people, base))).toEqual([]);
  });
  it("carries the attributes and tags the standard defines, filled from the order and the patient", () => {
    const item = mwlItem(ct, today);
    expect(flat(item).map((a) => `${a.tag} ${a.keyword}`)).toEqual(
      expect.arrayContaining([
        "0040,0100 ScheduledProcedureStepSequence",
        "0040,0001 ScheduledStationAETitle",
        "0040,0002 ScheduledProcedureStepStartDate",
        "0040,0003 ScheduledProcedureStepStartTime",
        "0008,0060 Modality",
        "0008,0050 AccessionNumber",
        "0032,1060 RequestedProcedureDescription",
        "0010,0010 PatientName",
        "0010,0020 PatientID",
        "0010,0030 PatientBirthDate",
        "0010,0040 PatientSex",
        "0020,000D StudyInstanceUID",
      ]),
    );
    expect(get(item, "ScheduledStationAETitle")).toBe("SK_CT1");
    expect(get(item, "ScheduledProcedureStepStartDate")).toBe("20261104");
    expect(get(item, "ScheduledProcedureStepStartTime")).toBe("150000");
    expect(get(item, "Modality")).toBe("CT");
    expect(get(item, "PatientName")).toBe("=森^久美子=モリ^クミコ");
    expect(get(item, "PatientSex")).toBe("F");
    expect(get(item, "PregnancyStatus")).toBe("0001");
    expect(get(item, "RequestedProcedureDescription")).toBe("CT 腹部・骨盤 単純＋造影");
  });
  it("makes the same identifiers for the same order, within the lengths of their VRs", () => {
    expect(accessionOf("o-ris-demo2")).toBe(accessionOf("o-ris-demo2"));
    expect(accessionOf("o-ris-demo2")).toMatch(/^SK\d{8}$/);
    const uid = studyUidOf("o-ris-demo2");
    expect(uid).toMatch(/^2\.25\.[1-9]\d*$/);
    expect(uid.length).toBeLessThanOrEqual(64);
    expect(studyUidOf("o-ris-demo3")).not.toBe(uid);
  });
  it("a fictional birth date that gives the age today", () => {
    const b = fictionalBirthDate("90010260", 64, today);
    const [y, m, d] = [Number(b.slice(0, 4)), Number(b.slice(4, 6)), Number(b.slice(6))];
    expect(today.y - y - (m > today.m || (m === today.m && d > today.d) ? 1 : 0)).toBe(64);
    expect(personName("北村 博", "キタムラ ヒロシ")).toEqual({ ideographic: "北村^博", phonetic: "キタムラ^ヒロシ", text: "=北村^博=キタムラ^ヒロシ" });
  });
  it("encodes to the DICOM JSON model and to Orthanc's worklist JSON", () => {
    const json = toDicomJson(mwlItem(ct, today));
    expect(json["00100010"]).toEqual({ vr: "PN", Value: [{ Ideographic: "森^久美子", Phonetic: "モリ^クミコ" }] });
    expect(json["00400100"].vr).toBe("SQ");
    expect((json["00400100"].Value as Record<string, { Value?: unknown[] }>[])[0]["00400001"].Value).toEqual(["SK_CT1"]);
    expect(json["001021C0"]).toEqual({ vr: "US", Value: [1] });
    const tags = toOrthancTags(mwlItem(ct, today));
    expect(tags.PatientID).toBe("90010260");
    expect((tags.ScheduledProcedureStepSequence as Record<string, string>[])[0].Modality).toBe("CT");
  });
});

describe("MPPS（PS3.4 Table F.7.2-1）", () => {
  it("N-CREATE is sent IN PROGRESS, N-SET ends COMPLETED with the series", () => {
    const create = mppsCreate(ct, today, { day: 0, time: "15:02" });
    expect(get(create, "PerformedProcedureStepStatus")).toBe("IN PROGRESS");
    expect(get(create, "PerformedStationAETitle")).toBe("SK_CT1");
    expect(get(create, "AccessionNumber")).toBe(accessionOf("o-ris-demo2"));
    const set = mppsSet(ct, today, { day: 0, time: "15:20" }, "COMPLETED", "放射線技師 松本", 2);
    expect(get(set, "PerformedProcedureStepStatus")).toBe("COMPLETED");
    expect(get(set, "PerformedProcedureStepEndTime")).toBe("152000");
    expect(set.find((a) => a.keyword === "PerformedSeriesSequence")?.items).toHaveLength(2);
    expect(mppsSet(ct, today, { day: 0, time: "15:20" }, "DISCONTINUED", "x", 2).find((a) => a.keyword === "PerformedSeriesSequence")?.items).toEqual([]);
  });
});

describe("模擬の撮影条件と線量", () => {
  it("gives the same fictional numbers every time; a two-phase CT has two series and twice the length", () => {
    const a = simulatedAcquisition(ct);
    expect(simulatedAcquisition(ct)).toEqual(a);
    expect(a.series).toBe(2);
    expect(a.exposure.kv).toBe(120);
    expect(a.dose.dlp).toBe(Math.round(a.dose.ctdiVol! * 45 * 2));
    expect(ctDoseConcepts(a.dose).map((c) => `${c.code} ${c.meaning} ${c.unit}`)).toEqual(["113830 Mean CTDIvol mGy", "113838 DLP mGy.cm"]);
  });
  it("an X-ray gets the films of its views and an entrance air kerma", () => {
    const xr = rows.find((r) => r.orderId === "o-ris-demo3")!;
    const a = simulatedAcquisition(xr);
    expect(a.exposure.films).toBe(1);
    expect(a.exposure.kv).toBe(120);
    expect(a.dose.esak).toBeGreaterThan(0);
  });
});
