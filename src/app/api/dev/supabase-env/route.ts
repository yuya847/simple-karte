// 手元の開発用だけ: the two Supabase values the developer types into /setup are written to .env.local and
// to the linked Vercel project (production) with the Vercel CLI. Does nothing outside `next dev` and
// localhost. Values are checked against the formats below and never written to a log.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const URL_RE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const KEY_RE = /^sb_publishable_[A-Za-z0-9_-]{10,200}$/;

function vercelEnvAdd(name: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile("vercel", ["env", "add", name, "production", "--force"], { cwd: process.cwd(), timeout: 60000 }, (err, _out, stderr) => {
      resolve(err ? (stderr || err.message).split("\n").filter(Boolean).slice(-2).join(" ") : null);
    });
    child.stdin?.end(value);
  });
}

async function writeEnvLocal(values: Record<string, string>) {
  const file = path.join(process.cwd(), ".env.local");
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {}
  const lines = text.split("\n");
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.splice(lines.length && lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, `${k}=${v}`);
  }
  await writeFile(file, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
}

export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "";
  if (process.env.NODE_ENV !== "development" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; key?: string; vercel?: boolean };
  const url = (body.url ?? "").trim();
  const key = (body.key ?? "").trim();
  if (!URL_RE.test(url)) return Response.json({ error: "Project URL の形が違います（https://＜20文字＞.supabase.co）。" }, { status: 400 });
  if (!KEY_RE.test(key)) return Response.json({ error: "Publishable key の形が違います（sb_publishable_ で始まるもの）。secret キーは入れないでください。" }, { status: 400 });
  await writeEnvLocal({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
  const vercel: Record<string, string> = {};
  if (body.vercel) {
    for (const [name, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key],
    ] as const) {
      const err = await vercelEnvAdd(name, value);
      vercel[name] = err ? `失敗：${err}` : "入れました（production）";
    }
  }
  return Response.json({ envLocal: "書き込みました（.env.local）", vercel });
}
