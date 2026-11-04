// スキャン取込: paper documents or photos (image or PDF) attached to a patient's 文書, with the type, the
// document's date and who took them in. Images are made smaller in the browser (JPEG) before they are kept;
// a PDF is kept as it is when it is small enough. They are kept with the day's records (one row of at most
// 5MB with everything else), so each file and all of them together have a limit.
//
// This prototype takes in paper that is kept as it is (運用の利便性のため, 安全管理ガイドライン システム運用編 16.2:
// the scan is reference information). Fictional samples only — never a real patient's paper.

export const SCAN_SOURCES = [
  {
    label: "厚生労働省・デジタル庁「中小病院向け電子カルテ及びレセプトコンピュータ標準仕様書（基本要件）第1.0版」第1章 別紙様式1 項番168（診療に必要な紙文書を電子データで保管できること（スキャン等））",
    url: "https://www.mhlw.go.jp/content/10800000/001683680.pdf",
  },
  {
    label: "厚生労働省「医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編」16 紙媒体等で作成した医療情報の電子化（16.1・16.2）",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
];

export const SCAN_TYPES = ["同意書", "紹介状（他院から）", "検査結果（他院）", "問診票", "お薬手帳", "その他"] as const;
export type ScanType = (typeof SCAN_TYPES)[number];

export const SCAN_LIMITS = {
  /** One file as kept (base64 included). */
  perFile: 400_000,
  /** All the scans of the day together (the rest of the 5MB row is the records). */
  total: 1_500_000,
  /** The original file before it is made smaller. */
  original: 15_000_000,
} as const;

/** Sizes and JPEG qualities tried in order until the image fits SCAN_LIMITS.perFile. */
export const SHRINK_STEPS: { maxSide: number; quality: number }[] = [
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1400, quality: 0.7 },
  { maxSide: 1200, quality: 0.65 },
  { maxSide: 1000, quality: 0.6 },
  { maxSide: 800, quality: 0.55 },
];

export interface ScanDoc {
  id: string;
  patientId: string;
  type: ScanType;
  /** The document's own date "YYYY-MM-DD". */
  docDate: string;
  note: string;
  by: string;
  role: string;
  at: { day: number; time: string };
  mime: "image/jpeg" | "application/pdf";
  /** data: URL of what is kept ("" once withdrawn). */
  dataUrl: string;
  /** Bytes of the data: URL as kept. */
  bytes: number;
  width?: number;
  height?: number;
  original: { name: string; type: string; bytes: number };
  /** Made by 架空の見本を作る. */
  sample?: boolean;
  /** 取り消し: taken in by mistake. The line stays; the image is not kept. */
  withdrawn?: { by: string; at: { day: number; time: string }; reason: string };
}

/** The size that fits in maxSide × maxSide, keeping the shape (never larger than the original). */
export function fitSize(w: number, h: number, maxSide: number): { w: number; h: number } {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** What a kept file takes (the data: URL's characters). */
export const keptBytes = (dataUrl: string) => dataUrl.length;

/** Everything kept now (withdrawn ones keep nothing). */
export const totalKept = (scans: readonly ScanDoc[]) => scans.reduce((n, s) => n + (s.withdrawn ? 0 : s.bytes), 0);

const OK_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

/** Why the chosen file cannot be taken in, or null. */
export function fileProblem(f: { type: string; size: number; name: string }): string | null {
  if (f.size > SCAN_LIMITS.original) return `ファイルが大きすぎます（${mb(f.size)}）。${mb(SCAN_LIMITS.original)}までにしてください。`;
  if (f.type === "application/pdf") return f.size > SCAN_LIMITS.perFile ? `PDF はそのまま保存するので、${kb(SCAN_LIMITS.perFile)}までです（このファイルは ${kb(f.size)}）。画像（写真）にするか、小さくしてください。` : null;
  if (OK_IMAGE.includes(f.type) || (!f.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))) return null;
  return "取り込めるのは画像（JPEG・PNG など）か PDF です。";
}

/** Why a file of this many bytes cannot be kept now, or null. */
export function fitProblem(bytes: number, scans: readonly ScanDoc[]): string | null {
  if (bytes > SCAN_LIMITS.perFile) return `小さくしても ${kb(bytes)} あり、1件の上限 ${kb(SCAN_LIMITS.perFile)} を超えます。`;
  const left = SCAN_LIMITS.total - totalKept(scans);
  if (bytes > left) return `今日の取込の合計の上限（${mb(SCAN_LIMITS.total)}）を超えます（残り ${kb(Math.max(0, left))}）。いらない取込を取り消すか、明日にしてください。`;
  return null;
}

/** Why the form cannot be saved, or null. */
export function formProblem(v: { type: string; docDate: string }): string | null {
  if (!SCAN_TYPES.includes(v.type as ScanType)) return "文書の種類を選んでください。";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.docDate)) return "文書の日付を入れてください。";
  return null;
}

export const kb = (n: number) => `${Math.ceil(n / 1000).toLocaleString()}KB`;
export const mb = (n: number) => `${(n / 1_000_000).toFixed(1)}MB`;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** The scans read back from the day's records (anything that does not fit is left out). */
export function validScans(v: unknown): ScanDoc[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is ScanDoc => {
    if (!isObj(s) || !isObj(s.at) || !isObj(s.original)) return false;
    const urlOk = s.dataUrl === "" || (typeof s.dataUrl === "string" && /^data:(image\/jpeg|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(s.dataUrl) && s.dataUrl.length <= SCAN_LIMITS.perFile);
    return typeof s.id === "string" && typeof s.patientId === "string" && SCAN_TYPES.includes(s.type as ScanType) && typeof s.docDate === "string" && typeof s.by === "string" && (s.mime === "image/jpeg" || s.mime === "application/pdf") && urlOk && typeof s.bytes === "number";
  });
}

/** Take a scan back (taken in by mistake): the line stays with the reason, the image is no longer kept. */
export const withdraw = (s: ScanDoc, by: string, at: { day: number; time: string }, reason: string): ScanDoc => ({ ...s, dataUrl: "", bytes: 0, withdrawn: { by, at, reason } });

/** A data: URL as bytes, for opening it in a new tab. */
export function dataUrlBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}
