// GET /api/byomei?q=… — search the official 傷病名マスター and 修飾語マスター.

import { searchDiseases, searchModifiers } from "@/lib/masters/byomei";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 40) ?? "";
  if (!q.trim()) return Response.json({ diseases: [], modifiers: [] });
  return Response.json({ diseases: searchDiseases(q), modifiers: searchModifiers(q) });
}
