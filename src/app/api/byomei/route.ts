// GET /api/byomei?q=… — search the official 傷病名マスター and 修飾語マスター.
// GET /api/byomei?keys=8831322,5070003 — 病名管理番号 and 病名交換用コード of those 傷病名コード (up to 60).

import { exactDisease, diseaseKeysOf, searchDiseases, searchModifiers } from "@/lib/masters/byomei";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const exact = params.get("exact");
  if (exact !== null) return Response.json(exactDisease(exact.slice(0, 100)));
  const keys = params.get("keys");
  if (keys !== null) {
    const codes = keys
      .split(",")
      .map((c) => c.trim())
      .filter((c) => /^\d{7}$/.test(c))
      .slice(0, 60);
    return Response.json({ keys: diseaseKeysOf(codes) });
  }
  const q = params.get("q")?.slice(0, 40) ?? "";
  if (!q.trim()) return Response.json({ diseases: [], modifiers: [] });
  return Response.json({ diseases: searchDiseases(q), modifiers: searchModifiers(q) });
}
