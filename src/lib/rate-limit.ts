// Best-effort limits for a public demo. Each serverless instance keeps its own counts.

const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 20;
const PER_INSTANCE = 300;
const hits = new Map<string, number[]>();
let instanceHits: number[] = [];

export function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  instanceHits = instanceHits.filter((t) => now - t < WINDOW_MS);
  const mine = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= PER_IP || instanceHits.length >= PER_INSTANCE) return true;
  mine.push(now);
  instanceHits.push(now);
  hits.set(ip, mine);
  return false;
}
