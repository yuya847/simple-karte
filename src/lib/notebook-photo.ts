// お薬手帳を撮って持参薬の表にする: only the part of each photo the user boxed (the drug lines, not the
// name, birth date or address) is cut out, made smaller in the browser (JPEG) and sent to /api/mochikomi.
// Nothing is boxed at first, and nothing can be sent until every page is boxed. The calculations are
// here (pure); the canvas work is in NotebookCapture.

import { fitSize } from "./scans";

export const PHOTO_LIMITS = {
  /** Pages sent together. */
  pages: 4,
  /** Long side of the boxed part as sent. */
  maxSide: 1600,
  /** One boxed part as sent (base64 characters). */
  perImage: 1_200_000,
  /** All the pages of one request together (the hosting's request limit is 4.5MB). */
  total: 3_600_000,
  /** The smaller side of a box, in pixels of the photo, below which it is too small to read. */
  minSide: 40,
  /** The photo before it is made smaller. */
  original: 20_000_000,
} as const;

/** JPEG qualities tried in order until the boxed part fits PHOTO_LIMITS.perImage. */
export const SEND_QUALITIES = [0.85, 0.75, 0.65, 0.55] as const;

/** A box on a photo, as fractions (0–1) of its width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The box between two points (fractions of the shown photo, dragged in any direction), kept inside the photo. */
export function boxFrom(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  const x1 = clamp01(Math.min(a.x, b.x)), x2 = clamp01(Math.max(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y)), y2 = clamp01(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The box in whole pixels of the photo, or null when it is too small to read. */
export function boxPixels(box: Box, photo: { w: number; h: number }, minSide: number = PHOTO_LIMITS.minSide): { x: number; y: number; w: number; h: number } | null {
  const x = Math.round(clamp01(box.x) * photo.w);
  const y = Math.round(clamp01(box.y) * photo.h);
  const w = Math.min(photo.w - x, Math.round(box.w * photo.w));
  const h = Math.min(photo.h - y, Math.round(box.h * photo.h));
  return w >= minSide && h >= minSide ? { x, y, w, h } : null;
}

/** The size the boxed part is drawn at to be sent: the long side at most maxSide, never larger than the box. */
export const sendSize = (w: number, h: number, maxSide: number = PHOTO_LIMITS.maxSide) => fitSize(w, h, maxSide);

/** The JPEG bytes (base64) of a data: URL, as sent. */
export const jpegData = (dataUrl: string) => dataUrl.replace(/^data:image\/jpeg;base64,/, "");

const JPEG_BASE64 = /^\/9j\/[A-Za-z0-9+/]+=*$/;

/** Why these boxed parts (base64 JPEG) cannot be sent, or null. Checked in the browser and again on the server. */
export function sendProblem(images: readonly string[]): string | null {
  if (images.length === 0) return "薬の行を囲んでください。";
  if (images.length > PHOTO_LIMITS.pages) return `一度に送れるのは${PHOTO_LIMITS.pages}ページまでです。`;
  if (images.some((s) => !JPEG_BASE64.test(s))) return "画像を読めませんでした。撮り直してください。";
  if (images.some((s) => s.length > PHOTO_LIMITS.perImage)) return "囲んだ部分が大きすぎます。薬の行だけを囲んでください。";
  if (images.reduce((n, s) => n + s.length, 0) > PHOTO_LIMITS.total) return "合わせて大きすぎます。ページを分けて読み取ってください。";
  return null;
}

/** Why this file cannot be taken in as a photo of the notebook, or null. */
export function photoFileProblem(f: { type: string; size: number; name: string }): string | null {
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "PDF は囲めないため、写真か画像（スクリーンショットなど）で取り込んでください。";
  if (f.size > PHOTO_LIMITS.original) return "画像が大きすぎます（20MB まで）。";
  if (f.type.startsWith("image/") || (!f.type && /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name))) return null;
  return "取り込めるのは画像（JPEG・PNG など）です。";
}

/** The fictional notebook pages for 見本で試す (public/samples). */
export const SAMPLE_PAGES = ["/samples/okusuri-techo-1.jpg", "/samples/okusuri-techo-2.jpg"] as const;
