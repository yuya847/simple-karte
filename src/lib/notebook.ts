import type { BroughtRow } from "./pharmacy";

/** Transcribe supported notebook lines without changing their written usage. */
export function readNotebook(text: string): Omit<BroughtRow, "match" | "checked" | "decision">[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const parts = line.trim().replace(/^Rp\d+[\s　]+/i, "").split(/[\s　]+/);
    const at = parts.findIndex((p) => /^1回\d/.test(p));
    if (at < 1) return [];
    const name = parts.slice(0, at).join(" ");
    const dose = parts[at].match(/^1回([\d.]+)(.*)$/)!;
    const usage = parts.slice(at + 1).join("　");
    const timings: BroughtRow["timings"] = [];
    if (!/頓用/.test(usage)) {
      if (/朝/.test(usage)) timings.push("朝");
      if (/昼/.test(usage)) timings.push("昼");
      if (/夕/.test(usage)) timings.push("夕");
      if (/眠前|就寝前|寝る前/.test(usage)) timings.push("眠前");
    }
    return [{ said: name, strength: name.match(/[\d.]+(?:mg|g|μg)/)?.[0] ?? "", amount: Number(dose[1]), unit: dose[2], usage, timings, daysLeft: Number(usage.match(/(\d+)日分/)?.[1]) || null, prn: /頓用/.test(usage) ? usage.replace(/頓用[\s　]*/, "") : null }];
  });
}
