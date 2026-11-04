// /api/dicom — only for trying the 放射線部 flow with a LOCAL Orthanc (docs/dicom-local.md). Off unless
// LOCAL_ORTHANC_URL is set; never used on Vercel; talks only to localhost (src/lib/dicomweb.ts).
//   GET                 → whether it is on (and Orthanc's version when it answers)
//   GET ?patientId=…    → the patient's studies in Orthanc (QIDO-RS)
//   POST {worklist: {…}} → one worklist item to Orthanc's Worklists plugin
// The patients are fictional; nothing is sent to Claude.

import { z } from "zod";
import { createWorklist, localDicomConfig, orthancSystem, qidoStudies } from "@/lib/dicomweb";

const PatientId = z.string().regex(/^[A-Za-z0-9-]{1,40}$/);
const Worklist = z.object({ worklist: z.record(z.string().regex(/^[A-Za-z]{2,64}$/), z.unknown()) });

export async function GET(request: Request) {
  const cfg = localDicomConfig();
  if (!cfg.enabled) return Response.json({ enabled: false, why: cfg.why });
  const pid = new URL(request.url).searchParams.get("patientId");
  try {
    if (pid !== null) {
      const id = PatientId.safeParse(pid);
      if (!id.success) return Response.json({ error: "患者 ID の形が違います。" }, { status: 400 });
      return Response.json({ enabled: true, studies: await qidoStudies(cfg, id.data) });
    }
    return Response.json({ enabled: true, system: await orthancSystem(cfg) });
  } catch (e) {
    return Response.json({ enabled: true, error: `手元の Orthanc に届きませんでした：${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const cfg = localDicomConfig();
  if (!cfg.enabled) return Response.json({ enabled: false, why: cfg.why }, { status: 404 });
  const body = Worklist.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "ワークリストの形が違います。" }, { status: 400 });
  try {
    return Response.json({ enabled: true, created: await createWorklist(cfg, body.data.worklist) });
  } catch (e) {
    return Response.json({ enabled: true, error: `手元の Orthanc に届きませんでした：${(e as Error).message}` }, { status: 502 });
  }
}
