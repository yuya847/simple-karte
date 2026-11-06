import { z } from 'zod';
import { anesthesiaMasterCandidates } from '@/lib/anesthesia-billing';
import type { Surgery } from '@/lib/surgery';
const schema = z.object({ age:z.number().nonnegative(), anesthesiaCase:z.object({ events:z.record(z.string(), z.number()), administrations:z.array(z.unknown()), vitals:z.array(z.unknown()), completedAt:z.number().optional(), preop:z.object({method:z.string()}), billingCategory:z.enum(['1','2','3','4','5']).optional(), management:z.enum(['I','II']).optional(), difficult:z.boolean().optional() }) });
export async function POST(request:Request) {
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return Response.json({error:'算定条件が読めません'}, {status:400});
  try { return Response.json(anesthesiaMasterCandidates(parsed.data as unknown as Surgery)); }
  catch { return Response.json({error:'マスターを読めません'}, {status:503}); }
}
