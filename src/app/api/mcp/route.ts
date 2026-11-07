import { limited } from "@/lib/rate-limit";
import { handleRpc } from "@/lib/mcp/server";
export function GET() { return new Response(null,{status:405,headers:{Allow:"POST"}}); }
export async function POST(request: Request) {
  if (limited(request)) return Response.json({error:"回数の上限です。時間をおいてください。"},{status:429});
  const text = await request.text();
  if (text.length > 60000) return new Response(null,{status:413});
  let value: unknown;
  try { value = JSON.parse(text); } catch { return Response.json({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}},{status:400}); }
  const r = await handleRpc(value,new URL(request.url).origin);
  return r.body ? Response.json(r.body,{status:r.status,headers:{"Cache-Control":"no-store"}}) : new Response(null,{status:r.status});
}
