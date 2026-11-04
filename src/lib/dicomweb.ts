// Server side only. An adapter to a LOCAL Orthanc (free DICOM server) for trying the 放射線部 flow on one's own
// computer (docs/dicom-local.md). It is OFF unless LOCAL_ORTHANC_URL is set, never runs on Vercel, and only talks
// to localhost. No user name, password or key is kept here: run Orthanc on localhost without authentication for
// the trial. It sends the worklist items the simulation builds (Orthanc's Worklists plugin REST API) and asks
// Orthanc's DICOMweb plugin which studies it holds (QIDO-RS).

export type LocalDicom = { enabled: true; url: string } | { enabled: false; why: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Whether the adapter may be used, and where Orthanc is. */
export function localDicomConfig(env: Record<string, string | undefined> = process.env): LocalDicom {
  if (env.VERCEL) return { enabled: false, why: "Vercel では使いません（手元の開発用だけ）。" };
  const raw = env.LOCAL_ORTHANC_URL?.trim();
  if (!raw) return { enabled: false, why: "LOCAL_ORTHANC_URL が設定されていないので、つなぎません（模擬だけ）。" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { enabled: false, why: "LOCAL_ORTHANC_URL が URL の形ではありません。" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { enabled: false, why: "LOCAL_ORTHANC_URL は http か https にしてください。" };
  if (!LOCAL_HOSTS.has(u.hostname)) return { enabled: false, why: "手元のコンピュータ（localhost）の Orthanc だけにつなぎます。" };
  if (u.username || u.password) return { enabled: false, why: "URL に利用者名やパスワードを入れないでください（手元の Orthanc は認証なしで試します）。" };
  return { enabled: true, url: `${u.origin}${u.pathname.replace(/\/$/, "")}` };
}

type Fetch = typeof fetch;

async function call(cfg: { url: string }, path: string, init: RequestInit = {}, f: Fetch = fetch): Promise<unknown> {
  const res = await f(`${cfg.url}${path}`, { ...init, signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!res.ok) throw new Error(`Orthanc が ${res.status} を返しました（${path}）`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** GET /system: Orthanc's name and version (to show that it is reachable). */
export async function orthancSystem(cfg: { url: string }, f?: Fetch): Promise<{ name: string; version: string }> {
  const s = (await call(cfg, "/system", {}, f)) as { Name?: string; Version?: string };
  return { name: s?.Name ?? "Orthanc", version: s?.Version ?? "" };
}

/** POST /worklists/create (Worklists plugin): one worklist item as {"Tags": {keyword: value}}. */
export async function createWorklist(cfg: { url: string }, tags: Record<string, unknown>, f?: Fetch): Promise<{ id: string }> {
  const r = (await call(cfg, "/worklists/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Tags: tags }) }, f)) as { ID?: string };
  return { id: r?.ID ?? "" };
}

export interface QidoStudy {
  studyUid: string;
  date: string;
  description: string;
  accession: string;
  modalities: string[];
  instances: number | null;
}

type DicomJson = Record<string, { Value?: unknown[] }>;
const first = (o: DicomJson, tag: string) => String(o[tag]?.Value?.[0] ?? "");

/** QIDO-RS (DICOMweb plugin): the studies of one patient, read from the DICOM JSON model. */
export async function qidoStudies(cfg: { url: string }, patientId: string, f?: Fetch): Promise<QidoStudy[]> {
  const q = new URLSearchParams({ PatientID: patientId, includefield: "00080061,00201208" });
  const list = ((await call(cfg, `/dicom-web/studies?${q}`, { headers: { Accept: "application/dicom+json" } }, f)) as DicomJson[] | null) ?? [];
  return list.map((s) => ({
    studyUid: first(s, "0020000D"),
    date: first(s, "00080020"),
    description: first(s, "00081030"),
    accession: first(s, "00080050"),
    modalities: (s["00080061"]?.Value ?? []).map(String),
    instances: s["00201208"]?.Value?.[0] !== undefined ? Number(s["00201208"].Value![0]) : null,
  }));
}
