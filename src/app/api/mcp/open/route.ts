import { decodePayload, encodePayload } from "@/lib/mcp/payload";
import { resolvePatient } from "@/lib/mcp/server";
import { limited } from "@/lib/rate-limit";
export function GET(request: Request) {
  if (limited(request)) return new Response(null,{status:429});
  try {
    const p = decodePayload(new URL(request.url).searchParams.get("d") ?? "");
    const c = resolvePatient(p.patient);
    if (!c) throw new Error();
    return new Response(null,{status:302,headers:{Location:`/?scenarios=100&open=${c.patient.id}#mcp=${encodePayload(p)}`,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  } catch { return Response.json({error:"下書きを開けません。仮IDと形式を確認してください。"},{status:400}); }
}
