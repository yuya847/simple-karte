import { createHmac } from "node:crypto";
import type { Patient } from "../types";
import { redact } from "./redact";

// redact は画面（IC を声で記録）でも使うので、node:crypto を読まない redact.ts に置いた。
export { redact };

export function pseudonym(id: string) {
  return `P-${createHmac("sha256", process.env.MCP_PSEUDONYM_SECRET || "simple-karte-fictional-mcp-development-v1").update(id).digest("hex").slice(0, 12).toUpperCase()}`;
}
export const relativeDay = (day: number) => day === 0 ? "今日" : day < 0 ? `${-day}日前` : `${day}日後`;
/** Recursively scrub selected clinical fields; offset keys become relative labels. */
export function scrub(value: unknown, patients: Patient[]): unknown {
  if (typeof value === "string") return redact(value, patients);
  if (Array.isArray(value)) return value.map(v => scrub(v, patients));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !["id", "author", "by", "reportedBy", "writtenAt", "versions", "figures", "corrected"].includes(k)).map(([k,v]) => [k, typeof v === "number" && ["day", "collectedOn", "reportedOn"].includes(k) ? relativeDay(v) : scrub(v, patients)]));
  return value;
}
