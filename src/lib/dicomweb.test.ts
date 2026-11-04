import { describe, expect, it } from "vitest";
import { createWorklist, localDicomConfig, qidoStudies } from "./dicomweb";

describe("手元の Orthanc へのアダプタ", () => {
  it("is off unless LOCAL_ORTHANC_URL is set, and never on Vercel", () => {
    expect(localDicomConfig({}).enabled).toBe(false);
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "http://localhost:8042", VERCEL: "1" })).toEqual({ enabled: false, why: "Vercel では使いません（手元の開発用だけ）。" });
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "http://localhost:8042/" })).toEqual({ enabled: true, url: "http://localhost:8042" });
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "http://127.0.0.1:8042" }).enabled).toBe(true);
  });
  it("talks only to localhost, and refuses a URL with a user name or password", () => {
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "https://pacs.example.org" }).enabled).toBe(false);
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "http://orthanc:orthanc@localhost:8042" }).enabled).toBe(false);
    expect(localDicomConfig({ LOCAL_ORTHANC_URL: "ftp://localhost" }).enabled).toBe(false);
  });
  it("sends a worklist item as {Tags} and reads QIDO-RS answers in the DICOM JSON model", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.includes("/worklists/create")
        ? { ID: "wl-1", Path: "/worklists/wl-1" }
        : [{ "0020000D": { vr: "UI", Value: ["2.25.1"] }, "00080020": { vr: "DA", Value: ["20261104"] }, "00080061": { vr: "CS", Value: ["CT"] }, "00201208": { vr: "IS", Value: [140] } }];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const cfg = { url: "http://localhost:8042" };
    expect(await createWorklist(cfg, { PatientID: "90010260" }, fake)).toEqual({ id: "wl-1" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ Tags: { PatientID: "90010260" } });
    const studies = await qidoStudies(cfg, "90010260", fake);
    expect(calls[1].url).toBe("http://localhost:8042/dicom-web/studies?PatientID=90010260&includefield=00080061%2C00201208");
    expect(studies).toEqual([{ studyUid: "2.25.1", date: "20261104", description: "", accession: "", modalities: ["CT"], instances: 140 }]);
  });
});
